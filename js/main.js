// 主循环：菜单 → 比赛 或 教学关卡。
//
// 性能上有三件事是特意做的，改代码时别好心改回去：
//   1. AI 的落点预判每 0.12 秒才算一次（一次要跑上千个物理小步）
//   2. HUD 不是每帧都写 DOM，分快慢两档刷新
//   3. 帧率掉下来时自动降渲染分辨率

import THREE from './three.js'
import { COURT, PLAYER, TUTORIAL, SENS, SHOT_TABLE, AI_LEVELS } from './config.js'
import { buildScene } from './scene.js'
import { createPlayer } from './player.js'
import { createAI } from './ai.js'
import { makeShuttle } from './character.js'
import { createTrail, createFx, makeBlobShadow } from './fx.js'
import { createSkinPanel } from './skinui.js'
import { SKIN_STORE_KEY, cleanSkin, loadSkinLibrary, activeSkin } from './skin.js'
import { createAudio, loadAudioSettings } from './audio.js'
import { createSettings } from './settings.js'
import { toast, bootReady } from './feedback.js'
import { writeJSON } from './storage.js'
import * as physics from './physics.js'
import * as rules from './rules.js'
import * as lessons from './lessons.js'

const canvas = document.getElementById('game')
const ui = {
  hud: document.getElementById('hud'),
  menu: document.getElementById('menu'),
  menuStart: document.getElementById('menu-start'),
  menuTutorial: document.getElementById('menu-tutorial'),
  menuSkin: document.getElementById('menu-skin'),
  lessons: document.getElementById('lessons'),
  lessonList: document.getElementById('lesson-list'),
  lessonFree: document.getElementById('lesson-free'),
  lessonBack: document.getElementById('lesson-back'),
  sens: document.getElementById('sens'),
  sensVal: document.getElementById('sens-val'),
  musicVol: document.getElementById('music-vol'),
  musicVal: document.getElementById('music-val'),
  sfxVol: document.getElementById('sfx-vol'),
  sfxVal: document.getElementById('sfx-val'),
  diffHint: document.getElementById('diff-hint'),
  paused: document.getElementById('paused'),
  pauseResume: document.getElementById('pause-resume'),
  pauseVol: document.getElementById('pause-vol'),
  pauseMusicVol: document.getElementById('pause-music-vol'),
  pauseMusicVal: document.getElementById('pause-music-val'),
  pauseSfxVol: document.getElementById('pause-sfx-vol'),
  pauseSfxVal: document.getElementById('pause-sfx-val'),
  pauseSkin: document.getElementById('pause-skin'),
  pauseLessons: document.getElementById('pause-lessons'),
  pauseMenu: document.getElementById('pause-menu'),
  score: document.getElementById('score'),
  grip: document.getElementById('grip'),
  msg: document.getElementById('msg'),
  powerFill: document.getElementById('power-fill'),
  powerWrap: document.getElementById('power'),
  shot: document.getElementById('shot'),
  keys: document.getElementById('keys'),
  tut: document.getElementById('tut'),
  tutStep: document.getElementById('tut-step'),
  tutTitle: document.getElementById('tut-title'),
  tutBody: document.getElementById('tut-body'),
  tutKeys: document.getElementById('tut-keys'),
  tutFb: document.getElementById('tut-fb'),
  gauge: document.getElementById('gauge'),
  gaugeMarker: document.getElementById('gauge-marker'),
  fps: document.getElementById('fps'),
  over: document.getElementById('over'),
  overScore: document.getElementById('over-score'),
  overTitle: document.getElementById('over-title'),
  overAgain: document.getElementById('over-again'),
  overMenu: document.getElementById('over-menu')
}

// antialias 关掉：1920 宽的窗口开 MSAA，等于每个像素多采好几次样，
// 这是纯粹的填充率开销。画质靠自适应分辨率补，比 MSAA 划算得多。
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: false,
  powerPreference: 'high-performance'
})
const BASE_PR = Math.min(window.devicePixelRatio || 1, 1.25)
renderer.setPixelRatio(BASE_PR)
renderer.shadowMap.enabled = false   // 改用贴地的假影子

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0f1720)
scene.fog = new THREE.Fog(0x0f1720, 20, 42)

const camera = new THREE.PerspectiveCamera(74, 1, 0.05, 200)
scene.add(camera)

buildScene(scene)
const player = createPlayer(camera, scene)
const ai = createAI(scene)
const shuttleMesh = makeShuttle()
scene.add(shuttleMesh)
const trail = createTrail(scene)
const fx = createFx(scene)

// 三个假影子：玩家、对手、羽毛球
const playerShadow = makeBlobShadow(1.15)
const aiShadow = makeBlobShadow(1.15)
const shuttleShadow = makeBlobShadow(0.55)
playerShadow.position.y = 0.012
aiShadow.position.y = 0.012
shuttleShadow.position.y = 0.014
scene.add(playerShadow)
scene.add(aiShadow)
scene.add(shuttleShadow)

const loadNote = document.getElementById('load-note')
if (loadNote) loadNote.textContent = '球场已就绪 · 先在教学关卡里熟悉一下，再打比赛'

// ---------- 声音 ----------
// 背景音乐是本地循环文件；击球声用 Web Audio 现场合成。
// 浏览器要求先有用户操作才能出声，所以第一次点击/按键时才 unlock。

const audio = createAudio(loadAudioSettings(), {
  onError: function () {
    toast('背景音乐加载失败，击球音效仍可用', 'error', 3600)
  }
})

