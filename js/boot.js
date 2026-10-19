// 启动兜底：模块加载失败时把错误写进启动遮罩，并提供重试。
// 单独成文件，index.html 不再需要内联脚本，方便正式部署时收紧 CSP。

(function () {
  function showLoadError(msg) {
    const note = document.getElementById('load-note')
    if (note) {
      note.textContent = '加载失败：' + msg
      note.style.color = '#ff8a8a'
    }

    const boot = document.getElementById('boot')
    if (!boot || boot.classList.contains('done')) return
    const status = document.getElementById('boot-status')
    const retry = document.getElementById('boot-retry')
    boot.classList.add('error')
    boot.classList.remove('done')
    boot.setAttribute('aria-hidden', 'false')
    if (status) status.textContent = '加载失败：' + msg
    if (retry) {
      retry.hidden = false
      retry.onclick = function () { location.reload() }
    }
  }

  window.addEventListener('error', function (e) {
    const tag = e && e.target && e.target.tagName
    // 忽略图片/媒体资源错误；脚本或样式加载失败仍然提示
    if (tag && tag !== 'SCRIPT' && tag !== 'LINK') return
    showLoadError((e && e.message) || '脚本加载失败')
  })

  window.addEventListener('unhandledrejection', function (e) {
    showLoadError((e.reason && e.reason.message) || '未知错误')
  })
})()
