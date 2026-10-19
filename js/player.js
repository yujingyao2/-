// 第一人称控制：鼠标转视角，WASD 走位，空格起跳，按住鼠标蓄力、松开挥拍。
//
// 挥拍沿一条关键帧路径走（见 swing.js）：头顶、平抽、下手挑、反手四种动作。
// 球拍顶端的位置不是估算的——球拍模型上挂了一个标记点，直接读它的世界坐标，
// 所以"判定用的位置"和"你看到的位置"永远是同一个。

import THREE from './three.js'
import { PLAYER, COURT } from './config.js'
import { makeHumanoid, makeRacket, makeFreeHand, applyRacketSkin } from './character.js'
import { strafeRight } from './rules.js'
import { samplePath, pathByName, READY_POSE } from './swing.js'

const LOOK_SPEED = 0.0022
const MAX_PITCH = Math.PI / 2.4
const TOSS_DUR = 0.62
const TOSS_RELEASE = 0.42

// 检视姿势：拍面凑到眼前、几乎正对镜头。
// 拍头落在画面正中，拍面大约占屏幕高度的三分之二；手在画面下方之外，
// 所以看到的是"把拍子举到眼前"而不是一只手挡着拍面。
// 注意拍面必须垂直于拍杆，所以"拍杆朝镜头"和"拍面朝镜头"不能同时成立；
// 正确姿势是拍杆竖起来、拍面转向镜头。
const REST_POS = new THREE.Vector3(0.44, -0.3, -0.34)
const REST_ROT = new THREE.Vector3(-0.3, 0.15, -0.15)
const INSPECT_POS = new THREE.Vector3(0.015, -0.527, -0.38)
const INSPECT_ROT = new THREE.Vector3(1.566, -0.025, 0.076)
const INSPECT_SECONDS = 3.2

function smooth01(x) {
  const v = Math.max(0, Math.min(1, x))
  return v * v * (3 - 2 * v)
}

