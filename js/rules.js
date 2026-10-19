// 纯逻辑：场地判定、发球规则、挥拍分类、计分。
// 不碰 3D，也不碰浏览器，所以能在本机直接测。

import { COURT, MATCH, SHOT_TABLE, CONTACT, GRIPS } from './config.js'

// ---------- 场地 ----------

export function inSingles(x, z) {
  return Math.abs(x) <= COURT.halfWidthSingles && Math.abs(z) <= COURT.halfLength
}

export function inDoubles(x, z) {
  return Math.abs(x) <= COURT.halfWidthDoubles && Math.abs(z) <= COURT.halfLength
}

// 落在谁的半场：+z 是玩家，-z 是对手
export function sideOf(z) {
  return z > 0 ? 1 : -1
}

// 发球区判定：必须落在对方半场，且和发球人在中线的两侧（对角发球）
// serverSide：+1 玩家发球，-1 对手发球；不传按玩家算
export function serveCourtOk(x, z, serverX, serverSide) {
  const side = serverSide === undefined ? 1 : serverSide
  if (side > 0 && z > 0) return false                       // 玩家发球要过网
  if (side < 0 && z < 0) return false                       // 对手发球同理
  if (Math.abs(x) > COURT.halfWidthSingles) return false
  if (Math.abs(z) < COURT.shortService) return false         // 没过前发球线
  if (Math.abs(z) > COURT.halfLength) return false
  return (x > 0) !== (serverX > 0)                           // 对角
}

// 球有没有碰网：在网面附近且低于网高
export function hitNet(x, y, z, prevZ) {
  const crossed = (prevZ > 0 && z <= 0) || (prevZ < 0 && z >= 0)
  if (!crossed) return false
  const netTop = COURT.netHeightCenter
  return y < netTop
}

// ---------- 挥拍 ----------

export function shotByKey(key) {
  for (let i = 0; i < SHOT_TABLE.length; i++) {
    if (SHOT_TABLE[i].key === key) return SHOT_TABLE[i]
  }
  return SHOT_TABLE[0]
}

export function gripLabel(key) {
  for (let i = 0; i < GRIPS.length; i++) {
    if (GRIPS[i].key === key) return GRIPS[i].label
  }
  return key
}

export function nextGrip(key) {
  for (let i = 0; i < GRIPS.length; i++) {
    if (GRIPS[i].key === key) return GRIPS[(i + 1) % GRIPS.length].key
  }
  return GRIPS[0].key
}

/**
 * 打什么球：握拍方式 + 击球点高度 + 站位，再乘上力度。
 * 长按时间决定力度（0.42 ~ 1.0），力度主要改球到得多快。
 */
export function classifyShot(input) {
  const grip = input.grip === 'backhand' ? 'backhand' : 'forehand'
  const y = input.contactY
  const netZ = Math.abs(input.playerZ)
  const power = Math.max(0, Math.min(1, input.power === undefined ? 0 : input.power))

  let key
  if (input.airborne) {
    // 挥拍那一刻人在空中 = 扣杀。跳起来是有代价的（落地前不能再跳），
    // 所以这里不设别的条件：想扣杀就得跳。
    key = grip === 'forehand' ? 'fh_smash' : 'bh_smash'
  } else if (input.crouch) {
    // 蹲着挥拍 = 挑飞，不管球在高还是低
    key = grip === 'forehand' ? 'fh_lift' : 'bh_lift'
  } else if (grip === 'forehand') {
    if (y >= CONTACT.high) key = netZ < CONTACT.netRange ? 'fh_net' : 'fh_clear'
    else if (y >= CONTACT.low) key = 'fh_drive'
    else key = 'fh_lift'
  } else {
    if (y >= CONTACT.high) key = 'bh_clear'
    else if (y >= CONTACT.low) key = 'bh_drive'
    else key = 'bh_lift'
  }

  const def = shotByKey(key)
  return {
    key: def.key,
    label: def.label,
    grip: def.grip,
    path: def.path,
    pitchDeg: def.pitchDeg,
    power: power,
    // 力度对速度的影响。羽毛球阻力大，速度差一点落点就差很多，所以区间要给宽。
    // 原来是 0.55~1.00，结果"最小力度打高远球"也能落到 6.8 米，
    // 玩家会觉得"只要打到球就一定飞很远"。现在是 0.30~1.00。
    speed: def.speed * (0.30 + 0.70 * power)
  }
}

/**
 * 击球判定范围：身前一个和人物等身的长方体。
 * 把球换算到"以你为原点、朝向你"的坐标里，看它在不在这个盒子内。
 * 盒子跟着你的脚走，所以跳起来整块升高、蹲下不动——也就是说
 * 跳起来才够得着高球，身高范围从一开始就决定了你能碰到哪些球。
 *
 * shuttle / feet: { x, y, z }；forward: 水平单位向量 { x, z }；box: { width, height, near, far }
 */
export function inHitBox(shuttle, feet, forward, box) {
  const dx = shuttle.x - feet.x
  const dy = shuttle.y - feet.y
  const dz = shuttle.z - feet.z

  if (dy < 0 || dy > box.height) return false

  const fwd = dx * forward.x + dz * forward.z          // 正前方多远
  if (fwd < box.near || fwd > box.far) return false

  const side = dx * -forward.z + dz * forward.x        // 右手方向偏了多少
  if (Math.abs(side) > box.width / 2) return false

  return true
}

// ---------- 计分 ----------

export function createMatch() {
  return { player: 0, ai: 0, server: 1, over: false, winner: 0 }
}

export function awardPoint(match, side) {
  if (match.over) return match
  if (side > 0) match.player++
  else match.ai++
  match.server = side
  const lead = Math.abs(match.player - match.ai)
  const top = Math.max(match.player, match.ai)
  if (top >= MATCH.target && (lead >= MATCH.winBy || top >= MATCH.cap)) {
    match.over = true
    match.winner = match.player > match.ai ? 1 : -1
  }
  return match
}

export function scoreText(match) {
  return match.player + ' : ' + match.ai
}

/**
 * 已知朝向（水平面上的单位向量），求"玩家的右手边"是哪个方向。
 * 右手系里 Y 朝上、相机看向 -z 时，正确的右方向是 forward × up，
 * 展开就是 (-fz, 0, fx)。这个符号很容易写反——写反了 A 和 D 就对调，
 * 所以单独拿出来测（见 tools/badminton-test.js）。
 */
export function strafeRight(fx, fz) {
  return { x: -fz, z: fx }
}

// ---------- 一次回合的胜负判定 ----------

/**
 * 球落地了，判这一分归谁。
 * 规则很直白：落在自己半场 = 丢分；落在对方半场界内 = 得分；
 * 出界或者没过网 = 丢分（不管是谁打出去的，先按最简单的方式算）。
 */
export function judgeLanding(x, z, lastHitter) {
  const side = sideOf(z)
  const good = inSingles(x, z)
  if (!good) return -lastHitter          // 打出界了，判给对面
  return side === lastHitter ? -lastHitter : lastHitter
}
