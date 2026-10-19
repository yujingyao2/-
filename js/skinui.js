// 球拍皮肤面板：改四个部位的颜色，在拍网和拍杆上直接画。
// 画布导出成 dataURL 存浏览器本地；左边的实时预览是照着 3D 拍子的比例画的。

import {
  cleanSkin,
  mergeSkin,
  loadSkinLibrary,
  saveSkinLibrary,
  listSkins,
  getSkinById,
  activeSkin,
  isPresetId,
  createCustomSkin,
  updateCustomSkin,
  deleteCustomSkin,
  setActiveSkin
} from './skin.js'
import { confirmAction, toast } from './feedback.js'

export function createSkinPanel(opts) {
  const o = opts || {}
  const q = function (id) { return document.getElementById(id) }

  const el = q('skin')
  const note = q('skin-note')
  const inputs = {
    frame: q('skin-frame'),
    shaft: q('skin-shaft'),
    strings: q('skin-strings'),
    grip: q('skin-grip')
  }
  const brush = q('skin-brush')
  const size = q('skin-size')
  const eraseBtn = q('skin-erase')
  const netCv = q('skin-net-canvas')
  const shaftCv = q('skin-shaft-canvas')
  const previewCv = q('skin-preview')
  const listEl = q('skin-list')
  const nameInput = q('skin-name')
  const saveNewBtn = q('skin-save-new')
  const saveCurrentBtn = q('skin-save-current')
  const deleteBtn = q('skin-delete')
  let erasing = false
  let isOpen = false
  let library = { active: 'classic', custom: [] }
  let activeId = 'classic'
  let previewQueued = false
  let lastFocus = null

  function schedulePreview() {
    if (previewQueued) return
    previewQueued = true
    requestAnimationFrame(function () {
      previewQueued = false
      drawPreview()
    })
  }

  // 老一点的浏览器没有 CanvasRenderingContext2D.roundRect，补一个路径实现
  function roundRectPath(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r)
      return
    }
    const rad = Math.min(r, w / 2, h / 2)
    ctx.moveTo(x + rad, y)
    ctx.arcTo(x + w, y, x + w, y + h, rad)
    ctx.arcTo(x + w, y + h, x, y + h, rad)
    ctx.arcTo(x, y + h, x, y, rad)
    ctx.arcTo(x, y, x + w, y, rad)
    ctx.closePath()
  }

  // ---- 画笔：pointer events 同时支持鼠标和触控板 ----
  function setupCanvas(cv, round) {
    const ctx = cv.getContext('2d')
    let drawing = false
    let last = null

    function pos(e) {
      const r = cv.getBoundingClientRect()
      return {
        x: (e.clientX - r.left) * (cv.width / r.width),
        y: (e.clientY - r.top) * (cv.height / r.height)
      }
    }

    function stroke(a, b) {
      ctx.save()
      if (round) {
        ctx.beginPath()
        ctx.arc(cv.width / 2, cv.height / 2, cv.width / 2 - 1, 0, Math.PI * 2)
        ctx.clip()
      }
      ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over'
      ctx.strokeStyle = brush.value
      ctx.lineWidth = Number(size.value) * (cv.width / 240)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      ctx.restore()
    }

    cv.addEventListener('pointerdown', function (e) {
      e.preventDefault()
      drawing = true
      last = pos(e)
      try { cv.setPointerCapture(e.pointerId) } catch (err) { /* 忽略 */ }
      stroke(last, { x: last.x + 0.01, y: last.y + 0.01 })
      schedulePreview()
    })
    cv.addEventListener('pointermove', function (e) {
      if (!drawing) return
      const p = pos(e)
      stroke(last, p)
      last = p
      schedulePreview()
    })
    function end(e) {
      drawing = false
      try { cv.releasePointerCapture(e.pointerId) } catch (err) { /* 忽略 */ }
    }
    cv.addEventListener('pointerup', end)
    cv.addEventListener('pointercancel', function () { drawing = false })
  }

  setupCanvas(netCv, true)
  setupCanvas(shaftCv, false)

  function loadArt(cv, url) {
    const ctx = cv.getContext('2d')
    ctx.clearRect(0, 0, cv.width, cv.height)
    if (!url) return
    const img = new Image()
    img.onload = function () {
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.drawImage(img, 0, 0, cv.width, cv.height)
      schedulePreview()
    }
    img.src = url
  }

  function syncFrom(skin) {
    const s = mergeSkin(skin)
    inputs.frame.value = s.frame
    inputs.shaft.value = s.shaft
    inputs.strings.value = s.strings
    inputs.grip.value = s.grip
    loadArt(netCv, s.stringArt)
    loadArt(shaftCv, s.shaftArt)
    erasing = false
    eraseBtn.classList.remove('on')
    drawPreview()
  }

  // 空白画布不要存成一张透明 PNG，否则每次都会被当成"改过"
  function canvasArt(cv) {
    const data = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) return cv.toDataURL('image/png')
    }
    return ''
  }

  function currentSkin() {
    return cleanSkin({
      frame: inputs.frame.value,
      shaft: inputs.shaft.value,
      strings: inputs.strings.value,
      grip: inputs.grip.value,
      stringArt: canvasArt(netCv),
      shaftArt: canvasArt(shaftCv)
    })
  }

  // ---- 实时预览 ----
  // 比例照着 character.js 的 makeRacket：拍头、中杆、握把。
  function drawPreview() {
    const ctx = previewCv.getContext('2d')
    const W = previewCv.width
    const H = previewCv.height
    const cx = W / 2
    const frame = inputs.frame.value
    const strings = inputs.strings.value
    const shaft = inputs.shaft.value
    const grip = inputs.grip.value

    ctx.clearRect(0, 0, W, H)

    // 拍头
    const hy = 128
    const rx = 88
    const ry = 100
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(cx, hy, rx - 7, ry - 7, 0, 0, Math.PI * 2)
    ctx.clip()

    ctx.fillStyle = 'rgba(8, 12, 16, 0.9)'
    ctx.fillRect(cx - rx, hy - ry, rx * 2, ry * 2)

    // 先铺玩家画的图，再压一层拍线，和 3D 里的顺序一致
    ctx.globalAlpha = 0.92
    ctx.drawImage(netCv, cx - rx + 7, hy - ry + 7, (rx - 7) * 2, (ry - 7) * 2)
    ctx.globalAlpha = 1

    ctx.strokeStyle = strings
    ctx.lineWidth = 1.3
    for (let i = 1; i < 10; i++) {
      const u = i / 10
      const x = cx - (rx - 7) + (rx - 7) * 2 * u
      const yy = hy - (ry - 7) + (ry - 7) * 2 * u
      ctx.beginPath()
      ctx.moveTo(x, hy - ry)
      ctx.lineTo(x, hy + ry)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx - rx, yy)
      ctx.lineTo(cx + rx, yy)
      ctx.stroke()
    }
    ctx.restore()

    // 拍框：外圈高光 + 本体
    ctx.lineWidth = 9
    ctx.strokeStyle = frame
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
    ctx.shadowBlur = 12
    ctx.beginPath()
    ctx.ellipse(cx, hy, rx - 4, ry - 4, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.beginPath()
    ctx.ellipse(cx, hy, rx - 8, ry - 8, 0, 0, Math.PI * 2)
    ctx.stroke()

    // 顶端配色
    ctx.fillStyle = strings
    ctx.beginPath()
    roundRectPath(ctx, cx - 10, hy - ry - 1, 20, 5, 3)
    ctx.fill()

    // 三通 + 中杆
    ctx.fillStyle = frame
    ctx.beginPath()
    ctx.moveTo(cx - 16, hy + ry - 10)
    ctx.lineTo(cx - 4, hy + ry + 20)
    ctx.lineTo(cx + 4, hy + ry + 20)
    ctx.lineTo(cx + 16, hy + ry - 10)
    ctx.closePath()
    ctx.fill()

    const shaftY = hy + ry + 20
    const shaftH = 58
    ctx.fillStyle = shaft
    ctx.fillRect(cx - 3, shaftY, 6, shaftH)
    ctx.save()
    ctx.beginPath()
    ctx.rect(cx - 3, shaftY, 6, shaftH)
    ctx.clip()
    ctx.globalAlpha = 0.9
    ctx.drawImage(shaftCv, 24, 0, 48, 320, cx - 3, shaftY, 6, shaftH)
    ctx.globalAlpha = 1
    ctx.restore()

    // 握把
    const gripY = shaftY + shaftH
    const gripH = 70
    ctx.fillStyle = grip
    ctx.beginPath()
    roundRectPath(ctx, cx - 11, gripY, 22, gripH, 6)
    ctx.fill()
    ctx.save()
    ctx.beginPath()
    roundRectPath(ctx, cx - 11, gripY, 22, gripH, 6)
    ctx.clip()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'
    ctx.lineWidth = 2
    for (let i = -gripH; i < 40; i += 9) {
      ctx.beginPath()
      ctx.moveTo(cx - 11 + i, gripY)
      ctx.lineTo(cx - 11 + i + gripH, gripY + gripH)
      ctx.stroke()
    }
    ctx.restore()

    // 柄底
    ctx.fillStyle = '#14161a'
    ctx.beginPath()
    roundRectPath(ctx, cx - 13, gripY + gripH - 1, 26, 6, 3)
    ctx.fill()
  }

  function nameOf(id) {
    const items = listSkins(library)
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === id) return items[i].name
    }
    return '球拍皮肤'
  }

  function renderLibrary() {
    listEl.innerHTML = ''
    const items = listSkins(library)
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.dataset.id = item.id
      btn.className = 'skin-chip' + (item.id === activeId ? ' on' : '')
      btn.title = item.preset ? '预设皮肤' : '我的皮肤存档'
      const dot = document.createElement('i')
      dot.style.background = 'linear-gradient(135deg, ' + item.skin.frame + ' 0 42%, ' +
        item.skin.strings + ' 42% 74%, ' + item.skin.grip + ' 74% 100%)'
      const label = document.createElement('span')
      label.textContent = item.name
      btn.appendChild(dot)
      btn.appendChild(label)
      btn.addEventListener('click', function () { selectSkin(item.id) })
      listEl.appendChild(btn)
    }
    if (library.custom.length === 0) {
      const empty = document.createElement('span')
      empty.className = 'skin-empty'
      empty.textContent = '还没有自己的存档'
      listEl.appendChild(empty)
    }
  }

  function updateLibraryButtons() {
    const preset = isPresetId(activeId)
    saveCurrentBtn.disabled = preset
    deleteBtn.disabled = preset
    saveCurrentBtn.title = preset ? '预设不能覆盖，请用「存为新皮肤」' : ''
    deleteBtn.title = preset ? '预设不能删除' : ''
  }

  function selectSkin(id, noteText) {
    setActiveSkin(library, id)
    library = saveSkinLibrary(library)
    activeId = library.active
    const skin = activeSkin(library)
    syncFrom(skin)
    nameInput.value = isPresetId(activeId) ? '' : nameOf(activeId)
    renderLibrary()
    updateLibraryButtons()
    if (o.onApply) o.onApply(skin)
    setNote(noteText || '已切换到「' + nameOf(activeId) + '」。', true)
  }

  function saveAsNew() {
    const id = createCustomSkin(library, nameInput.value, currentSkin())
    if (!id) {
      setNote('存档满了（最多 12 个），先删一个再存。', false)
      return
    }
    library = saveSkinLibrary(library)
    activeId = library.active
    if (o.onApply) o.onApply(activeSkin(library))
    nameInput.value = nameOf(activeId)
    renderLibrary()
    updateLibraryButtons()
    setNote('已存为新皮肤「' + nameOf(activeId) + '」。', true)
  }

  function saveCurrent() {
    if (isPresetId(activeId)) {
      saveAsNew()
      return
    }
    if (!updateCustomSkin(library, activeId, nameInput.value, currentSkin())) {
      setNote('这个存档不存在，点「存为新皮肤」吧。', false)
      return
    }
    library = saveSkinLibrary(library)
    activeId = library.active
    if (o.onApply) o.onApply(activeSkin(library))
    nameInput.value = nameOf(activeId)
    renderLibrary()
    updateLibraryButtons()
    setNote('已保存到「' + nameOf(activeId) + '」。', true)
  }

  function deleteActive() {
    if (isPresetId(activeId)) {
      setNote('预设不能删除；改完可以存成自己的皮肤。', false)
      return
    }
    const oldName = nameOf(activeId)
    confirmAction({
      title: '删除皮肤存档？',
      body: '「' + oldName + '」会从存档中移除，删除后不能恢复。',
      okText: '删除',
      danger: true
    }).then(function (ok) {
      if (!ok) return
      if (!deleteCustomSkin(library, activeId)) return
      library = saveSkinLibrary(library)
      activeId = library.active
      const skin = activeSkin(library)
      syncFrom(skin)
      if (o.onApply) o.onApply(skin)
      nameInput.value = ''
      renderLibrary()
      updateLibraryButtons()
      setNote('已切回「' + nameOf(activeId) + '」。', true)
      toast('已删除皮肤「' + oldName + '」', 'success')
    })
  }

  function applyAndClose() {
    const skin = currentSkin()
    if (!isPresetId(activeId)) {
      updateCustomSkin(library, activeId, nameInput.value, skin)
      library = saveSkinLibrary(library)
      activeId = library.active
    } else {
      const presetSkin = getSkinById(library, activeId)
      if (JSON.stringify(skin) !== JSON.stringify(presetSkin)) {
        const id = createCustomSkin(library, nameInput.value, skin)
        if (id) {
          library = saveSkinLibrary(library)
          activeId = library.active
        } else {
          setNote('存档满了，先删一个；这次只应用，不保存。', false)
        }
      }
    }
    if (o.onApply) o.onApply(skin)
    close()
    toast('皮肤已应用', 'success')
  }

  function open() {
    library = loadSkinLibrary()
    activeId = library.active
    syncFrom(activeSkin(library))
    nameInput.value = isPresetId(activeId) ? '' : nameOf(activeId)
    renderLibrary()
    updateLibraryButtons()
    setNote('点上方存档切换皮肤；改动可以保存到当前，或存成新皮肤。')
    el.classList.add('on')
    isOpen = true
    lastFocus = document.activeElement
    setTimeout(function () {
      const closeBtn = q('skin-close')
      if (closeBtn) closeBtn.focus()
    }, 0)
  }

  function close() {
    el.classList.remove('on')
    isOpen = false
    if (lastFocus && lastFocus.focus) {
      try { lastFocus.focus() } catch (e) { /* 忽略 */ }
    }
    lastFocus = null
    if (o.onClose) o.onClose()
  }

  function setNote(text, good) {
    note.textContent = text
    note.classList.toggle('good', !!good)
  }

  eraseBtn.addEventListener('click', function () {
    erasing = !erasing
    eraseBtn.classList.toggle('on', erasing)
    setNote(erasing ? '橡皮：擦掉自己画的图案，拍线网格会露出来。' : '画笔：在拍网或拍杆上拖动就能画。')
  })
  q('skin-clear-net').addEventListener('click', function () {
    netCv.getContext('2d').clearRect(0, 0, netCv.width, netCv.height)
    drawPreview()
    setNote('拍网图案已清空，记得点“应用并保存”。')
  })
  q('skin-clear-shaft').addEventListener('click', function () {
    shaftCv.getContext('2d').clearRect(0, 0, shaftCv.width, shaftCv.height)
    drawPreview()
    setNote('拍杆图案已清空，记得点“应用并保存”。')
  })
  q('skin-apply').addEventListener('click', applyAndClose)
  q('skin-reset').addEventListener('click', function () { selectSkin('classic') })
  saveNewBtn.addEventListener('click', saveAsNew)
  saveCurrentBtn.addEventListener('click', saveCurrent)
  deleteBtn.addEventListener('click', deleteActive)
  nameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveAsNew()
    }
  })
  q('skin-close').addEventListener('click', close)
  document.addEventListener('keydown', function (e) {
    if (!isOpen || e.key !== 'Escape') return
    const confirm = q('confirm')
    if (confirm && confirm.classList.contains('on')) return
    e.preventDefault()
    e.stopPropagation()
    close()
  }, true)

  Object.keys(inputs).forEach(function (k) {
    inputs[k].addEventListener('input', drawPreview)
  })
  brush.addEventListener('input', function () {
    setNote('画笔颜色改成 ' + brush.value + '。')
  })

  drawPreview()

  return {
    open: open,
    close: close,
    isOpen: function () { return isOpen }
  }
}
