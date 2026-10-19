// 统一的反馈层：加载遮罩、轻提示、确认对话框。
// 只负责 DOM 与交互，不碰游戏逻辑。

let toastTimer = 0
let confirmResolver = null
let lastFocus = null
let confirmBound = false

function byId(id) {
  return document.getElementById(id)
}

export function toast(message, kind, duration) {
  const el = byId('toast')
  if (!el) return
  el.textContent = message
  el.className = 'toast on ' + (kind || 'info')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(function () {
    el.classList.remove('on')
  }, duration || 2600)
}

export function bootReady() {
  const boot = byId('boot')
  if (!boot) return
  const status = byId('boot-status')
  if (status) status.textContent = '球场已就绪'
  boot.classList.remove('error')
  boot.classList.add('done')
  boot.setAttribute('aria-hidden', 'true')
}

export function bootError(message) {
  const boot = byId('boot')
  if (!boot) return
  const status = byId('boot-status')
  const retry = byId('boot-retry')
  boot.classList.remove('done')
  boot.classList.add('error')
  boot.setAttribute('aria-hidden', 'false')
  if (status) status.textContent = '加载失败：' + message
  if (retry) {
    retry.hidden = false
    retry.onclick = function () { window.location.reload() }
  }
}

function bindConfirm() {
  if (confirmBound) return
  const box = byId('confirm')
  if (!box) return
  confirmBound = true

  byId('confirm-ok').addEventListener('click', function () { finishConfirm(true) })
  byId('confirm-cancel').addEventListener('click', function () { finishConfirm(false) })
  box.addEventListener('click', function (e) {
    if (e.target === box) finishConfirm(false)
  })
  document.addEventListener('keydown', function (e) {
    if (!box.classList.contains('on')) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      finishConfirm(false)
    }
  }, true)
}

function finishConfirm(ok) {
  const box = byId('confirm')
  if (box) box.classList.remove('on')
  const resolve = confirmResolver
  confirmResolver = null
  if (lastFocus && lastFocus.focus) {
    try { lastFocus.focus() } catch (e) { /* 忽略 */ }
  }
  lastFocus = null
  if (resolve) resolve(ok)
}

/**
 * 自定义确认框。返回 Promise<boolean>。
 * 如果页面里没有确认框（模块加载失败等），退回原生 confirm。
 */
export function confirmAction(opts) {
  const options = opts || {}
  const box = byId('confirm')
  if (!box) {
    return Promise.resolve(window.confirm(options.body || options.title || '确定吗？'))
  }
  bindConfirm()
  if (confirmResolver) finishConfirm(false)

  byId('confirm-title').textContent = options.title || '确认操作'
  byId('confirm-body').textContent = options.body || ''
  const ok = byId('confirm-ok')
  ok.textContent = options.okText || '确定'
  ok.classList.toggle('danger', options.danger !== false)
  lastFocus = document.activeElement
  box.classList.add('on')
  setTimeout(function () {
    const cancel = byId('confirm-cancel')
    if (cancel) cancel.focus()
  }, 0)

  return new Promise(function (resolve) {
    confirmResolver = resolve
  })
}