window.addEventListener('pointerdown', function () { audio.unlock() }, { once: true })
window.addEventListener('keydown', function () { audio.unlock() }, { once: true })

// ---------- 球拍皮肤 ----------
// 皮肤库存在 localStorage 的 badminton.skins：内置预设 + 多个自定义存档。
// 旧的单存档 badminton.skin 会自动迁移成"我的球拍"。

const skinLibrary = loadSkinLibrary()
player.applySkin(activeSkin(skinLibrary))

const skinPanel = createSkinPanel({
  onApply: function (s) {
    const cleaned = cleanSkin(s)
    player.applySkin(cleaned)
    if (!writeJSON(SKIN_STORE_KEY, cleaned)) {
      toast('皮肤已应用，但本地存档写入失败', 'error', 3200)
    }
    if (loadNote) loadNote.textContent = '皮肤已保存 · 开局按 F 凑近看拍面'
  }
})

const shuttle = physics.createShuttle(0, 1.1, 4.4)
let phase = 'menu'        // menu | lessons | serve | rally | point | over | tutorial
let mode = 'match'        // match | tutorial
let paused = false        // Esc 打开暂停面板时，真正停住球和 AI
let serving = false
let serveStage = 'ready'
let tossLaunched = false
let aiServing = false
let lastHitter = 1
let serverX = 0
let pendingShot = null
let swingUsed = false
let msgTimer = 0
let lastServeAt = 0
let shakeT = 0
let shakeDur = 0.2
let shakeMag = 0
let match = rules.createMatch()
const clock = new THREE.Clock()

const tut = {
  index: 0, free: false, hold: false, timer: 0, advance: false,
  feedAt: 0, feedY: 1.5, finishAll: false, serveHit: false
}
let doneMap = {}
let freeHintAt = 0

// ---------- 设置（灵敏度 / 音量 / 难度） ----------

const settings = createSettings({
  ui: ui,
  player: player,
  audio: audio,
  ai: ai,
  onDifficultyChange: function (key) {
    if (phase !== 'menu' && phase !== 'lessons') {
      say('对手难度：' + AI_LEVELS[key].label, 1.1)
    }
  }
})

// ---------- 窗口与画质 ----------

function resize() {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

// 帧率掉下来就降一点渲染分辨率，回来再升回去。只在跨阈值时才动，
// 因为改分辨率会重建画布，本身就有一次小卡。
let qualityLevel = 0
let fpsAcc = 0
let fpsFrames = 0

function setQuality(level) {
  if (level === qualityLevel) return
  qualityLevel = level
  const pr = level === 0 ? 1 : (level === 1 ? 0.72 : 0.5)
  renderer.setPixelRatio(BASE_PR * pr)
  if (level >= 2) say('帧率偏低，画面自动简化了', 2.0)
  resize()
}

function adaptQuality(dt) {
  fpsAcc += dt
  fpsFrames++
  if (fpsAcc < 1.2) return
  const fps = fpsFrames / fpsAcc
  fpsAcc = 0
  fpsFrames = 0
  setText(ui.fps, Math.round(fps) + ' 帧 · 画质 ' + (3 - qualityLevel) + '/3')
  // 掉到 45 帧以下就降一档，回到 58 帧以上再升回去
  if (fps < 45 && qualityLevel < 2) setQuality(qualityLevel + 1)
  else if (fps > 58 && qualityLevel > 0) setQuality(qualityLevel - 1)
}

function say(text, seconds) {
  ui.msg.textContent = text
  ui.msg.style.opacity = '1'
  msgTimer = seconds || 1.8
}

// ---------- 全屏：防浏览器抢快捷键 ----------
//
// 蹲下用的是 Ctrl，而浏览器里 Ctrl+W 是关标签页、Ctrl+R 是刷新，
// 这两种页面拦不住（preventDefault 对它们无效）。
// 但全屏状态下浏览器会屏蔽掉这类标签级快捷键，这是网页游戏通用的做法。
// 剩下能拦的（Ctrl+S / Ctrl+P / Ctrl+R 之类）见下面的 keydown。

// 鼠标锁有时候会被浏览器拒（比如刚用 Esc 退出过），隔一点时间重试两次
function lockPointer(tries) {
  const n = tries || 0
  let p = null
  try {
    p = canvas.requestPointerLock()
  } catch (e) {
    p = null
  }
  if (p && p.catch) {
    p.catch(function () {
      if (n < 3) setTimeout(function () { lockPointer(n + 1) }, 200)
    })
  }
}

function goFullscreen() {
  const el = document.documentElement
  const already = document.fullscreenElement || document.webkitFullscreenElement
  if (already) {
    lockKeyboard()
    lockPointer()
    return
  }
  const fn = el.requestFullscreen || el.webkitRequestFullscreen
  if (!fn) {
    lockPointer()
    return
  }
  try {
    const p = fn.call(el)
    if (p && p.then) {
      // 键盘接管必须等全屏生效之后再请求，否则会被拒
      p.then(function () {
        lockKeyboard()
        lockPointer()
      }).catch(function () {
        lockPointer()
      })
    } else {
      lockKeyboard()
      lockPointer()
    }
  } catch (e) {
    lockPointer()
  }
}

function exitFullscreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) return
  unlockKeyboard()
  const fn = document.exitFullscreen || document.webkitExitFullscreen
  if (!fn) return
  try {
    const p = fn.call(document)
    if (p && p.catch) p.catch(function () {})
  } catch (e) { /* 忽略 */ }
}

function toggleFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) exitFullscreen()
  else goFullscreen()
}

// ---------- 接管键盘 ----------
//
// 全屏本身**挡不住** Ctrl+W（我上一版以为能挡，判断错了）。
// 真正能挡的是浏览器的 Keyboard Lock API：全屏状态下调用它，
// 被锁的物理键不会再触发浏览器快捷键——网页游戏就是靠这个。
// 需要 Chrome/Edge 桌面版；不支持时安静地跳过，靠全屏 + C 键兜底。

const LOCK_KEYS = [
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyE', 'KeyQ', 'KeyR',
  'ControlLeft', 'ControlRight', 'Space', 'Tab',
  'BracketLeft', 'BracketRight'
]

let keyboardLocked = false

function lockKeyboard() {
  if (!navigator.keyboard || !navigator.keyboard.lock) return
  try {
    const p = navigator.keyboard.lock(LOCK_KEYS)
    if (p && p.then) {
      p.then(function () { keyboardLocked = true })
        .catch(function () { keyboardLocked = false })
    } else {
      keyboardLocked = true
    }
  } catch (e) {
    keyboardLocked = false
  }
}

function unlockKeyboard() {
  keyboardLocked = false
  if (navigator.keyboard && navigator.keyboard.unlock) {
    try { navigator.keyboard.unlock() } catch (e) { /* 忽略 */ }
  }
}

function shake(mag, dur) {
  shakeMag = Math.max(shakeMag, mag)
  shakeT = Math.max(shakeT, dur)
  shakeDur = Math.max(shakeDur, dur)
}

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text
}

// ---------- HUD ----------

let hudSlowAt = 0
let hudFastAt = 0
let lastGripShown = ''

function gaugeNames(grip) {
  const pick = function (whens) {
    return SHOT_TABLE.filter(function (s) {
      return s.grip === grip && whens.indexOf(s.when) >= 0
    }).map(function (s) { return s.label }).join(' / ')
  }
  return { high: pick(['high', 'nethigh', 'jump']), mid: pick(['mid']), low: pick(['low']) }
}

function fillGauge(names) {
  const bands = ui.gauge.querySelectorAll('.g-band')
  const order = ['high', 'mid', 'low']
  for (let i = 0; i < bands.length; i++) {
    setText(bands[i].querySelector('.g-name'), names[order[i]])
  }
}

function currentShot(power) {
  return rules.classifyShot({
    grip: player.grip(),
    contactY: shuttle.y,
    playerZ: player.state.pos.z,
    airborne: player.airborne(),
    crouch: player.crouching(),
    power: power
  })
}

function updateGauge(t) {
  if (t - hudSlowAt < 0.1) return
  hudSlowAt = t

  const grip = player.grip()
  setText(ui.grip, rules.gripLabel(grip))
  if (grip !== lastGripShown) {
    lastGripShown = grip
    fillGauge(gaugeNames(grip))
    if (grip === 'backhand') ui.grip.classList.add('bh')
    else ui.grip.classList.remove('bh')
  }

  setText(ui.score, mode === 'tutorial'
    ? '第 ' + (tut.index + 1) + ' / ' + lessons.total() + ' 节'
    : rules.scoreText(match))

  const bottom = Math.round((Math.max(0, Math.min(3, shuttle.y)) / 3) * 100) + '%'
  if (ui.gaugeMarker.style.bottom !== bottom) ui.gaugeMarker.style.bottom = bottom
}

function updateMeter(t) {
  if (t - hudFastAt < 0.05) return
  hudFastAt = t
  if (player.charging()) {
    const p = player.chargeRatio(performance.now())
    ui.powerWrap.classList.add('on')
    ui.powerFill.style.width = Math.round(p * 100) + '%'
    setText(ui.shot, currentShot(p).label)
  } else if (ui.powerWrap.classList.contains('on')) {
    ui.powerWrap.classList.remove('on')
    ui.powerFill.style.width = '0%'
  }
}

// ---------- 比赛流程 ----------

function holdShuttleForServe() {
  shuttle.x = player.state.pos.x
  shuttle.y = 1.05
  shuttle.z = player.state.pos.z - 0.42
  shuttle.vx = shuttle.vy = shuttle.vz = 0
}

function placeForServe() {
  const isPlayerServer = match.server > 0
  serverX = isPlayerServer ? 1.2 : -1.2
  if (isPlayerServer) {
    player.state.pos.set(serverX, 0, 4.0)
    player.state.vel.set(0, 0, 0)
    player.state.yaw = 0
    ai.reset()
  } else {
    ai.state.pos.set(serverX, 0, -4.0)
    player.state.pos.set(0, 0, 4.4)
    player.state.vel.set(0, 0, 0)
  }
  trail.clear()
  serveStage = 'ready'
  tossLaunched = false
  aiServing = false
  phase = 'serve'
  serving = true
  lastServeAt = performance.now()
  swingUsed = false
  if (isPlayerServer) {
    holdShuttleForServe()
    say('按 E 抛球，等球落到拍面附近时松开左键挥拍', 3.0)
  } else {
    say('对手发球', 1.6)
  }
}

// 比赛结束的结算面板：必须有能点的按钮，光靠一行"按 R"会把人卡死
function showOver() {
  ui.over.classList.add('on')
  setText(ui.overScore, rules.scoreText(match))
  setText(ui.overTitle, match.winner > 0 ? '你赢了' : '这局输了')
}

