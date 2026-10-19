// 羽毛球的飞行。纯计算，本机可测。
//
// 羽毛球跟其它球类最大的不同是阻力极大：出手 300 公里/小时，
// 飞几米就掉到几十公里/小时。所以这里必须用平方阻力，不能用线性阻尼，
// 否则球会像子弹一样飞出去，完全不是羽毛球。

import { SHUTTLE } from './config.js'

export function terminalSpeed() {
  return Math.sqrt(SHUTTLE.gravity / SHUTTLE.dragK)
}

export function createShuttle(x, y, z) {
  return { x: x, y: y, z: z, vx: 0, vy: 0, vz: 0, active: false, spin: 0 }
}

export function speedOf(s) {
  return Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz)
}

/**
 * 推进一小步。dt 建议不超过 1/240，太大积分会发散。
 * 平方阻力：a = -k * |v| * v
 */
export function step(s, dt) {
  // 时间尺度：放慢只改速度感，不改轨迹形状，落点还是同一个
  const h = dt * SHUTTLE.timeScale
  const v = speedOf(s)
  const k = SHUTTLE.dragK
  const ax = -k * v * s.vx
  const ay = -SHUTTLE.gravity - k * v * s.vy
  const az = -k * v * s.vz

  s.vx += ax * h
  s.vy += ay * h
  s.vz += az * h
  s.x += s.vx * h
  s.y += s.vy * h
  s.z += s.vz * h
  s.spin += v * h * 6
  return s
}

/**
 * 从起点按给定的速度打出去，一路推进到落地（y 回到 0）。
 * 用来预测落点：对手 AI 和"这一拍会落在哪"的预判都靠它。
 * 返回 { x, z, time, path }
 */
export function predict(s, maxSeconds) {
  const limit = maxSeconds || 6
  const dt = 1 / 240
  const probe = { x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, spin: 0 }
  let t = 0
  while (t < limit) {
    step(probe, dt)
    t += dt
    if (probe.y <= 0.02 && probe.vy < 0) break
  }
  // 故意不返回整条轨迹：调用方只要落点，而每帧生成几百个轨迹点
  // 会把垃圾回收压垮，画面就是一顿一顿的。
  return { x: probe.x, z: probe.z, time: t }
}

// 把速度按"水平朝向 + 仰角"拼出来，挥拍和发球都用这个
export function velocityFrom(dirX, dirZ, pitchDeg, speed) {
  const pitch = (pitchDeg * Math.PI) / 180
  const horiz = Math.cos(pitch) * speed
  const vert = Math.sin(pitch) * speed
  const len = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1
  return {
    vx: (dirX / len) * horiz,
    vy: vert,
    vz: (dirZ / len) * horiz
  }
}
