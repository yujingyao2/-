// 球拍皮肤：颜色 + 拍网/拍杆上的手绘图案。
// 皮肤库支持内置预设、多个自定义存档、切换和删除。
// 图案是 canvas 导出的 dataURL，存在浏览器本地。

import { readJSON, writeJSON } from './storage.js'

export const SKIN_DEFAULTS = {
  frame: '#f4f7f9',     // 拍框
  shaft: '#eef3f7',     // 中杆
  strings: '#cede4a',   // 拍线
  grip: '#191b1f',      // 握把
  stringArt: '',        // 拍网上画的图案（dataURL）
  shaftArt: ''          // 拍杆上画的图案（dataURL）
}

export const SKIN_STORE_KEY = 'badminton.skin'       // 旧版单存档，用来迁移
export const SKINS_STORE_KEY = 'badminton.skins'     // 新版皮肤库
export const SKIN_MAX = 12

export function mergeSkin(patch) {
  return Object.assign({}, SKIN_DEFAULTS, patch || {})
}

// 只接受 #rrggbb，防止存进奇怪的东西把材质弄坏
export function safeColor(v, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v) : fallback
}

function safeArt(v) {
  return typeof v === 'string' && v.indexOf('data:image/') === 0 ? v : ''
}

export function cleanSkin(patch) {
  const s = mergeSkin(patch)
  return {
    frame: safeColor(s.frame, SKIN_DEFAULTS.frame),
    shaft: safeColor(s.shaft, SKIN_DEFAULTS.shaft),
    strings: safeColor(s.strings, SKIN_DEFAULTS.strings),
    grip: safeColor(s.grip, SKIN_DEFAULTS.grip),
    stringArt: safeArt(s.stringArt),
    shaftArt: safeArt(s.shaftArt)
  }
}

function safeName(v, fallback) {
  const s = String(v === null || v === undefined ? '' : v).trim().replace(/\s+/g, ' ').slice(0, 12)
  return s || fallback
}

function newSkinId() {
  return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function preset(id, name, patch) {
  return { id: id, name: name, preset: true, skin: cleanSkin(Object.assign({}, SKIN_DEFAULTS, patch)) }
}

export const SKIN_PRESETS = [
  preset('classic', '经典白', {}),
  preset('midnight', '午夜蓝', {
    frame: '#334a6b',
    shaft: '#1b2634',
    strings: '#7fe3ff',
    grip: '#0d1117'
  }),
  preset('sunset', '橙黑', {
    frame: '#ff9a3c',
    shaft: '#2c2f36',
    strings: '#ffe066',
    grip: '#17191e'
  }),
  preset('mint', '薄荷', {
    frame: '#d8fff2',
    shaft: '#4f8f82',
    strings: '#58e0b2',
    grip: '#1a2421'
  })
]

export function isPresetId(id) {
  return SKIN_PRESETS.some(function (p) { return p.id === id })
}

export function listSkins(lib) {
  const custom = lib && Array.isArray(lib.custom) ? lib.custom : []
  return SKIN_PRESETS.concat(custom.map(function (s) {
    return { id: s.id, name: s.name, preset: false, skin: s.skin }
  }))
}

export function getSkinById(lib, id) {
  for (let i = 0; i < SKIN_PRESETS.length; i++) {
    if (SKIN_PRESETS[i].id === id) return cleanSkin(SKIN_PRESETS[i].skin)
  }
  const custom = lib && Array.isArray(lib.custom) ? lib.custom : []
  for (let i = 0; i < custom.length; i++) {
    if (custom[i].id === id) return cleanSkin(custom[i].skin)
  }
  return cleanSkin(SKIN_DEFAULTS)
}

export function activeSkin(lib) {
  return getSkinById(lib, lib && lib.active)
}

export function setActiveSkin(lib, id) {
  const found = isPresetId(id) || (lib.custom || []).some(function (s) { return s.id === id })
  if (found) lib.active = id
  return lib
}

export function createCustomSkin(lib, name, skin) {
  if (!Array.isArray(lib.custom)) lib.custom = []
  if (lib.custom.length >= SKIN_MAX) return null
  const id = newSkinId()
  lib.custom.push({
    id: id,
    name: safeName(name, '我的皮肤 ' + (lib.custom.length + 1)),
    skin: cleanSkin(skin)
  })
  lib.active = id
  return id
}

export function updateCustomSkin(lib, id, name, skin) {
  const list = lib && Array.isArray(lib.custom) ? lib.custom : []
  for (let i = 0; i < list.length; i++) {
    if (list[i].id !== id) continue
    list[i].name = safeName(name, list[i].name)
    list[i].skin = cleanSkin(skin)
    return true
  }
  return false
}

export function deleteCustomSkin(lib, id) {
  if (!lib || !Array.isArray(lib.custom)) return false
  const before = lib.custom.length
  lib.custom = lib.custom.filter(function (s) { return s.id !== id })
  if (lib.custom.length === before) return false
  if (lib.active === id) lib.active = 'classic'
  return true
}

function normalizeLibrary(raw) {
  const lib = { active: 'classic', custom: [] }
  if (!raw || typeof raw !== 'object') return lib
  const seen = {}
  const source = Array.isArray(raw.custom) ? raw.custom.slice(0, SKIN_MAX) : []
  source.forEach(function (item) {
    if (!item || typeof item !== 'object') return
    let id = typeof item.id === 'string' && item.id ? item.id : newSkinId()
    if (seen[id] || isPresetId(id)) id = newSkinId()
    seen[id] = true
    lib.custom.push({
      id: id,
      name: safeName(item.name, '我的皮肤 ' + (lib.custom.length + 1)),
      skin: cleanSkin(item.skin)
    })
  })
  const customIds = {}
  lib.custom.forEach(function (s) { customIds[s.id] = true })
  if (typeof raw.active === 'string' && (isPresetId(raw.active) || customIds[raw.active])) {
    lib.active = raw.active
  }
  return lib
}

export function loadSkinLibrary() {
  const data = readJSON(SKINS_STORE_KEY, null)
  if (data) return normalizeLibrary(data)

  // 旧版本只有一个 badminton.skin，迁移成"我的球拍"存档
  const legacy = readJSON(SKIN_STORE_KEY, null)
  if (legacy) {
    const lib = { active: 'classic', custom: [] }
    createCustomSkin(lib, '我的球拍', legacy)
    saveSkinLibrary(lib)
    return lib
  }
  return { active: 'classic', custom: [] }
}

export function saveSkinLibrary(lib) {
  const clean = normalizeLibrary(lib)
  writeJSON(SKINS_STORE_KEY, clean)
  return clean
}
