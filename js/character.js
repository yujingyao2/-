// 卡通但比例接近真人的人物，和球拍、羽毛球。
// 全部用几何体拼，不依赖外部模型文件。
//
// 骨架高度（1.62 米，按真人比例）：
//   脚底 0    脚踝 0.065   膝 0.44   髋 0.86
//   腰 1.02   肩 1.30      颈 1.36   头顶 1.605
// 这个表很重要：之前那版腿短了一截，小人整个悬空 14 厘米，
// 站在球场上像飘着。改模型时对着这张表量。

import THREE from './three.js'
import { SKELETON } from './config.js'
import { SKIN_DEFAULTS, mergeSkin } from './skin.js'

const H = SKELETON

function mat(color, opts) {
  // Lambert 而不是 PBR：这个场景只有一盏主灯加环境光，用不上 PBR，
  // 换掉能省一大截片元开销。Lambert 没有 roughness/metalness，丢掉免刷警告。
  const o = Object.assign({}, opts || {})
  delete o.roughness
  delete o.metalness
  return new THREE.MeshLambertMaterial(Object.assign({ color: color }, o))
}

// 拍线贴图：网格 + 用户自己画的图案。
// artURL 是玩家在皮肤面板里画的那张图，叠在网格底下；网格再盖一层，
// 这样不管画了什么，拍线的质感都还在。
function stringTexture(color, artURL) {
  const cv = document.createElement('canvas')
  cv.width = 256
  cv.height = 256
  const g = cv.getContext('2d')
  const tex = new THREE.CanvasTexture(cv)

  function paintGrid() {
    g.strokeStyle = color
    g.lineWidth = 1.9
    for (let i = 0; i <= 22; i++) {
      const p = (i / 22) * 256
      g.beginPath()
      g.moveTo(p, 0)
      g.lineTo(p, 256)
      g.stroke()
      g.beginPath()
      g.moveTo(0, p)
      g.lineTo(256, p)
      g.stroke()
    }
  }

  function paint(art) {
    g.clearRect(0, 0, 256, 256)
    if (art) g.drawImage(art, 0, 0, 256, 256)
    paintGrid()
    tex.needsUpdate = true
  }

  paint(null)
  if (artURL) {
    const img = new Image()
    img.onload = function () { paint(img) }
    img.src = artURL
  }
  return tex
}

// 中杆贴图：底色 + 玩家画的那一条
function shaftTexture(color, artURL) {
  const cv = document.createElement('canvas')
  cv.width = 64
  cv.height = 256
  const g = cv.getContext('2d')
  const tex = new THREE.CanvasTexture(cv)

  function paint(art) {
    g.fillStyle = color
    g.fillRect(0, 0, 64, 256)
    if (art) g.drawImage(art, 0, 0, 64, 256)
    tex.needsUpdate = true
  }

  paint(null)
  if (artURL) {
    const img = new Image()
    img.onload = function () { paint(img) }
    img.src = artURL
  }
  return tex
}

// 握把：缠带斜纹，颜色随皮肤走
function gripTexture(color) {
  const cv = document.createElement('canvas')
  cv.width = 64
  cv.height = 64
  const g = cv.getContext('2d')
  g.fillStyle = color
  g.fillRect(0, 0, 64, 64)
  g.strokeStyle = 'rgba(255, 255, 255, 0.12)'
  g.lineWidth = 2
  for (let i = -64; i < 128; i += 9) {
    g.beginPath()
    g.moveTo(i, 0)
    g.lineTo(i + 64, 64)
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1, 5)
  return tex
}

