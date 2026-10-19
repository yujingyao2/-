// 声音：
// - 背景音乐是一首本地的 30 秒循环曲（assets/audio/bgm-clear-loop.wav），
//   菜单、比赛、暂停共用同一首，不切歌。
// - 击球声是 Web Audio 现场合成的，力度越大越沉、越响。
// - 音乐/音效各走一条 GainNode，两套音量分开存。
//
// 浏览器不允许页面自动出声：第一次点击或按键时由 main.js 调 unlock()，
// 在这之前不会创建 AudioContext，也不会报 autoplay 错误。

import { readJSON, writeJSON } from './storage.js'

const STORE_KEY = 'badminton.audio'
const DEFAULTS = { music: 0.35, sfx: 0.55 }
const BGM_URL = 'assets/audio/bgm-clear-loop.wav'

function clamp01(v, fallback) {
  if (v === null || v === undefined || v === '') return fallback
  const n = Number(v)
  if (!isFinite(n)) return fallback
  return Math.max(0, Math.min(1, n))
}

export function loadAudioSettings() {
  const s = readJSON(STORE_KEY, null)
  return {
    music: clamp01(s && s.music, DEFAULTS.music),
    sfx: clamp01(s && s.sfx, DEFAULTS.sfx)
  }
}

export function saveAudioSettings(s) {
  writeJSON(STORE_KEY, {
    music: clamp01(s && s.music, DEFAULTS.music),
    sfx: clamp01(s && s.sfx, DEFAULTS.sfx)
  })
}

export function createAudio(initial, hooks) {
  const onError = hooks && hooks.onError
  const settings = {
    music: clamp01(initial && initial.music, DEFAULTS.music),
    sfx: clamp01(initial && initial.sfx, DEFAULTS.sfx)
  }

  let ctx = null
  let musicBus = null
  let sfxBus = null
  let noise = null
  let musicBuffer = null
  let musicLoading = false
  let musicSource = null

  function ensureContext() {
    if (ctx) return true
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return false

    try {
      ctx = new AC()
    } catch (e) {
      ctx = null
      return false
    }

    // 总线上加一个温和的压缩器，避免连续击球时叠得太响
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -20
    comp.knee.value = 24
    comp.ratio.value = 3
    comp.attack.value = 0.004
    comp.release.value = 0.25
    comp.connect(ctx.destination)

    // 音乐总线：录好的 BGM 本身已经做过动态，这里再留一点余量
    musicBus = ctx.createGain()
    musicBus.gain.value = 0.8 * settings.music
    musicBus.connect(comp)

    // 音效总线
    sfxBus = ctx.createGain()
    sfxBus.gain.value = 0.55 * settings.sfx
    sfxBus.connect(comp)

    // 一次性生成短噪声，后面每次击球复用
    const len = Math.max(1, Math.floor(ctx.sampleRate * 0.2))
    noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len)
    }

    loadMusic()
    return true
  }

  function loadMusic() {
    if (!ctx || musicBuffer || musicLoading) return
    musicLoading = true
    fetch(BGM_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.arrayBuffer()
      })
      .then(function (data) {
        return ctx.decodeAudioData(data)
      })
      .then(function (buf) {
        musicBuffer = buf
        musicLoading = false
        startMusic()
      })
      .catch(function (e) {
        musicLoading = false
        console.warn('背景音乐加载失败：', e)
        if (onError) onError(e)
      })
  }

  function startMusic() {
    if (!ctx || !musicBuffer || musicSource) return
    const src = ctx.createBufferSource()
    src.buffer = musicBuffer
    src.loop = true
    src.connect(musicBus)
    src.start(0)
    musicSource = src
  }

  function unlock() {
    if (!ensureContext()) return false
    if (ctx.state === 'suspended') {
      try {
        const p = ctx.resume()
        if (p && p.catch) p.catch(function () {})
      } catch (e) { /* 没有音频设备也不影响游戏 */ }
    }
    startMusic()
    return true
  }

  function setMusicVolume(v) {
    settings.music = clamp01(v, DEFAULTS.music)
    if (ctx && musicBus) {
      musicBus.gain.setTargetAtTime(0.8 * settings.music, ctx.currentTime, 0.08)
    }
    return settings.music
  }

  function setSfxVolume(v) {
    settings.sfx = clamp01(v, DEFAULTS.sfx)
    if (ctx && sfxBus) {
      sfxBus.gain.setTargetAtTime(0.55 * settings.sfx, ctx.currentTime, 0.05)
    }
    return settings.sfx
  }

  // power: 0~1，kind: 'smash' / 'net' / 'opponent' 等
  function hit(power, kind) {
    if (!ctx || settings.sfx <= 0.001 || !noise) return
    const p = clamp01(power, 0.7)
    const k = String(kind || '')
    const heavy = k.indexOf('smash') >= 0 || k.indexOf('net') >= 0 || p > 0.82
    const far = k === 'opponent'
    const t = ctx.currentTime
    const peak = (heavy ? 0.5 : 0.34) * (0.6 + 0.4 * p) * (far ? 0.45 : 1)

    // 拍线/球头接触的短噪声
    const src = ctx.createBufferSource()
    src.buffer = noise
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = far ? 1300 : (heavy ? 1500 : 2400)
    bp.Q.value = 0.85
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0, t)
    ng.gain.linearRampToValueAtTime(peak, t + 0.006)
    ng.gain.exponentialRampToValueAtTime(0.0008, t + 0.11)
    src.connect(bp)
    bp.connect(ng)
    ng.connect(sfxBus)
    src.start(t)
    src.stop(t + 0.14)

    // 低频“啪”，让扣杀有重量
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(far ? 150 : (heavy ? 190 : 260), t)
    osc.frequency.exponentialRampToValueAtTime(far ? 80 : (heavy ? 95 : 170), t + 0.09)
    const og = ctx.createGain()
    og.gain.setValueAtTime(0, t)
    og.gain.linearRampToValueAtTime(peak * 0.7, t + 0.004)
    og.gain.exponentialRampToValueAtTime(0.0008, t + 0.12)
    osc.connect(og)
    og.connect(sfxBus)
    osc.start(t)
    osc.stop(t + 0.14)
  }

  return {
    unlock: unlock,
    hit: hit,
    setMusicVolume: setMusicVolume,
    setSfxVolume: setSfxVolume,
    getSettings: function () {
      return { music: settings.music, sfx: settings.sfx }
    }
  }
}
