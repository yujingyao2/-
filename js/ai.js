// 对手。不追求打得聪明，追求"看起来在打球"：
// 预判落点 → 按难度反应 → 跑过去 → 到点了挥拍回球。
//
// 难度不是只改一个随机失误率：
//   - 低难度反应慢、跑得慢、看落点偏，面对快扣杀经常来不及；
//   - 高难度预判快、覆盖范围大，会主动扣杀和挑后场；
//   - 所有难度都可能挂网或出界，只是概率不同。

import THREE from './three.js'
import { AI_LEVELS, COURT } from './config.js'
import { makeHumanoid, makeRacket, animateIdle } from './character.js'
import * as physics from './physics.js'

const tmpTarget = new THREE.Vector3()

function randSigned() {
  return Math.random() * 2 - 1
}

export function createAI(scene) {
  const body = makeHumanoid({ shirt: 0x4fc3f7, shorts: 0x1c2637, shoe: 0x2ecc71, skin: 0xf0c49a })
  scene.add(body.root)

  const racket = makeRacket()
  body.joints.rightArm.hand.add(racket)
  // 握拍姿势：手握在拍柄底部（球拍原点就是柄底），拍杆顺着前臂的方向伸出去。
  // 手在手腕处，前臂朝 -y 延伸，所以把球拍绕 x 转 180°，
  // 它的 +y（拍头方向）就指向前臂外侧，看着才像真在握拍。
  racket.position.set(0, 0, 0)
  racket.rotation.set(Math.PI, 0, 0)

  let level = AI_LEVELS.normal

  const S = {
    pos: new THREE.Vector3(0, 0, -4.4),
    home: new THREE.Vector3(0, 0, -4.4),
    target: new THREE.Vector3(0, 0, -4.4),
    planned: null,
    reactionTimer: 0,
    cooldown: 0,
    swingT: 0,
    swing: 0,
    swingKind: 'overhead',
    jump: 0,
    serveAnim: 0,
    serveTimer: 0,
    serveReadyFlag: false,
    planAt: -999,          // 上次预判落点的时间，用来限流
    moving: false,
    wasIncoming: false,    // 这一拍是不是已经在处理了
    incomingFast: false,
    willWhiff: false,       // 这一拍判断失误，够到也不挥
    planErrX: 0,
    planErrZ: 0,
    levelKey: 'normal'
  }

  function clampSide(v) {
    v.x = Math.max(-4.6, Math.min(4.6, v.x))
    v.z = Math.max(-COURT.halfLength - 0.9, Math.min(-0.5, v.z))
    return v
  }

  function setDifficulty(key) {
    const next = AI_LEVELS[key] || AI_LEVELS.normal
    level = next
    S.levelKey = next.key
    S.planned = null
    S.wasIncoming = false
    S.willWhiff = false
    S.reactionTimer = 0
    return next.key
  }

  // 回球落点：按球路选择大概区域，再叠一点难度对应的误差
  function pointInPlayerCourt(kind) {
    const err = level.aimError
    let zMin = 1.5
    let zMax = COURT.halfLength - 0.6
    if (kind === 'smash') {
      zMin = 2.0
      zMax = 5.2
    } else if (kind === 'deep') {
      zMin = COURT.halfLength - 2.2
      zMax = COURT.halfLength - 0.6
    } else if (kind === 'short') {
      zMin = 1.2
      zMax = 3.0
    }
    let x = randSigned() * (COURT.halfWidthSingles - 0.35) + randSigned() * err
    let z = zMin + Math.random() * (zMax - zMin) + randSigned() * err
    x = Math.max(-COURT.halfWidthSingles, Math.min(COURT.halfWidthSingles, x))
    z = Math.max(0.9, Math.min(COURT.halfLength - 0.2, z))
    return { x: x, z: z }
  }

  // 预判落点。只在"球开始往我这边飞"的那一刻决定反应时间和落点误差，
  // 之后每 0.12 秒只更新预测位置，不会把反应计时器反复重置。
  function planTarget(shuttle) {
    if (shuttle.vz >= -0.2) {
      S.planned = null
      S.wasIncoming = false
      S.willWhiff = false
      return
    }

    if (!S.wasIncoming) {
      S.wasIncoming = true
      const speed = physics.speedOf(shuttle)
      // 扣杀/快平球：速度高、弧线不往上走。高远球速度也快，但 vy 很大。
      const fast = speed > 29 && shuttle.vy < 5
      S.incomingFast = fast
      S.reactionTimer = level.reaction + (fast ? level.smashReact : 0)
      S.willWhiff = Math.random() < (fast ? level.whiffFast : level.whiffSlow)
      const errMul = fast ? 1.25 : 1
      S.planErrX = randSigned() * level.trackError * errMul
      S.planErrZ = randSigned() * level.trackError * 0.35 * errMul
    }

    const r = physics.predict(shuttle, 4)
    S.planned = {
      x: r.x + S.planErrX,
      z: r.z + S.planErrZ
    }
  }

  function update(dt, t, shuttle) {
    S.cooldown = Math.max(0, S.cooldown - dt)
    S.reactionTimer = Math.max(0, S.reactionTimer - dt)

    // 发球抛球动作：手抬起来，抬到位才算准备好
    if (S.serveAnim > 0) {
      S.serveTimer -= dt
      const u = Math.max(0, Math.min(1, 1 - S.serveTimer / 0.5))
      body.joints.rightArm.shoulder.rotation.x = -0.5 - 2.4 * u
      body.joints.rightArm.elbow.rotation.x = -0.75 - 0.4 * u
      if (S.serveTimer <= 0) {
        S.serveAnim = 0
        S.serveReadyFlag = true
      }
      body.root.position.set(S.pos.x, 0, S.pos.z)
      body.root.rotation.y = 0
      return
    }

    // 预判落点是全流程最贵的一步（一次要推进上千个物理小步），
    // 每帧都算会明显卡顿，所以每 0.12 秒算一次就够——球的位置变化没这么快。
    if (t - S.planAt > 0.12) {
      S.planAt = t
      planTarget(shuttle)
    }

    // 反应没完成之前先不启动，看起来才像"愣了一下"。
    if (S.planned && S.reactionTimer <= 0) {
      tmpTarget.set(S.planned.x, 0, S.planned.z)
      S.target.copy(clampSide(tmpTarget))
    } else if (!S.planned) {
      S.target.copy(S.home)
    }

    const dx = S.target.x - S.pos.x
    const dz = S.target.z - S.pos.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    S.moving = dist > 0.12 && S.reactionTimer <= 0
    if (S.moving) {
      const step = Math.min(level.walkSpeed * dt, dist)
      S.pos.x += (dx / dist) * step
      S.pos.z += (dz / dist) * step
    }

    animateIdle(body.joints, t, S.moving)

    // 扣杀时人跟着跳一下，让"高手会扣杀"看得出来
    if (S.jump > 0) S.jump = Math.max(0, S.jump - dt / 0.42)
    const jumpY = S.jump > 0 ? Math.sin((1 - S.jump) * Math.PI) * 0.42 : 0
    body.root.position.set(S.pos.x, jumpY, S.pos.z)
    body.root.rotation.y = 0   // 面朝 +z（玩家那边）

    // 挥拍动画：头顶扣杀、平抽、下手挑三种动作分开
    if (S.swing > 0) {
      S.swing = Math.max(0, S.swing - dt / 0.35)
      S.swingT = 1 - S.swing
      const sn = Math.sin(S.swingT * Math.PI)
      if (S.swingKind === 'underarm') {
        body.joints.rightArm.shoulder.rotation.x = -0.9 + 2.0 * sn
        body.joints.rightArm.elbow.rotation.x = -0.45 + 0.55 * sn
      } else if (S.swingKind === 'drive') {
        body.joints.rightArm.shoulder.rotation.x = -1.2 * sn
        body.joints.rightArm.elbow.rotation.x = -0.4 * sn
      } else {
        body.joints.rightArm.shoulder.rotation.x = -2.2 * sn
        body.joints.rightArm.elbow.rotation.x = -0.6 * sn
      }
    } else {
      body.joints.rightArm.shoulder.rotation.x = -0.5
      body.joints.rightArm.elbow.rotation.x = -0.75
    }
  }

  // 能不能够到这个球
  function canReach(shuttle) {
    if (S.cooldown > 0) return false
    if (S.willWhiff) return false
    if (S.reactionTimer > 0) return false
    if (shuttle.vz >= 0) return false                 // 球在往玩家那边飞
    if (shuttle.z > -0.35) return false               // 还没过网
    const dx = shuttle.x - S.pos.x
    const dz = shuttle.z - S.pos.z
    const horiz = Math.sqrt(dx * dx + dz * dz)
    return horiz <= level.reach + level.reachBonus &&
      shuttle.y > 0.3 && shuttle.y < 2.65
  }

  // 按击球高度选球路：高球会扣杀/高远，低球会挑后场/放网，腰位会平抽
  function chooseShot(contactY) {
    const r = Math.random()
    if (contactY >= 1.95) {
      if (r < level.smashChance) {
        return { kind: 'smash', pitch: 2, speed: level.smashSpeed, aim: 'smash', swing: 'overhead', jump: true }
      }
      return { kind: 'clear', pitch: 40, speed: 36, aim: 'deep', swing: 'overhead' }
    }
    if (contactY <= 1.25) {
      if (r < level.liftChance) {
        return { kind: 'lift', pitch: 40, speed: 34, aim: 'deep', swing: 'underarm' }
      }
      return { kind: 'drop', pitch: 18, speed: 17, aim: 'short', swing: 'underarm' }
    }
    if (r < 0.18) {
      return { kind: 'lift', pitch: 38, speed: 30, aim: 'deep', swing: 'underarm' }
    }
    if (r < 0.78) {
      return { kind: 'drive', pitch: 12, speed: 27, aim: 'mid', swing: 'drive' }
    }
    return { kind: 'drop', pitch: 18, speed: 17, aim: 'short', swing: 'drive' }
  }

  // 挥拍：把球打回玩家半场
  function hit(shuttle) {
    const shot = chooseShot(shuttle.y)
    const aim = pointInPlayerCourt(shot.aim)
    let pitch = shot.pitch
    let speed = shot.speed
    let kind = shot.kind

    // 速度给一点随机，避免每一拍都像复制粘贴
    speed *= 0.96 + Math.random() * 0.08
    pitch += randSigned() * 1.5

    // 低难度也会挂网/出界，但概率比"接不到"低
    const err = Math.random()
    if (err < level.outChance) {
      kind = 'out'
      aim.x = (Math.random() < 0.5 ? -1 : 1) * (COURT.halfWidthSingles + 1.2)
      aim.z = COURT.halfLength + 1.2
      pitch = 34
      speed = 40
    } else if (err < level.outChance + level.netChance) {
      kind = 'net'
      aim.x = 0
      aim.z = 2.0
      pitch = -16
      speed = 15
    }

    const dx = aim.x - shuttle.x
    const dz = aim.z - shuttle.z
    const v = physics.velocityFrom(dx, dz, pitch, speed)
    shuttle.vx = v.vx
    shuttle.vy = v.vy
    shuttle.vz = v.vz
    shuttle.y = Math.max(shuttle.y, 0.35)

    S.cooldown = level.swingCooldown
    S.swingKind = shot.swing
    S.swing = 1
    S.swingT = 0
    if (shot.jump) S.jump = 1
    S.planned = null
    S.wasIncoming = false
    S.willWhiff = false
    S.reactionTimer = 0
    return { kind: kind, speed: speed }
  }

  function beginServe() {
    S.serveAnim = 1
    S.serveTimer = 0.5
    S.serveReadyFlag = false
  }

  function serveReady() {
    return S.serveReadyFlag
  }

  function launchServe(shuttle, targetX) {
    shuttle.x = S.pos.x
    shuttle.y = 1.15
    shuttle.z = S.pos.z + 0.2
    const aimX = targetX === undefined ? randSigned() * 1.8 : targetX
    const dx = aimX - shuttle.x
    const dz = 4.6 - shuttle.z
    // 发球速度是单独标定的：26 米/秒、仰角 26°，正好落在玩家的斜对角发球区
    const v = physics.velocityFrom(dx, dz, 26, 26)
    shuttle.vx = v.vx
    shuttle.vy = v.vy
    shuttle.vz = v.vz
    S.swingKind = 'overhead'
    S.swing = 1
    S.swingT = 0
    S.serveReadyFlag = false
  }

  setDifficulty('normal')

  return {
    state: S,
    body: body,
    update: update,
    canReach: canReach,
    hit: hit,
    beginServe: beginServe,
    serveReady: serveReady,
    launchServe: launchServe,
    setDifficulty: setDifficulty,
    difficulty: function () { return S.levelKey },
    level: function () { return level },
    reset: function () {
      S.pos.copy(S.home)
      S.target.copy(S.home)
      S.planned = null
      S.cooldown = 0
      S.swing = 0
      S.swingT = 0
      S.swingKind = 'overhead'
      S.jump = 0
      S.serveAnim = 0
      S.serveReadyFlag = false
      S.reactionTimer = 0
      S.wasIncoming = false
      S.willWhiff = false
      S.planErrX = 0
      S.planErrZ = 0
      S.planAt = -999
    }
  }
}