function endPoint(winner, reason) {
  if (phase === 'over' || phase === 'point') return
  rules.awardPoint(match, winner)
  say(reason + '　' + (winner > 0 ? '你得分' : '对手得分'), 2.0)
  trail.clear()
  if (match.over) {
    phase = 'over'
    showOver()
    if (document.exitPointerLock) document.exitPointerLock()
    return
  }
  phase = 'point'
  setTimeout(placeForServe, 900)
}

function onGround() {
  if (serving && match.server > 0 && phase === 'serve') {
    say('没打到球，再抛一次', 1.5)
    serveStage = 'ready'
    tossLaunched = false
    trail.clear()
    holdShuttleForServe()
    return
  }
  if (serving) {
    const ok = rules.serveCourtOk(shuttle.x, shuttle.z, serverX, match.server)
    if (!ok) {
      endPoint(-lastHitter, '发球违例')
      return
    }
  }
  const winner = rules.judgeLanding(shuttle.x, shuttle.z, lastHitter)
  const where = rules.inSingles(shuttle.x, shuttle.z) ? '落在界内' : '出界'
  endPoint(winner, (lastHitter > 0 ? '你' : '对手') + '打出的球' + where)
}

// ---------- 教学关卡 ----------

function showLessons() {
  mode = 'tutorial'
  phase = 'lessons'
  paused = false
  player.endInspect()
  ui.paused.classList.remove('on')
  ui.over.classList.remove('on')
  unlockKeyboard()
  doneMap = lessons.loadDone()
  lessons.renderList(ui.lessonList, doneMap)
  ui.tut.classList.remove('on')
  ui.menu.classList.remove('on')
  ui.lessons.classList.add('on')
  player.setBodyVisible(true)
  player.state.pos.set(1.2, 0, 4.0)
  if (document.exitPointerLock) document.exitPointerLock()
}

function showStep() {
  const step = TUTORIAL[tut.index]
  const n = lessons.doneCount(doneMap)
  ui.tut.classList.add('on')
  setText(ui.tutStep, '第 ' + (tut.index + 1) + ' / ' + lessons.total() + ' 节（已过 ' + n + ' 节）')
  setText(ui.tutTitle, step.title)
  setText(ui.tutBody, step.body)
  setText(ui.tutKeys, step.keys)
  setText(ui.tutFb, '')
  ui.tutFb.className = 'tut-fb'
}

function showFreePanel() {
  ui.tut.classList.add('on')
  setText(ui.tutStep, '自由练习')
  setText(ui.tutTitle, '随便打')
  setText(ui.tutBody, '球会随机出现在不同高度，没有对错。右边标尺告诉你这个高度会打出什么球，练到你不用看它为止。')
  setText(ui.tutFb, '')
  ui.tutFb.className = 'tut-fb'
}

function feedback(text, good) {
  setText(ui.tutFb, text)
  ui.tutFb.className = 'tut-fb ' + (good ? 'good' : 'bad')
}

function feedForStep() {
  const step = TUTORIAL[tut.index]
  if (!step) return
  if (step.goal === 'move') {
    player.resetCounters()
    tut.hold = false
    return
  }
  if (step.goal === 'serve') {
    tut.hold = false
    tut.serveHit = false
    player.state.pos.set(1.2, 0, 4.0)
    player.state.yaw = 0
    serveStage = 'ready'
    tossLaunched = false
    serving = true
    holdShuttleForServe()
    return
  }
  tut.hold = true
  if (step.standAt) player.state.pos.z = Math.max(step.standAt, 0.5)
}

function startLesson(i) {
  audio.unlock()
  tut.index = i
  tut.free = false
  tut.hold = false
  tut.timer = 0
  tut.advance = false
  tut.serveHit = false
  mode = 'tutorial'
  phase = 'tutorial'
  paused = false
  player.endInspect()
  ui.lessons.classList.remove('on')
  player.setBodyVisible(false)
  player.setGrip(TUTORIAL[i].grip || 'forehand')
  lastGripShown = ''
  player.state.pos.set(1.2, 0, 4.0)
  player.state.yaw = 0
  player.state.pitch = -0.05
  goFullscreen()
  showStep()
  feedForStep()
}

function startFreePractice() {
  audio.unlock()
  tut.free = true
  tut.hold = false
  tut.timer = 0
  mode = 'tutorial'
  phase = 'tutorial'
  paused = false
  player.endInspect()
  ui.lessons.classList.remove('on')
  player.setBodyVisible(false)
  player.state.pos.set(0, 0, 3.4)
  player.state.yaw = 0
  player.state.pitch = -0.05
  goFullscreen()
  showFreePanel()
  feedFree()
  say('自由练习：球会随机换高度', 2.2)
}

const FREE_HEIGHTS = [0.75, 1.5, 2.35]

function feedFree() {
  const y = FREE_HEIGHTS[Math.floor(Math.random() * FREE_HEIGHTS.length)]
  tut.feedY = y
  tut.hold = true
  tut.feedAt = performance.now()
}

function passCurrentLesson() {
  const step = TUTORIAL[tut.index]
  if (step) doneMap = lessons.markDone(step.id)
  tut.advance = true
}

function advanceLesson() {
  if (tut.index + 1 >= TUTORIAL.length) {
    feedback('全部练完了，回到列表随时重练', true)
    tut.timer = 1.6
    tut.advance = false
    tut.finishAll = true
    return
  }
  tut.index++
  showStep()
  feedForStep()
}

