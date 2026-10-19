// 球的拖尾和击球特效。
// 拖尾用一条逐顶点着色的线：头部亮、尾部暗，配合叠加混合就是"渐渐淡掉"。

import THREE from './three.js'

/**
 * 假影子：一张带径向渐变的圆片，贴在地面上。
 * 真阴影（shadowMap）会把场景里所有"会投影"的网格再画一遍，
 * 这个场景里有一百多个网格，等于每帧多画一百多次，是帧率最大的杀手。
 * 卡通风格用假影子完全够看，代价几乎为零。
 */
export function makeBlobShadow(size) {
  const cv = document.createElement('canvas')
  cv.width = 128
  cv.height = 128
  const g = cv.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62)
  grad.addColorStop(0, 'rgba(6, 10, 14, 0.55)')
  grad.addColorStop(0.55, 'rgba(6, 10, 14, 0.24)')
  grad.addColorStop(1, 'rgba(6, 10, 14, 0)')
  g.fillStyle = grad
  g.beginPath()
  g.arc(64, 64, 62, 0, Math.PI * 2)
  g.fill()

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(cv),
      transparent: true,
      depthWrite: false
    })
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.renderOrder = 1
  return mesh
}

export function createTrail(scene) {
  const MAX = 28
  const positions = new Float32Array(MAX * 3)
  const colors = new Float32Array(MAX * 3)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setDrawRange(0, 0)

  const lineMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
  const line = new THREE.Line(geo, lineMat)
  line.frustumCulled = false
  line.visible = false
  scene.add(line)

  let pts = []
  let sinceSample = 0

  return {
    push: function (x, y, z) {
      pts.push({ x: x, y: y, z: z })
      if (pts.length > MAX) pts.shift()
    },
    // 按距离采样：球慢的时候不要塞一堆同位置的点，不然拖尾会糊成一团
    update: function (shuttle, dt, speed) {
      sinceSample += dt
      const last = pts[pts.length - 1]
      const moved = last
        ? Math.sqrt(Math.pow(shuttle.x - last.x, 2) + Math.pow(shuttle.y - last.y, 2) + Math.pow(shuttle.z - last.z, 2))
        : 99
      if (speed > 3.5 && (moved > 0.05 || sinceSample > 0.05)) {
        sinceSample = 0
        this.push(shuttle.x, shuttle.y, shuttle.z)
      }
      if (speed < 1.2 || pts.length < 3) {
        line.visible = false
        if (speed < 1.2) pts = []
        return
      }

      const n = pts.length
      for (let i = 0; i < n; i++) {
        positions[i * 3] = pts[i].x
        positions[i * 3 + 1] = pts[i].y
        positions[i * 3 + 2] = pts[i].z
        const t = n > 1 ? i / (n - 1) : 1
        const c = Math.pow(t, 1.6)
        colors[i * 3] = c * 0.75
        colors[i * 3 + 1] = c * 0.95
        colors[i * 3 + 2] = c
      }
      geo.setDrawRange(0, n)
      geo.attributes.position.needsUpdate = true
      geo.attributes.color.needsUpdate = true
      line.visible = true
    },
    clear: function () {
      pts = []
      geo.setDrawRange(0, 0)
      line.visible = false
    }
  }
}

export function createFx(scene) {
  const pool = []
  const ringGeo = new THREE.TorusGeometry(0.26, 0.032, 8, 30)
  const flashGeo = new THREE.SphereGeometry(0.085, 14, 12)

  function spawn(pos, dir, big) {
    const ringMat = new THREE.MeshBasicMaterial({
      color: big ? 0xffd166 : 0xfff2c8,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.position.copy(pos)
    ring.lookAt(pos.x + dir.x, pos.y + dir.y, pos.z + dir.z)
    scene.add(ring)

    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    const flash = new THREE.Mesh(flashGeo, flashMat)
    flash.position.copy(pos)
    scene.add(flash)

    pool.push({
      ring: ring,
      ringMat: ringMat,
      flash: flash,
      flashMat: flashMat,
      life: 0,
      max: big ? 0.42 : 0.3,
      grow: big ? 2.8 : 1.9
    })
  }

  function update(dt) {
    for (let i = pool.length - 1; i >= 0; i--) {
      const e = pool[i]
      e.life += dt
      const t = Math.min(1, e.life / e.max)
      const s = 0.35 + t * e.grow
      e.ring.scale.set(s, s, s)
      e.ringMat.opacity = (1 - t) * 0.95
      e.flash.scale.setScalar(0.4 + t * 2.4)
      e.flashMat.opacity = (1 - t) * 0.95
      if (t >= 1) {
        scene.remove(e.ring)
        scene.remove(e.flash)
        e.ringMat.dispose()
        e.flashMat.dispose()
        pool.splice(i, 1)
      }
    }
  }

  return { spawn: spawn, update: update, count: function () { return pool.length } }
}
