// 挥拍动作：每种球路一条独立路径，由若干个关键帧组成。
// 位置是"相机坐标系"下的（x 右、y 上、z 前），旋转是手臂支架的欧拉角。
// 全是数据加插值，所以能在本机测——顺便能量化"挥动幅度"到底变大没有。

const P = function (x, y, z) { return [x, y, z] }
const R = function (x, y, z) { return [x, y, z] }

// 蓄力时的姿势：贴近图二的构图——手在画面中下偏右（59%, 90%），
// 拍杆朝右上方约 55°，拍头落在画面右上（76%, 34%）。
// 这组数是解出来的，不是试出来的：给定"手的位置 + 拍杆方向"反推手臂欧拉角，
// 再在绕拍杆自转的所有解里挑最接近上一版数值的一个，过渡时不会绕远路。
// 校验脚本见 tools/pose-solve.js。
export const READY_POSE = { p: P(0.12, -0.30, -0.50), r: R(1.066, -0.343, -0.902) }

export const SWING_PATHS = {
  // 头顶球：从脑后上方抡到身体前下方，最像杀球/高远
  overhead: {
    label: '头顶挥拍',
    usedBy: ['clear', 'netkill'],
    frames: [
      { p: P(0.52, 0.2, 0.26), r: R(-0.6, 0.4, -1.0) },
      { p: P(0.46, 0.44, -0.02), r: R(-1.1, 0.3, -0.5) },
      { p: P(0.16, 0.16, -0.5), r: R(-0.2, 0.0, 0.6) },
      { p: P(-0.16, -0.24, -0.52), r: R(0.5, -0.2, 1.0) },
      { p: P(-0.28, -0.5, -0.3), r: R(0.9, -0.3, 1.2) }
    ]
  },
  // 平抽：几乎水平地从右扫到左
  drive: {
    label: '平抽',
    usedBy: ['drive', 'cross'],
    frames: [
      { p: P(0.55, -0.08, 0.2), r: R(-0.2, 0.5, -0.7) },
      { p: P(0.5, -0.06, -0.16), r: R(-0.1, 0.2, -0.2) },
      { p: P(0.1, -0.05, -0.5), r: R(0.0, 0.0, 0.1) },
      { p: P(-0.34, -0.06, -0.44), r: R(0.1, -0.2, 0.5) }
    ]
  },
  // 下手挑球：从下往上兜，吊球和挑球都是这个
  underarm: {
    label: '下手挑',
    usedBy: ['drop'],
    frames: [
      { p: P(0.42, -0.62, 0.06), r: R(0.5, 0.3, -0.4) },
      { p: P(0.36, -0.44, -0.3), r: R(0.2, 0.2, -0.1) },
      { p: P(0.2, -0.06, -0.5), r: R(-0.3, 0.0, 0.3) },
      { p: P(0.02, 0.22, -0.4), r: R(-0.7, -0.1, 0.6) }
    ]
  },
  // 反手：从身体左侧横着掏过去
  backhand: {
    label: '反手',
    usedBy: ['backhand'],
    frames: [
      { p: P(-0.42, -0.16, 0.16), r: R(-0.3, -0.5, 0.8) },
      { p: P(-0.5, -0.1, -0.18), r: R(-0.1, -0.2, 0.4) },
      { p: P(-0.16, -0.02, -0.48), r: R(0.0, 0.1, -0.1) },
      { p: P(0.26, 0.06, -0.4), r: R(0.1, 0.3, -0.6) }
    ]
  }
}

export function pathByName(name) {
  return SWING_PATHS[name] || SWING_PATHS.drive
}

function lerp(a, b, t) { return a + (b - a) * t }

// t: 0 → 1，沿路径取一个姿势
export function samplePath(path, t) {
  const f = path.frames
  const n = f.length - 1
  const x = Math.max(0, Math.min(1, t)) * n
  const i = Math.min(n - 1, Math.floor(x))
  const u = x - i
  const a = f[i]
  const b = f[i + 1]
  return {
    p: [lerp(a.p[0], b.p[0], u), lerp(a.p[1], b.p[1], u), lerp(a.p[2], b.p[2], u)],
    r: [lerp(a.r[0], b.r[0], u), lerp(a.r[1], b.r[1], u), lerp(a.r[2], b.r[2], u)]
  }
}

// 球拍顶端沿路径走过的总长度，用来量"挥动幅度"
export function pathTravel(path) {
  const f = path.frames
  let total = 0
  for (let i = 1; i < f.length; i++) {
    const dx = f[i].p[0] - f[i - 1].p[0]
    const dy = f[i].p[1] - f[i - 1].p[1]
    const dz = f[i].p[2] - f[i - 1].p[2]
    total += Math.sqrt(dx * dx + dy * dy + dz * dz)
  }
  return total
}