function judgeTutorialShot(shot) {
  const step = TUTORIAL[tut.index]
  if (!step || step.goal.indexOf('shot:') !== 0) return
  const want = step.goal.slice(5)
  const wantLabel = rules.shotByKey(want).label

  if (shot.key === want) {
    feedback('对！这就是' + shot.label, true)
    passCurrentLesson()
  } else {
    let why
    if (step.requireAir && !player.airborne()) {
      why = '这一节要跳起来打：按空格起跳，趁在空中松开左键'
    } else if (step.requireCrouch && !player.crouching()) {
      why = '这一节要蹲下来打：按住 Ctrl（或 C）再挥'
    } else if (step.grip && player.grip() !== step.grip) {
      why = '握拍不对：先按 Q 换成' + rules.gripLabel(step.grip)
    } else if (want === 'fh_net') {
      why = '站得离网太远（要站到 1.9 米内），往前走再挥'
    } else {
      why = '打出来的是' + shot.label + '，这一节要的是' + wantLabel
    }
    feedback(why, false)
    tut.advance = false
  }
  tut.timer = tut.advance ? 1.2 : 1.5
}

function tutorialTick(dt, t) {
  if (tut.free) {
    if (tut.timer > 0) {
      tut.timer -= dt
      if (tut.timer <= 0) feedFree()
      return
    }
    if (tut.hold) {
      holdFedBall(tut.feedY)
      playerHitCheck()
    }
    // 打出去的球落地或者飞远了就换一颗
    if (!tut.hold && shuttle.y <= 0.05) {
      tut.timer = 0.5
    } else if (!tut.hold && performance.now() - tut.feedAt > 2600) {
      tut.timer = 0.2
    }
    if (t - freeHintAt > 0.1) {
      freeHintAt = t
      setText(ui.tutKeys, '现在球在 ' + shuttle.y.toFixed(1) + ' 米　挥拍会打出「' +
        currentShot(1).label + '」')
    }
    return
  }

  const step = TUTORIAL[tut.index]
  if (!step) return

  if (tut.timer > 0) {
    tut.timer -= dt
    if (tut.timer <= 0) {
      if (tut.finishAll) {
        tut.finishAll = false
        showLessons()
      } else if (tut.advance) {
        advanceLesson()
      } else {
        feedForStep()
      }
    }
    return
  }

  if (step.goal === 'move') {
    setText(ui.tutKeys, '已走 ' + player.state.walked.toFixed(1) + ' / ' + step.needWalk +
      ' 米　跳了 ' + player.state.jumps + ' / ' + step.needJump + ' 次')
    if (player.state.walked >= step.needWalk && player.state.jumps >= step.needJump) {
      feedback('脚步挺利索，下一节', true)
      passCurrentLesson()
      tut.timer = 1.2
    }
    return
  }

  if (step.goal === 'serve') {
    if (serveStage === 'ready') {
      holdShuttleForServe()
      return
    }
    tossTick(dt)
    if (tut.serveHit) {
      feedback('发球成功', true)
      passCurrentLesson()
      tut.timer = 1.2
    }
    return
  }

  if (tut.hold) {
    holdFedBall(step.feedY)
    playerHitCheck()
  }
}

// 教练喂的球：挂在玩家正前方指定高度，跟着人走
const holdDir = new THREE.Vector3()
function holdFedBall(y) {
  camera.getWorldDirection(holdDir)
  holdDir.y = 0
  if (holdDir.lengthSq() < 1e-5) holdDir.set(0, 0, -1)
  holdDir.normalize()
  shuttle.x = player.state.pos.x + holdDir.x * 0.6
  shuttle.z = player.state.pos.z + holdDir.z * 0.6
  shuttle.y = y
  shuttle.vx = shuttle.vy = shuttle.vz = 0
}

// ---------- 碰撞 ----------

const hitDir = new THREE.Vector3()

function playerHitCheck() {
  if (swingUsed || !pendingShot) return
  if (!player.inSwingWindow()) return

  camera.getWorldDirection(hitDir)
  hitDir.y = 0
  if (hitDir.lengthSq() < 1e-5) hitDir.set(0, 0, -1)
  hitDir.normalize()

  const inBox = rules.inHitBox(
    { x: shuttle.x, y: shuttle.y, z: shuttle.z },
    { x: player.state.pos.x, y: player.state.pos.y, z: player.state.pos.z },
    { x: hitDir.x, z: hitDir.z },
    PLAYER.hitBox
  )
  if (!inBox) return

  let pitch = pendingShot.pitchDeg
  let speed = pendingShot.speed
  let sx = hitDir.x
  let sz = hitDir.z

  const inTutorial = mode === 'tutorial' && phase === 'tutorial'
  const isServe = serving

  if (isServe) {
    pitch = 30
    speed = 22 + 14 * pendingShot.power
    const tgtX = -Math.sign(serverX || 1) * COURT.halfWidthSingles * 0.55
    const tgtZ = -COURT.halfLength * 0.55
    const ax = tgtX - shuttle.x
    const az = tgtZ - shuttle.z
    const al = Math.sqrt(ax * ax + az * az) || 1
    const k = PLAYER.serveAimAssist
    sx = hitDir.x * (1 - k) + (ax / al) * k
    sz = hitDir.z * (1 - k) + (az / al) * k
    const sl = Math.sqrt(sx * sx + sz * sz) || 1
    sx /= sl
    sz /= sl
  }

  const v = physics.velocityFrom(sx, sz, pitch, speed)
  shuttle.vx = v.vx
  shuttle.vy = v.vy
  shuttle.vz = v.vz
  shuttle.y = Math.max(shuttle.y, 0.5)

  swingUsed = true
  lastHitter = 1
  if (isServe) {
    serving = false
    if (inTutorial) {
      // 教学里的发球那一节：打出去就算过，不判发球规则
      if (!tut.free && TUTORIAL[tut.index].goal === 'serve') tut.serveHit = true
    } else {
      phase = 'rally'
    }
  }

  const big = pendingShot.power > 0.82 || /smash|net/.test(pendingShot.key)
  audio.hit(pendingShot.power, pendingShot.key)
  const vlen = Math.sqrt(shuttle.vx * shuttle.vx + shuttle.vy * shuttle.vy + shuttle.vz * shuttle.vz) || 1
  fx.spawn(
    new THREE.Vector3(shuttle.x, shuttle.y, shuttle.z),
    new THREE.Vector3(shuttle.vx / vlen, shuttle.vy / vlen, shuttle.vz / vlen),
    big
  )
  shake(big ? 0.075 : 0.04, big ? 0.24 : 0.16)

  if (inTutorial) {
    tut.hold = false
    tut.feedAt = performance.now()
    if (!tut.free) judgeTutorialShot(pendingShot)
    else feedback(pendingShot.label, true)
  } else {
    say(pendingShot.label + '！', 0.9)
  }
}

