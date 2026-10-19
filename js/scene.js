// 搭场景：体育馆、球场、球网、灯光、看台。
// 场地尺寸按国际比赛标准来，不是估的：13.40 x 6.10，网高 1.524 米。
// 场线是用 Canvas 画成贴图的，所以不需要任何外部图片文件。

import THREE from './three.js'
import { COURT } from './config.js'

const PX_PER_M = 56

// 场地外圈（缓冲区）的宽度，米
const APRON = 1.6
const AREA_W = COURT.halfWidthDoubles * 2 + APRON * 2
const AREA_L = COURT.halfLength * 2 + APRON * 2

// 场地贴图：把"外圈深绿 + 场地绿 + 白线"画在同一张图上。
//
// 以前这是两层独立的平面（外圈一层、场地一层）叠在木地板上，
// 三层只差 2 毫米。视角一转，远处这两毫米的深度精度不够，
// 就会互相"透"出来——透出来的是底下木地板的棕橙色，
// 也就是你看到的"橙色若隐若现"。画在同一张图上就彻底没有这问题。
function courtTexture() {
  const w = Math.round(AREA_W * PX_PER_M)
  const h = Math.round(AREA_L * PX_PER_M)
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d')

  // 先铺外圈的深绿
  g.fillStyle = '#1d4a37'
  g.fillRect(0, 0, w, h)

  // 再画场地本身
  const px = function (x) { return (x + AREA_W / 2) * PX_PER_M }
  const py = function (z) { return (z + AREA_L / 2) * PX_PER_M }
  g.fillStyle = '#2f6b4f'
  g.fillRect(
    px(-COURT.halfWidthDoubles),
    py(-COURT.halfLength),
    COURT.halfWidthDoubles * 2 * PX_PER_M,
    COURT.halfLength * 2 * PX_PER_M
  )

  // 场地坐标 → 贴图像素：中心是网，z 向上为贴图的 y
  const line = COURT.lineWidth * PX_PER_M

  g.strokeStyle = '#f3f7f4'
  g.lineWidth = line
  g.lineCap = 'square'

  function seg(x1, z1, x2, z2) {
    g.beginPath()
    g.moveTo(px(x1), py(z1))
    g.lineTo(px(x2), py(z2))
    g.stroke()
  }

  for (let s = -1; s <= 1; s += 2) {
    // 双打边线（整场）
    seg(s * COURT.halfWidthDoubles, -COURT.halfLength, s * COURT.halfWidthDoubles, COURT.halfLength)
    // 单打边线（整场）
    seg(s * COURT.halfWidthSingles, -COURT.halfLength, s * COURT.halfWidthSingles, COURT.halfLength)
    // 端线
    seg(-COURT.halfWidthDoubles, s * COURT.halfLength, COURT.halfWidthDoubles, s * COURT.halfLength)
    // 前发球线
    seg(-COURT.halfWidthSingles, s * COURT.shortService, COURT.halfWidthSingles, s * COURT.shortService)
    // 双打后发球线
    seg(-COURT.halfWidthSingles, s * COURT.doublesLongService, COURT.halfWidthSingles, s * COURT.doublesLongService)
    // 中线
    seg(0, s * COURT.shortService, 0, s * COURT.halfLength)
  }

  const tex = new THREE.CanvasTexture(cv)
  tex.anisotropy = 4
  return tex
}

// 固定种子的随机数：贴图每次加载都一样，不会这次多一道纹、下次少一道
function seeded(seed) {
  let s = seed
  return function () {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

// 木地板：一排排木板 + 木纹 + 板缝。
// 之前地面是纯色，身后那一片看着就像"贴图没加载完"。
function woodTexture() {
  const cv = document.createElement('canvas')
  cv.width = 512
  cv.height = 512
  const g = cv.getContext('2d')
  const rnd = seeded(20261016)
  g.fillStyle = '#b98a52'
  g.fillRect(0, 0, 512, 512)
  const plank = 64
  for (let y = 0; y < 512; y += plank) {
    const v = 0.9 + rnd() * 0.2
    g.fillStyle = 'rgb(' + Math.round(185 * v) + ',' + Math.round(138 * v) + ',' + Math.round(90 * v) + ')'
    g.fillRect(0, y, 512, plank - 2)
    g.strokeStyle = 'rgba(88, 58, 32, 0.10)'
    g.lineWidth = 1.5
    for (let i = 0; i < 7; i++) {
      const yy = y + 6 + rnd() * (plank - 14)
      g.beginPath()
      g.moveTo(0, yy)
      for (let x = 16; x <= 512; x += 24) g.lineTo(x, yy + Math.sin(x * 0.02 + i * 1.7) * 2)
      g.stroke()
    }
    g.fillStyle = 'rgba(72, 46, 24, 0.34)'
    g.fillRect(0, y + plank - 2, 512, 2)
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(5, 8)
  return tex
}

// 墙板：竖向分缝 + 一道腰线
function wallTexture() {
  const cv = document.createElement('canvas')
  cv.width = 256
  cv.height = 256
  const g = cv.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, '#a3b4c1')
  grad.addColorStop(1, '#7d909d')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  g.strokeStyle = 'rgba(58, 72, 82, 0.22)'
  g.lineWidth = 3
  for (let x = 0; x <= 256; x += 64) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, 256)
    g.stroke()
  }
  g.strokeStyle = 'rgba(58, 72, 82, 0.18)'
  g.lineWidth = 5
  g.beginPath()
  g.moveTo(0, 188)
  g.lineTo(256, 188)
  g.stroke()
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(5, 2)
  return tex
}