export function makeRacket(skin) {
  const s = mergeSkin(skin)
  const g = new THREE.Group()

  // 每个部位一个材质实例，userData.role 标明身份，换皮肤时按 role 找
  function roleMat(role) {
    const m = new THREE.MeshLambertMaterial()
    m.userData.role = role
    return m
  }
  const gripMat = roleMat('grip')
  gripMat.map = gripTexture(s.grip)
  const frameMat = roleMat('frame')
  frameMat.color.set(s.frame)
  const shaftMat = roleMat('shaft')
  shaftMat.map = shaftTexture(s.shaft, s.shaftArt)
  const stringMat = roleMat('strings')
  stringMat.map = stringTexture(s.strings, s.stringArt)
  stringMat.alphaTest = 0.45
  stringMat.side = THREE.DoubleSide
  const accentMat = roleMat('accent')
  accentMat.color.set(s.strings)

  // 握把：底部（原点）就是手握的位置
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0155, 0.2, 26), gripMat)
  handle.position.y = 0.1
  g.add(handle)

  // 柄底：黑色
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.009, 26), mat(0x14161a))
  cap.position.y = 0.001
  g.add(cap)

  // 中杆：细一点，更接近图一那种纤细的白杆
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0075, 0.24, 20), shaftMat)
  shaft.position.y = 0.32
  g.add(shaft)

  // 三通：图一是一段白色的锥形喉部，不是一个 Y 字叉
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.021, 0.08, 26), frameMat)
  throat.position.y = 0.47
  g.add(throat)

  const HEAD_Y = 0.555
  const RX = 0.088
  const RY = RX * 1.12
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(RX, 0.0072, 24, 72), frameMat)
  hoop.position.y = HEAD_Y
  hoop.scale.set(1, 1.12, 1)
  g.add(hoop)

  const strings = new THREE.Mesh(new THREE.CircleGeometry(RX * 0.98, 48), stringMat)
  strings.position.y = HEAD_Y
  strings.scale.set(1, 1.12, 1)
  g.add(strings)

  // 拍框顶端的一小段配色（图一顶端有个小标记）
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.007, 0.007), accentMat)
  tip.position.set(0, HEAD_Y + RY, 0)
  g.add(tip)

  g.userData.headY = HEAD_Y
  g.userData.headRadius = RY
  return g
}

/**
 * 换皮肤：按材质上的 role 更新颜色和贴图，不用重建整支球拍。
 * 颜色改完刷新一下就生效；图案是异步加载的，加载完自己再刷一次贴图。
 */
export function applyRacketSkin(group, skin) {
  const s = mergeSkin(skin)
  group.traverse(function (o) {
    if (!o.isMesh || !o.material || !o.material.userData) return
    const role = o.material.userData.role
    if (!role) return
    const m = o.material
    if (role === 'strings') {
      if (m.map) m.map.dispose()
      m.map = stringTexture(s.strings, s.stringArt)
      m.needsUpdate = true
    } else if (role === 'shaft') {
      if (m.map) m.map.dispose()
      m.map = shaftTexture(s.shaft, s.shaftArt)
      m.needsUpdate = true
    } else if (role === 'grip') {
      if (m.map) m.map.dispose()
      m.map = gripTexture(s.grip)
      m.needsUpdate = true
    } else if (role === 'accent') {
      m.color.set(s.strings)
    } else {
      m.color.set(s[role] || SKIN_DEFAULTS[role] || '#ffffff')
    }
  })
}

export function makeShuttle() {
  const g = new THREE.Group()
  const cork = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 12), mat(0xf6f1e6))
  cork.position.z = 0.028
  g.add(cork)

  const skirt = new THREE.Mesh(
    new THREE.ConeGeometry(0.035, 0.075, 18, 1, true),
    mat(0xffffff, { side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
  )
  skirt.rotation.x = Math.PI / 2
  skirt.position.z = -0.038
  g.add(skirt)

  const ribMat = mat(0xdfe4e8)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.07, 0.004), ribMat)
    rib.position.set(Math.cos(a) * 0.03, Math.sin(a) * 0.03, -0.038)
    rib.rotation.z = a
    g.add(rib)
  }
  return g
}

/**
 * 卡通但比例靠真人。身高 1.62 米，脚底正好在地面 y=0。
 * 关节都是 Group，转它就能带动整条肢体。
 */
