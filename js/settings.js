// 用户设置：鼠标灵敏度、音乐/音效音量、对手难度。
// 从 main.js 抽出来，统一处理滑杆、按钮、本地存储和 UI 同步。

import { SENS, AI_LEVELS } from './config.js'
import { readText, writeText } from './storage.js'
import { saveAudioSettings } from './audio.js'

const DIFF_STORE_KEY = 'badminton.difficulty'

export function createSettings(opts) {
  const ui = opts.ui
  const player = opts.player
  const audio = opts.audio
  const ai = opts.ai
  const onDifficultyChange = opts.onDifficultyChange

  function loadSens() {
    const raw = readText(SENS.storeKey, '')
    let v = parseFloat(raw)
    if (!(v >= SENS.min && v <= SENS.max)) v = SENS.def
    return v
  }

  function applySens(v, save) {
    const val = player.setSensitivity(v)
    ui.sens.value = String(val)
    ui.sensVal.textContent = val.toFixed(1) + '×'
    if (save) writeText(SENS.storeKey, val)
    return val
  }

  function volumeText(v) {
    return Math.round(v * 100) + '%'
  }

  function syncVolumeUI() {
    const s = audio.getSettings()
    ui.musicVol.value = String(s.music)
    ui.sfxVol.value = String(s.sfx)
    ui.musicVal.textContent = volumeText(s.music)
    ui.sfxVal.textContent = volumeText(s.sfx)
    ui.pauseMusicVol.value = String(s.music)
    ui.pauseSfxVol.value = String(s.sfx)
    ui.pauseMusicVal.textContent = volumeText(s.music)
    ui.pauseSfxVal.textContent = volumeText(s.sfx)
  }

  function setVolume(which, v) {
    audio.unlock()
    if (which === 'music') audio.setMusicVolume(v)
    else audio.setSfxVolume(v)
    syncVolumeUI()
    saveAudioSettings(audio.getSettings())
  }

  function bindVolume(el, which) {
    el.addEventListener('input', function () {
      setVolume(which, parseFloat(el.value))
    })
  }

  function loadDifficulty() {
    const key = readText(DIFF_STORE_KEY, 'normal')
    return AI_LEVELS[key] ? key : 'normal'
  }

  let difficultyKey = loadDifficulty()

  function applyDifficulty(key, save) {
    if (!AI_LEVELS[key]) key = 'normal'
    difficultyKey = key
    ai.setDifficulty(key)
    const buttons = document.querySelectorAll('.diff-btns button')
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i]
      const on = b.dataset.diff === key
      b.classList.toggle('on', on)
      b.setAttribute('aria-pressed', on ? 'true' : 'false')
    }
    if (ui.diffHint) ui.diffHint.textContent = AI_LEVELS[key].hint
    if (save) writeText(DIFF_STORE_KEY, key)
  }

  applySens(loadSens(), false)
  syncVolumeUI()
  applyDifficulty(difficultyKey, false)

  ui.sens.addEventListener('input', function () {
    applySens(parseFloat(ui.sens.value), true)
  })
  bindVolume(ui.musicVol, 'music')
  bindVolume(ui.sfxVol, 'sfx')
  bindVolume(ui.pauseMusicVol, 'music')
  bindVolume(ui.pauseSfxVol, 'sfx')

  const diffButtons = document.querySelectorAll('.diff-btns button')
  for (let i = 0; i < diffButtons.length; i++) {
    diffButtons[i].addEventListener('click', function (e) {
      e.stopPropagation()
      const key = this.dataset.diff
      applyDifficulty(key, true)
      if (onDifficultyChange) onDifficultyChange(key)
    })
  }

  // 暂停面板本身是"点空白继续"，音量条/难度按钮上的操作不能冒泡过去
  ui.pauseVol.addEventListener('pointerdown', function (e) { e.stopPropagation() })
  ui.pauseVol.addEventListener('click', function (e) { e.stopPropagation() })

  return {
    applySens: applySens,
    applyDifficulty: applyDifficulty,
    setVolume: setVolume,
    difficulty: function () { return difficultyKey }
  }
}