// ---------- 输入 ----------

window.addEventListener('keydown', function (e) {
  // 蹲下是 Ctrl，先把浏览器能拦的 Ctrl+字母都拦掉（Ctrl+W 那种拦不住的靠全屏）。
  // Ctrl+I / Ctrl+J 留着不拦，那是开发者工具，调试要用。
  if (e.ctrlKey && /^Key[A-Za-z]$/.test(e.code) && e.code !== 'KeyI' && e.code !== 'KeyJ') {
    e.preventDefault()
  }
  if (e.code === 'Space') e.preventDefault()
  player.key(e.code, true)
  // G 切全屏；F 留给"轻抚球拍"的检视动作
  if (e.code === 'KeyG') toggleFullscreen()
  if (e.code === 'KeyF' && !e.repeat &&
      (phase === 'serve' || phase === 'rally' || phase === 'tutorial')) {
    if (player.startInspect()) say('看看你的拍子', 1.2)
  }
  if (e.code === 'KeyH') ui.keys.classList.toggle('on')
  // 只有 Esc 能退出（Esc 由浏览器负责解锁鼠标，触发暂停菜单）。
  // R 只在结算面板上等于"再来一局"，不再承担退出功能。
  if (e.code === 'KeyR' && phase === 'over') {
    ui.over.classList.remove('on')
    startGame()
  }
  if (e.code === 'Tab' && phase === 'tutorial') {
    e.preventDefault()
    showLessons()
  }
  if (e.code === 'KeyQ' && (phase === 'rally' || phase === 'serve' || phase === 'tutorial')) {
    const next = rules.nextGrip(player.grip())
    const before = player.grip()
    player.setGrip(next)
    if (player.grip() !== before) {
      // 牌子闪一下，配合球拍翻转的动画
      ui.grip.classList.add('pop')
      setTimeout(function () { ui.grip.classList.remove('pop') }, 420)
    }
    say('换成' + rules.gripLabel(next) + '握拍', 1.0)
  }
  if (e.code === 'KeyE' && phase === 'serve' && match.server > 0 && serveStage === 'ready') {
    player.startToss()
    serveStage = 'tossed'
    tossLaunched = false
  }
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
    const d = e.code === 'BracketRight' ? SENS.step : -SENS.step
    const v = settings.applySens(player.sensitivity() + d, true)
    say('鼠标灵敏度 ' + v.toFixed(1) + '×', 1.0)
  }
})
window.addEventListener('keyup', function (e) {
  player.key(e.code, false)
})

document.addEventListener('mousemove', function (e) {
  if (document.pointerLockElement === canvas) player.look(e.movementX, e.movementY)
})

canvas.addEventListener('mousedown', function (e) {
  if (phase === 'menu' || phase === 'lessons' || phase === 'over') return
  if (document.pointerLockElement !== canvas) {
    lockPointer()
    return
  }
  player.startCharge(e.button === 2 ? 'right' : 'left', performance.now())
  // 教学的发球那一节：按下就是抛球，走真实流程
  if (mode === 'tutorial' && phase === 'tutorial' && !tut.free &&
      TUTORIAL[tut.index].goal === 'serve' && serveStage === 'ready') {
    player.startToss()
    serveStage = 'tossed'
    tossLaunched = false
    serving = true
  }
})

window.addEventListener('mouseup', function (e) {
  if (phase === 'menu' || phase === 'lessons' || phase === 'over') return
  const input = player.releaseCharge(performance.now())
  if (!input) return
  pendingShot = currentShot(input.power)
  player.beginSwing(pendingShot.path)
  swingUsed = false
})

canvas.addEventListener('contextmenu', function (e) { e.preventDefault() })

document.addEventListener('pointerlockchange', function () {
  const locked = document.pointerLockElement === canvas
  const playing = phase === 'serve' || phase === 'rally' || phase === 'tutorial'
  document.body.classList.toggle('paused-mode', !locked && playing)
  if (!locked && playing) {
    paused = true
    // 只有教学里才给"回到课程列表"这个选项
    const inLesson = phase === 'tutorial' && !tut.free
    ui.pauseLessons.style.display = inLesson ? 'block' : 'none'
    ui.paused.classList.add('on')
  } else {
    paused = false
    ui.paused.classList.remove('on')
  }
})

