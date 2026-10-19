// 统一的本地存储读写。所有模块都走这里，避免到处重复 try/catch。
// 这些函数只在调用时访问 window，方便 Node 里用 mock 做纯逻辑测试。

export function readJSON(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch (e) {
    return fallback
  }
}

export function writeJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (e) {
    return false
  }
}

export function readText(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? fallback : raw
  } catch (e) {
    return fallback
  }
}

export function writeText(key, value) {
  try {
    window.localStorage.setItem(key, String(value))
    return true
  } catch (e) {
    return false
  }
}

export function removeKey(key) {
  try {
    window.localStorage.removeItem(key)
    return true
  } catch (e) {
    return false
  }
}