export function createPlayer(camera, scene) {
  const body = makeHumanoid({ shirt: 0xff8a3d, shorts: 0x27324a, shoe: 0x1f2937 })
  body.root.visible = false
  scene.add(body.root)

  const armRig = new THREE.Group()
  armRig.position.set(0.52, 0.16, 0.22)
  camera.add(armRig)

  // 手臂单独挂在 armRoot 上：它只跟着"手的位置"平移，不跟着球拍的旋转转。
  // 否则每次球拍摆姿势，小臂都会跟着甩起来，看着像关节脱臼。
  const armRoot = new THREE.Group()
  camera.add(armRoot)

  const skinMat = new THREE.MeshLambertMaterial({ color: 0xf3c9a0 })
  const armMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.042, 0.26, 4, 12),
    skinMat
  )
  {
    // 小臂从手心往右下后方（肩膀方向）伸出去
    const dir = new THREE.Vector3(0.09, -0.34, 0.21).normalize()
    armMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    armMesh.position.copy(dir).multiplyScalar(0.15)
  }
  armRoot.add(armMesh)

  // 手掌：握在拍柄底部，让"握着"这件事看得见
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), skinMat)
  palm.scale.set(0.85, 1.2, 0.8)
  armRoot.add(palm)

  const racket = makeRacket()
  // 拍柄底部就在手心，拍杆朝前上方伸出——正常的握拍姿态
  racket.position.set(0, 0, 0)
  racket.rotation.set(-1.25, 0.08, 0)
  armRig.add(racket)

  // 发球抛球用的那只手
  const freeHand = makeFreeHand()
  freeHand.visible = false
  camera.add(freeHand)

  const S = {
    pos: new THREE.Vector3(0, 0, 4.4),
    vel: new THREE.Vector3(),
    vy: 0,
    grounded: true,
    yaw: 0,
    pitch: -0.12,
    keys: { w: false, a: false, s: false, d: false, shift: false },
    grip: 'forehand',
    crouch: false,
    charging: false,
    button: 'left',
    chargeStart: 0,
    power: 0,
    swing: null,
    swingT: 0,
    rigPos: REST_POS.clone(),
    rigRot: REST_ROT.clone(),
    gripRoll: 0,              // 换握拍时拍面翻转的进度
    gripTurn: 0,              // 换握拍时那一下手腕抖动的余量
    inspect: 0,               // 检视动作进度：1 → 0
    inspectSpin: 0,           // 检视时球拍转动角度
    toss: null,
    sens: 1,                  // 鼠标灵敏度倍率，菜单里可调
    walked: 0,                // 累计走了多远（教学关卡用）
    jumps: 0,                 // 跳了几次（教学关卡用）
    speedNow: 0
  }

  const forward = new THREE.Vector3()
  const right = new THREE.Vector3()
  const tmp = new THREE.Vector3()
  const tossWorld = new THREE.Vector3()

  function applyCamera() {
    const eye = PLAYER.eyeHeight * (S.crouch ? PLAYER.crouchEye : 1)
    camera.position.set(S.pos.x, S.pos.y + eye, S.pos.z)
    camera.rotation.set(0, 0, 0)
    camera.rotateY(S.yaw)
    camera.rotateX(S.pitch)
  }

  function clampToCourt() {
    S.pos.x = Math.max(-5.2, Math.min(5.2, S.pos.x))
    S.pos.z = Math.max(0.42, Math.min(COURT.halfLength + 1.1, S.pos.z))
  }

  function update(dt, t) {
    camera.getWorldDirection(forward)
    forward.y = 0
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1)
    forward.normalize()
    const rv = strafeRight(forward.x, forward.z)
    right.set(rv.x, 0, rv.z).normalize()

    const wantX = (S.keys.d ? 1 : 0) - (S.keys.a ? 1 : 0)
    const wantZ = (S.keys.w ? 1 : 0) - (S.keys.s ? 1 : 0)
    const maxSpeed = (S.keys.shift ? PLAYER.sprintSpeed : PLAYER.walkSpeed) *
      (S.crouch ? PLAYER.crouchSpeed : 1)

    tmp.set(0, 0, 0)
    if (wantX || wantZ) {
      tmp.addScaledVector(right, wantX)
      tmp.addScaledVector(forward, wantZ)
      tmp.normalize().multiplyScalar(maxSpeed)
    }
    const a = tmp.lengthSq() > 0 ? PLAYER.accel : PLAYER.friction
    S.vel.x += (tmp.x - S.vel.x) * Math.min(1, (a * dt) / maxSpeed)
    S.vel.z += (tmp.z - S.vel.z) * Math.min(1, (a * dt) / maxSpeed)
    S.pos.x += S.vel.x * dt
    S.pos.z += S.vel.z * dt
    S.speedNow = Math.sqrt(S.vel.x * S.vel.x + S.vel.z * S.vel.z)
    S.walked += S.speedNow * dt

    if (!S.grounded) {
      S.vy -= PLAYER.gravity * dt
      S.pos.y += S.vy * dt
      if (S.pos.y <= 0) {
        S.pos.y = 0
        S.vy = 0
        S.grounded = true
      }
    }
    clampToCourt()
    applyCamera()

    // ---- 手臂姿势 ----
    if (S.swing) {
      S.swing.elapsed += dt
      const total = PLAYER.swingWindup + PLAYER.swingActive + PLAYER.swingRecover
      S.swingT = Math.min(1, S.swing.elapsed / total)
      const windupT = (PLAYER.swingWindup * 0.45) / total
      const pathT = Math.max(0, Math.min(1, (S.swingT - windupT) / (1 - windupT)))
      const pose = samplePath(S.swing.path, pathT)
      S.rigPos.set(pose.p[0], pose.p[1], pose.p[2])
      S.rigRot.set(pose.r[0], pose.r[1], pose.r[2])
      if (S.swingT >= 1) {
        S.swing = null
        S.swingT = 0
      }
    } else if (S.charging) {
      const u = Math.min(1, (performance.now() - S.chargeStart) / PLAYER.powerFullMs)
      S.rigPos.set(
        READY_POSE.p[0] + 0.06 * u,
        READY_POSE.p[1] + 0.16 * u,
        READY_POSE.p[2] + 0.1 * u
      )
      S.rigRot.set(READY_POSE.r[0] - 0.2 * u, READY_POSE.r[1], READY_POSE.r[2] - 0.15 * u)
    } else if (S.inspect > 0) {
      // 检视：先平滑送到眼前，停住左右轻转，最后退回持拍姿势。
      // 用一条 blend 曲线控制进出，避免"啪"一下瞬移。
      S.inspect = Math.max(0, S.inspect - dt / INSPECT_SECONDS)
      const u = 1 - S.inspect
      const inK = smooth01(u / 0.18) * (1 - smooth01((u - 0.8) / 0.2))
      S.rigPos.lerpVectors(REST_POS, INSPECT_POS, inK)
      S.rigRot.lerpVectors(REST_ROT, INSPECT_ROT, inK)
      // 左右各转约 24 度，让拍线和图案在光下有变化
      S.inspectSpin = inK * Math.sin(u * Math.PI * 2) * 0.42
    } else {
      S.rigPos.set(REST_POS.x, REST_POS.y + Math.sin(t * 1.8) * 0.012, REST_POS.z)
      S.rigRot.copy(REST_ROT)
      // 检视结束后让自转平滑归零，不要"啪"一下弹回去
      S.inspectSpin += (0 - S.inspectSpin) * Math.min(1, dt * 8)
    }

    // 手臂跟随路径的速度。原来是 dt*26（大约 5 帧才到位，看着就慢半拍），
    // 现在跟得更紧，路径本身的缓动已经够柔和了。
    const k = Math.min(1, dt * 60)
    armRig.position.lerp(S.rigPos, k)
    armRoot.position.copy(armRig.position)
    armRig.rotation.x += (S.rigRot.x - armRig.rotation.x) * k
    armRig.rotation.y += (S.rigRot.y - armRig.rotation.y) * k
    armRig.rotation.z += (S.rigRot.z - armRig.rotation.z) * k

    // 换握拍：拍面翻 180 度（正手/反手），过程中再抖一下手腕，
    // 让"改握拍"这件事看得见，而不只是 HUD 上的字变了。
    const wantRoll = S.grip === 'backhand' ? Math.PI : 0
    const turnK = Math.min(1, dt * 9)
    S.gripTurn = Math.max(0, S.gripTurn - dt * 2.2)
    if (Math.abs(wantRoll - S.gripRoll) > 0.001) S.gripTurn = 1
    S.gripRoll += (wantRoll - S.gripRoll) * turnK
    racket.rotation.y = 0.08 + S.gripRoll + S.inspectSpin
    armRig.rotation.z += Math.sin(S.gripTurn * Math.PI) * 0.22

    // ---- 抛球 ----
    if (S.toss) {
      S.toss.t += dt
      const u = Math.min(1, S.toss.t / TOSS_DUR)
      const rise = Math.min(1, u / TOSS_RELEASE)
      freeHand.visible = u < 0.95
      freeHand.position.set(0.06 - 0.05 * rise, -0.72 + 0.72 * rise, -0.34 - 0.1 * rise)
      freeHand.rotation.set(-0.5 + 1.1 * rise, 0, 0.2 - 0.35 * rise)
      if (!S.toss.released && u >= TOSS_RELEASE) S.toss.released = true
      if (u >= 1) S.toss = null
    } else {
      freeHand.visible = false
    }

    body.root.position.set(S.pos.x, S.pos.y, S.pos.z)
    body.root.rotation.y = S.yaw + Math.PI
    // 蹲下：整个人缩下去一点，看着就是蹲着
    body.joints.hips.position.y = S.crouch ? 0.56 : 0.86
    body.joints.leftLeg.knee.rotation.x = S.crouch ? 1.0 : 0.04
    body.joints.rightLeg.knee.rotation.x = S.crouch ? 1.0 : 0.04
    body.joints.torso.rotation.x = S.crouch ? 0.22 : 0
  }

  return {
    state: S,
    body: body,
    update: update,
    setBodyVisible: function (v) {
      body.root.visible = v
      armRig.visible = !v
      armRoot.visible = !v
      if (v) freeHand.visible = false
    },
    look: function (dx, dy) {
      S.yaw -= dx * LOOK_SPEED * S.sens
      S.pitch -= dy * LOOK_SPEED * S.sens
      S.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, S.pitch))
    },
    setSensitivity: function (v) {
      S.sens = Math.max(0.1, Math.min(4, v))
      return S.sens
    },
    sensitivity: function () {
      return S.sens
    },
    key: function (code, down) {
      if (code === 'KeyW') S.keys.w = down
      else if (code === 'KeyS') S.keys.s = down
      else if (code === 'KeyA') S.keys.a = down
      else if (code === 'KeyD') S.keys.d = down
      else if (code === 'ShiftLeft' || code === 'ShiftRight') S.keys.shift = down
      // 蹲下。Ctrl 是需求里指定的键，但浏览器里 Ctrl+W 是关标签页、
      // 页面上拦不住，所以同时接受 C 键当替身。
      else if (code === 'ControlLeft' || code === 'ControlRight' || code === 'KeyC') S.crouch = down
      else if (code === 'Space' && down && S.grounded) {
        S.vy = PLAYER.jumpSpeed
        S.grounded = false
        S.jumps++
        return true
      }
      return false
    },
    resetCounters: function () {
      S.walked = 0
      S.jumps = 0
    },
    startCharge: function (button, now) {
      S.inspect = 0          // 一挥拍就结束检视
      S.inspectSpin = 0
      S.charging = true
      S.button = button
      S.chargeStart = now
      S.power = 0
    },
    startToss: function () {
      S.toss = { t: 0, released: false }
    },
    startInspect: function () {
      if (S.swing || S.charging) return false
      S.inspect = 1
      S.inspectSpin = 0
      return true
    },
    inspecting: function () {
      return S.inspect > 0
    },
    endInspect: function () {
      S.inspect = 0
      S.inspectSpin = 0
    },
    applySkin: function (skin) {
      applyRacketSkin(racket, skin)
    },
    tossReleased: function () {
      return !!(S.toss && S.toss.released)
    },
    tossing: function () {
      return !!S.toss
    },
    freeHandWorld: function () {
      camera.updateMatrixWorld(true)
      return tossWorld.setFromMatrixPosition(freeHand.matrixWorld)
    },
    releaseCharge: function (now) {
      if (!S.charging) return null
      const holdMs = now - S.chargeStart
      S.charging = false
      S.power = Math.max(0, Math.min(1, holdMs / PLAYER.powerFullMs))
      return { button: S.button, holdMs: holdMs, keys: S.keys, power: S.power }
    },
    beginSwing: function (pathName) {
      const path = pathByName(pathName)
      S.swing = { elapsed: 0, path: path, pathName: pathName }
      S.swingT = 0
      return path
    },
    grip: function () {
      return S.grip
    },
    setGrip: function (key) {
      S.grip = key
    },
    // 只有挥拍的中段能碰到球（前摇和收招不算）
    inSwingWindow: function () {
      if (!S.swing) return false
      const e = S.swing.elapsed
      return e >= PLAYER.swingWindup && e <= PLAYER.swingWindup + PLAYER.swingActive
    },
    airborne: function () {
      return !S.grounded
    },
    crouching: function () {
      return S.crouch
    },
    swinging: function () {
      return !!S.swing
    },
    charging: function () {
      return S.charging
    },
    chargeRatio: function (now) {
      if (!S.charging) return 0
      return Math.max(0, Math.min(1, (now - S.chargeStart) / PLAYER.powerFullMs))
    },
    power: function () {
      return S.power
    }
  }
}