// 进全屏有可能把鼠标锁顶掉，这里补一次；失败也没关系，点一下画面就恢复。
// 反过来，按 Esc 退出全屏时要把键盘还给浏览器，否则在菜单里 Ctrl+W 也会被吃掉。
document.addEventListener('fullscreenchange', function () {
  if (!document.fullscreenElement) {
    unlockKeyboard()
    return
  }
  const playing = phase === 'serve' || phase === 'rally' || phase === 'tutorial'
  if (playing && document.pointerLockElement !== canvas) lockPointer()
})

function resumeGame() {
  paused = false
  document.body.classList.remove('paused-mode')
  ui.paused.classList.remove('on')
  // 继续游戏时重新进全屏并接管键盘：按 Esc 退出全屏后，
  // 键盘保护会跟着失效，不重新锁一次 Ctrl+W 就又能关标签页了
  goFullscreen()
}

ui.pauseResume.addEventListener('click', function (e) {
  e.stopPropagation()
  resumeGame()
})
ui.pauseLessons.addEventListener('click', function (e) {
  e.stopPropagation()
  ui.paused.classList.remove('on')
  showLessons()
})
ui.pauseMenu.addEventListener('click', function (e) {
  e.stopPropagation()
  ui.paused.classList.remove('on')
  restart()
})
// 点空白处也当"继续"，按钮上的点击不会冒泡到这里
ui.paused.addEventListener('click', resumeGame)
ui.menuStart.addEventListener('click', function () { startGame() })
ui.menuTutorial.addEventListener('click', function () { showLessons() })
ui.menuSkin.addEventListener('click', function () { skinPanel.open() })
ui.pauseSkin.addEventListener('click', function (e) {
  e.stopPropagation()
  skinPanel.open()
})
ui.lessonFree.addEventListener('click', function () { startFreePractice() })
ui.lessonBack.addEventListener('click', function () {
  ui.lessons.classList.remove('on')
  ui.menu.classList.add('on')
  phase = 'menu'
  mode = 'match'
  player.setBodyVisible(true)
})
ui.lessonList.addEventListener('click', function (e) {
  let el = e.target
  while (el && el !== ui.lessonList && !el.dataset.i) el = el.parentNode
  if (el && el.dataset && el.dataset.i !== undefined) startLesson(Number(el.dataset.i))
})
// 结算面板：再来一局 / 回到主菜单
ui.overAgain.addEventListener('click', function () {
  ui.over.classList.remove('on')
  startGame()
})
ui.overMenu.addEventListener('click', function () {
  ui.over.classList.remove('on')
  restart()
})

function startGame() {
  audio.unlock()
  mode = 'match'
  paused = false
  player.endInspect()
  ui.menu.classList.remove('on')
  ui.lessons.classList.remove('on')
  ui.tut.classList.remove('on')
  ui.over.classList.remove('on')
  match = rules.createMatch()
  player.state.pos.set(1.2, 0, 4.0)
  player.state.yaw = 0
  player.state.pitch = -0.1
  player.setBodyVisible(false)
  goFullscreen()
  placeForServe()
  say('先到 11 分　发球要过前发球线、发对角', 2.6)
}

function restart() {
  paused = false
  player.endInspect()
  ui.menu.classList.add('on')
  ui.lessons.classList.remove('on')
  ui.tut.classList.remove('on')
  ui.paused.classList.remove('on')
  ui.over.classList.remove('on')
  // 回到菜单就把键盘还给浏览器，不然在菜单里 Ctrl+W 也没反应
  unlockKeyboard()
  phase = 'menu'
  mode = 'match'
  player.setBodyVisible(true)
  match = rules.createMatch()
  shuttle.vx = shuttle.vy = shuttle.vz = 0
  shuttle.y = 1.1
  trail.clear()
  if (document.exitPointerLock) document.exitPointerLock()
}

// ---------- 主循环 ----------

let menuAngle = 0
let lastPhase = ''
let lastInspect = false

function syncHudVisibility() {
  if (phase === lastPhase) return
  lastPhase = phase
  const menuMode = phase === 'menu' || phase === 'lessons'
  document.body.classList.toggle('menu-mode', menuMode)
  // 菜单和课程列表里不显示比赛用的 HUD，免得压在界面上
  if (menuMode) ui.hud.classList.add('hide')
  else ui.hud.classList.remove('hide')
}

function updateShuttle(dt) {
  const steps = Math.min(10, Math.max(1, Math.ceil(dt / 0.006)))
  const h = dt / steps
  for (let i = 0; i < steps; i++) {
    const prevZ = shuttle.z
    physics.step(shuttle, h)
    if (rules.hitNet(shuttle.x, shuttle.y, shuttle.z, prevZ)) {
      shuttle.z = prevZ
      shuttle.vz *= -0.25
      shuttle.vx *= 0.4
      shuttle.vy *= 0.4
      if (mode === 'tutorial') return
      endPoint(-lastHitter, '球挂网了')
      return
    }
    if (shuttle.y <= 0.02) {
      shuttle.y = 0.02
      if (mode === 'tutorial') return
      onGround()
      return
    }
  }
}