function netTexture() {
  const cv = document.createElement('canvas')
  cv.width = 256
  cv.height = 64
  const g = cv.getContext('2d')
  g.clearRect(0, 0, 256, 64)
  g.strokeStyle = 'rgba(238, 244, 240, 0.92)'
  g.lineWidth = 1.4
  for (let x = 0; x <= 256; x += 8) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, 64)
    g.stroke()
  }
  for (let y = 0; y <= 64; y += 8) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(256, y)
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(10, 1)
  return tex
}

export function buildScene(scene) {
  const group = new THREE.Group()
  scene.add(group)

  // 地面（球馆地板）
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.hallWidth, COURT.hallLength),
    new THREE.MeshLambertMaterial({ map: woodTexture() })
  )
  floor.rotation.x = -Math.PI / 2
  group.add(floor)

  // 球场 + 外圈：合成一整块平面，外圈和场地画在同一张贴图里。
  // 这样和木地板之间只剩"一层 vs 一层"，间距也给到 8 毫米，
  // 再加上 polygonOffset，远处也不会互相穿透。
  const courtMat = new THREE.MeshLambertMaterial({
    map: courtTexture(),
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  })
  const court = new THREE.Mesh(new THREE.PlaneGeometry(AREA_W, AREA_L), courtMat)
  court.rotation.x = -Math.PI / 2
  court.position.y = 0.008
  group.add(court)

  // 网柱和网
  const postMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 })
  for (let s = -1; s <= 1; s += 2) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, COURT.netHeightPost, 16), postMat)
    post.position.set(s * (COURT.halfWidthDoubles + 0.05), COURT.netHeightPost / 2, 0)
    group.add(post)
  }

  const netMat = new THREE.MeshLambertMaterial({
    map: netTexture(),
    transparent: true,
    side: THREE.DoubleSide,
    alphaTest: 0.08
  })
  const netW = (COURT.halfWidthDoubles + 0.05) * 2
  const netH = COURT.netHeightCenter
  const net = new THREE.Mesh(new THREE.PlaneGeometry(netW, netH), netMat)
  net.position.set(0, netH / 2, 0)
  group.add(net)

  // 网顶白布
  const tape = new THREE.Mesh(
    new THREE.BoxGeometry(netW, 0.06, 0.012),
    new THREE.MeshLambertMaterial({ color: 0xf5f8f6 })
  )
  tape.position.set(0, netH - 0.03, 0)
  group.add(tape)

  // 墙和天花板
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTexture(), side: THREE.BackSide })
  // 外壳是一个封闭盒子，材质用 BackSide。盒子底面原本也在 y=0，
  // 和木地板完全共面，抬头看远处时会和地板抢深度，出现一条条闪烁。
  // 把整个外壳下沉 5 厘米，底面藏到地板下面，场内就只剩木地板一层。
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(COURT.hallWidth, COURT.hallHeight, COURT.hallLength),
    wallMat
  )
  shell.position.y = COURT.hallHeight / 2 - 0.05
  group.add(shell)

  // 两侧看台：一排排台阶，给场景一点纵深
  const seatMat = new THREE.MeshLambertMaterial({ color: 0x3c5f8a })
  const stepMat = new THREE.MeshLambertMaterial({ color: 0x5b6b78 })
  // 看台是静态的，用 InstancedMesh 合批：2 次 draw call 代替 16 次。
  // 尺寸通过每个实例的矩阵缩放，外观和一组独立 BoxGeometry 一样。
  const unitBox = new THREE.BoxGeometry(1, 1, 1)
  const stepMesh = new THREE.InstancedMesh(unitBox, stepMat, 8)
  const seatMesh = new THREE.InstancedMesh(unitBox, seatMat, 8)
  const instPos = new THREE.Vector3()
  const instScale = new THREE.Vector3()
  const instQuat = new THREE.Quaternion()
  const instMat = new THREE.Matrix4()
  let inst = 0
  for (let s = -1; s <= 1; s += 2) {
    for (let row = 0; row < 4; row++) {
      const x = s * (COURT.halfWidthDoubles + 1.9 + row * 0.85)
      const y = 0.25 + row * 0.42
      instPos.set(x, y / 2, 0)
      instScale.set(0.85, y * 2, COURT.hallLength - 3)
      instMat.compose(instPos, instQuat, instScale)
      stepMesh.setMatrixAt(inst, instMat)

      instPos.set(x, y + 0.08, 0)
      instScale.set(0.7, 0.16, COURT.hallLength - 3.4)
      instMat.compose(instPos, instQuat, instScale)
      seatMesh.setMatrixAt(inst, instMat)
      inst++
    }
  }
  stepMesh.instanceMatrix.needsUpdate = true
  seatMesh.instanceMatrix.needsUpdate = true
  // 实例分布在整个球馆，关掉默认的包围球裁剪，避免被误判为不在视野
  stepMesh.frustumCulled = false
  seatMesh.frustumCulled = false
  group.add(stepMesh)
  group.add(seatMesh)

  // 灯光：一盏环境光铺底，一盏主灯负责影子
  scene.add(new THREE.HemisphereLight(0xdfeaf5, 0x3a4a3f, 0.72))
  const key = new THREE.DirectionalLight(0xfff4e0, 1.15)
  key.position.set(6, 12, 7)
  scene.add(key)

  const fill = new THREE.DirectionalLight(0xbfd8ff, 0.35)
  fill.position.set(-7, 8, -6)
  scene.add(fill)

  // 顶灯，纯装饰
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6dd })
  for (let i = -1; i <= 1; i++) {
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), lampMat)
    lamp.rotation.x = Math.PI / 2
    lamp.position.set(i * 3.4, COURT.hallHeight - 0.2, i * 4)
    group.add(lamp)
  }

  return group
}