export function makeHumanoid(opts) {
  const o = opts || {}
  const skin = mat(o.skin || 0xf3c9a0)
  const shirt = mat(o.shirt || 0x3d8fd8)
  const trim = mat(o.trim || 0xffffff)
  const shorts = mat(o.shorts || 0x1c2637)
  const shoe = mat(o.shoe || 0x2ecc71)
  const dark = mat(0x241f1c)

  const root = new THREE.Group()
  const joints = {}

  // 髋部是整身的根
  const hips = new THREE.Group()
  hips.position.y = H.hip
  root.add(hips)
  joints.hips = hips

  // 躯干：上宽下窄，像收腰
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.125, 0.44, 16), shirt)
  torso.position.y = 0.22
  hips.add(torso)
  joints.torso = torso

  // 胸口一圈浅色条，让队服有层次
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.158, 0.158, 0.035, 16), trim)
  chest.position.y = 0.4
  hips.add(chest)

  // 肩部圆角
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), shirt)
  shoulders.scale.set(0.2, 0.085, 0.125)
  shoulders.position.y = 0.44
  hips.add(shoulders)

  // 脖子
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.07, 10), skin)
  neck.position.y = 0.505
  hips.add(neck)

  // 头
  const head = new THREE.Group()
  head.position.y = H.head - H.hip
  hips.add(head)
  const skull = new THREE.Mesh(new THREE.SphereGeometry(H.headR, 22, 16), skin)
  skull.scale.set(0.94, H.headScaleY, 1)
  head.add(skull)

  // 鼻子：有个侧面轮廓，近看不像个球
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.021, 0.05, 8), skin)
  nose.rotation.x = Math.PI / 2
  nose.position.set(0, -0.008, 0.1)
  head.add(nose)

  // 耳朵
  for (let s = -1; s <= 1; s += 2) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), skin)
    ear.position.set(s * 0.098, 0, 0)
    ear.scale.set(0.5, 1, 0.8)
    head.add(ear)
  }

  // 头发（半球）
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(H.headR * 1.03, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
    dark
  )
  hair.scale.set(0.95, 1.08, 1.01)
  head.add(hair)

  // 眼睛
  for (let s = -1; s <= 1; s += 2) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0145, 10, 8), dark)
    eye.position.set(s * 0.038, 0.012, 0.092)
    head.add(eye)
  }
  joints.head = head

  // 胳膊：肩 → 肘 → 手，手是实体球，握着球拍
  const arms = []
  for (let s = -1; s <= 1; s += 2) {
    const shoulder = new THREE.Group()
    shoulder.position.set(s * 0.185, 0.44, 0)
    hips.add(shoulder)
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.19, 4, 12), skin)
    upper.position.y = -0.135
    shoulder.add(upper)

    const elbow = new THREE.Group()
    elbow.position.y = -0.27
    shoulder.add(elbow)
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.19, 4, 12), skin)
    fore.position.y = -0.125
    elbow.add(fore)

    const hand = new THREE.Group()
    hand.position.y = -0.25
    elbow.add(hand)
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin)
    palm.scale.set(0.85, 1.15, 0.75)
    hand.add(palm)

    arms.push({ shoulder: shoulder, elbow: elbow, hand: hand })
  }
  joints.leftArm = arms[0]
  joints.rightArm = arms[1]

  // 腿：髋 → 膝 → 脚，脚底正好在 0
  const legs = []
  for (let s = -1; s <= 1; s += 2) {
    const hip = new THREE.Group()
    hip.position.set(s * 0.085, -H.hipDrop, 0)
    hips.add(hip)
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.29, 4, 12), shorts)
    thigh.position.y = -0.2
    hip.add(thigh)

    const knee = new THREE.Group()
    knee.position.y = -H.thigh
    hip.add(knee)
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.28, 4, 12), skin)
    shin.position.y = -0.19
    knee.add(shin)

    // 脚：膝在局部 -0.4（世界 0.44），脚心放到局部 -0.405 → 世界 0.035，
    // 加上 0.07 的厚度，脚底正好落在 y = 0
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.085, H.footHeight, 0.22), shoe)
    foot.position.set(0, -H.shin, 0.05)
    knee.add(foot)
    legs.push({ hip: hip, knee: knee, foot: foot })
  }
  joints.leftLeg = legs[0]
  joints.rightLeg = legs[1]

  return { root: root, joints: joints, height: 1.62 }
}

// 空着的那只手，发球抛球用
export function makeFreeHand() {
  const g = new THREE.Group()
  const skin = mat(0xf3c9a0)
  const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.19, 4, 12), skin)
  fore.position.y = -0.1
  g.add(fore)
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin)
  palm.scale.set(0.85, 1.15, 0.75)
  palm.position.y = -0.23
  g.add(palm)
  return g
}

// 让对手看起来不是木头：呼吸起伏 + 小碎步
export function animateIdle(joints, t, moving) {
  joints.hips.position.y = H.hip + Math.sin(t * 2.1) * 0.012
  joints.torso.rotation.z = Math.sin(t * 1.3) * 0.03
  const swing = moving ? Math.sin(t * 9) * 0.5 : Math.sin(t * 1.7) * 0.06
  joints.leftLeg.hip.rotation.x = swing
  joints.rightLeg.hip.rotation.x = -swing
  joints.leftLeg.knee.rotation.x = moving ? Math.abs(swing) * 0.5 : 0.04
  joints.rightLeg.knee.rotation.x = moving ? Math.abs(swing) * 0.5 : 0.04
}