// 抛球之后的那一段：球脱手，按物理飞，你在挥拍窗口里打它
function tossTick(dt) {
  if (!tossLaunched && player.tossReleased()) {
    const hw = player.freeHandWorld()
    shuttle.x = hw.x
    shuttle.y = Math.max(1.0, hw.y)
    shuttle.z = hw.z
    shuttle.vx = 0
    shuttle.vy = 3.6
    shuttle.vz = 0
    tossLaunched = true
  }
  if (tossLaunched) {
    playerHitCheck()
    updateShuttle(dt)
  }
}

function serveTick(dt) {
  if (match.server > 0) {
    if (serveStage === 'ready') {
      holdShuttleForServe()
      return
    }
    tossTick(dt)
  } else if (performance.now() - lastServeAt > 1300) {
    if (!aiServing) {
      ai.beginServe()
      aiServing = true
    }
    if (ai.serveReady()) {
      ai.launchServe(shuttle, -serverX)
      lastHitter = -1
      serving = true
      phase = 'rally'
      say('对手发球', 1.0)
    } else {
      shuttle.x = ai.state.pos.x
      shuttle.y = 1.15
      shuttle.z = ai.state.pos.z + 0.2
      shuttle.vx = shuttle.vy = shuttle.vz = 0
    }
  }
}

function frame() {
  requestAnimationFrame(frame)
  const dt = Math.min(0.05, clock.getDelta())
  const t = clock.elapsedTime

  adaptQuality(dt)
  syncHudVisibility()

  if (phase === 'menu' || phase === 'lessons') {
    menuAngle += dt * 0.28
    const r = 4.6
    camera.position.set(
      player.state.pos.x + Math.sin(menuAngle) * r,
      2.0 + Math.sin(menuAngle * 0.7) * 0.35,
      player.state.pos.z + Math.cos(menuAngle) * r
    )
    camera.lookAt(player.state.pos.x, 1.05, player.state.pos.z)
    ai.update(dt, t, shuttle)
    shuttleMesh.visible = false
    trail.clear()
  } else {
    shuttleMesh.visible = true
    if (!paused) {
      player.update(dt, t)
      ai.update(dt, t, shuttle)

      if (phase === 'tutorial') {
        tutorialTick(dt, t)
        if (!tut.hold) updateShuttle(dt)
      }

      if (phase === 'serve') serveTick(dt)

      if (phase === 'rally') {
        playerHitCheck()
        if (ai.canReach(shuttle)) {
          const bx = shuttle.x
          const by = shuttle.y
          const bz = shuttle.z
          const aiShot = ai.hit(shuttle)
          const aiSmash = aiShot && aiShot.kind === 'smash'
          audio.hit(aiSmash ? 0.9 : 0.62, aiSmash ? 'opponent_smash' : 'opponent')
          if (aiSmash) say('对手扣杀！', 0.9)
          else if (aiShot && aiShot.kind === 'lift') say('对手挑后场', 0.8)
          lastHitter = -1
          serving = false
          const vlen = physics.speedOf(shuttle) || 1
          fx.spawn(
            new THREE.Vector3(bx, by, bz),
            new THREE.Vector3(shuttle.vx / vlen, shuttle.vy / vlen, shuttle.vz / vlen),
            aiSmash
          )
          shake(aiSmash ? 0.06 : 0.03, aiSmash ? 0.2 : 0.14)
        }
        updateShuttle(dt)
      }

      const speed = physics.speedOf(shuttle)
      shuttleMesh.position.set(shuttle.x, shuttle.y, shuttle.z)
      if (speed > 0.5) {
        shuttleMesh.lookAt(shuttle.x + shuttle.vx, shuttle.y + shuttle.vy, shuttle.z + shuttle.vz)
      }
      trail.update(shuttle, dt, speed)
    }
  }

  if (shakeT > 0) {
    shakeT -= dt
    const k = Math.max(0, shakeT / shakeDur)
    const m = shakeMag * k * k
    camera.position.x += (Math.random() - 0.5) * m
    camera.position.y += (Math.random() - 0.5) * m
    camera.position.z += (Math.random() - 0.5) * m
    if (shakeT <= 0) shakeMag = 0
  }

  fx.update(dt)

  // 假影子跟着人走；跳起来的时候影子变小变淡，看起来就像离地了
  playerShadow.position.x = player.state.pos.x
  playerShadow.position.z = player.state.pos.z
  const pk = Math.max(0.45, 1 - player.state.pos.y / 2.4)
  playerShadow.scale.setScalar(pk)
  playerShadow.material.opacity = pk

  aiShadow.position.x = ai.state.pos.x
  aiShadow.position.z = ai.state.pos.z

  shuttleShadow.position.x = shuttle.x
  shuttleShadow.position.z = shuttle.z
  const sk = Math.max(0.3, 1 - shuttle.y / 5)
  shuttleShadow.scale.setScalar(sk)
  shuttleShadow.material.opacity = sk

  if (msgTimer > 0) {
    msgTimer -= dt
    if (msgTimer <= 0) ui.msg.style.opacity = '0'
  }

  updateGauge(t)
  updateMeter(t)
  const inspecting = player.inspecting()
  if (inspecting !== lastInspect) {
    lastInspect = inspecting
    ui.hud.classList.toggle('inspecting', inspecting)
    document.body.classList.toggle('inspecting', inspecting)
  }
  renderer.render(scene, camera)
}

player.setBodyVisible(true)
document.body.classList.add('app-ready')
bootReady()
frame()
