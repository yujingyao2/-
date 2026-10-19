// 教学关卡的课程表、进度存档和列表渲染。
// 只管"有哪些课、上过没有、怎么列出来"；上课的流程在 main.js 里。

import { TUTORIAL, CONTACT } from './config.js'
import { gripLabel } from './rules.js'
import { readJSON, writeJSON, removeKey } from './storage.js'

const STORE_KEY = 'badminton.lessons'

export function loadDone() {
  const arr = readJSON(STORE_KEY, null)
  const map = {}
  if (Array.isArray(arr)) {
    arr.forEach(function (id) { map[id] = true })
  }
  return map
}

export function markDone(id) {
  const map = loadDone()
  map[id] = true
  writeJSON(STORE_KEY, Object.keys(map))
  return map
}

export function resetDone() {
  removeKey(STORE_KEY)
  return {}
}

// 一句话说清这节课的条件：什么姿势、球在多高、用哪只手的握拍
export function conditionText(step) {
  if (step.goal === 'move') return 'WASD 移动 + 空格起跳'
  if (step.goal === 'serve') return 'E 抛球 → 松开左键挥拍'
  const parts = []
  if (step.requireAir) parts.push('跳起来挥拍')
  else if (step.requireCrouch) parts.push('蹲下来挥拍')
  else if (step.feedY >= CONTACT.high) parts.push('球高于 2 米')
  else if (step.feedY >= CONTACT.low) parts.push('球在腰上')
  else parts.push('球低于 1.25 米')
  if (step.standAt) parts.push('站到网前')
  parts.push(gripLabel(step.grip))
  const idx = partIndex(step)
  if (idx >= 0) parts.push('第 ' + (idx + 1) + ' 节')
  return parts.join(' · ')
}

export function partIndex(step) {
  for (let i = 0; i < TUTORIAL.length; i++) {
    if (TUTORIAL[i].id === step.id) return i
  }
  return -1
}

export function renderList(el, done) {
  let html = ''
  TUTORIAL.forEach(function (step, i) {
    const ok = !!done[step.id]
    html += '<div class="lesson-row' + (ok ? ' done' : '') + '" data-i="' + i + '">' +
      '<span class="ln">' + (ok ? '✓' : (i + 1)) + '</span>' +
      '<div class="lm"><b>' + step.title + '</b><em>' + conditionText(step) + '</em></div>' +
      '</div>'
  })
  el.innerHTML = html
}

export function doneCount(done) {
  let n = 0
  TUTORIAL.forEach(function (step) {
    if (done[step.id]) n++
  })
  return n
}

export function total() {
  return TUTORIAL.length
}
