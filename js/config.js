// 所有尺寸和手感参数集中在这里。
// 球场尺寸用的是国际比赛标准，不是估计值。

// 球场放大倍数。1.0 是国际比赛标准尺寸，这里是放大过的。
// 注意：放大之后就不是标准场地了，球路速度要跟着重新标定
// （见 tools/badminton-tune.js），不然所有球都会落在中场。
const SCALE = 1.25

export const COURT = {
  scale: SCALE,
  halfWidthSingles: 2.59 * SCALE,   // 单打边线半宽（标准 5.18 / 2）
  halfWidthDoubles: 3.05 * SCALE,   // 双打边线半宽（标准 6.10 / 2）
  halfLength: 6.70 * SCALE,         // 从网到端线（标准 6.70，全场 13.40）
  netHeightPost: 1.55,      // 网柱处网高
  netHeightCenter: 1.524,   // 网中央网高
  shortService: 1.98 * SCALE,       // 前发球线（标准离网 1.98）
  doublesLongService: 5.94 * SCALE, // 双打后发球线
  lineWidth: 0.04,
  hallWidth: 22,
  hallLength: 32,
  hallHeight: 10
}

// 真实羽毛球：质量约 5.19 克，终端速度约 6.7 米/秒。
// 阻力系数 k 定成 0.20，终端速度 = sqrt(g / k) ≈ 7.0，
// 这样球出手后掉速极快，是羽毛球最核心的手感来源。
export const SHUTTLE = {
  gravity: 9.81,
  dragK: 0.20,
  corkRadius: 0.033,
  netDrop: 0,            // 网对球的作用在 rules 里单独判
  // 时间尺度：小于 1 就是放慢。这个是给手感用的——轨迹形状不变，
  // 只是把整个过程拉长，球看着就不会"嗖"一下过去。
  timeScale: 0.72
}

export const PLAYER = {
  eyeHeight: 1.66,
  bodyRadius: 0.34,
  standStill: 0.0,
  walkSpeed: 4.2,
  sprintSpeed: 6.2,
  // 加速度和摩擦决定"按下到动起来"有多快。原来 26/16 的时间常数是 0.16 秒，
  // 手感发飘、像是有延迟；现在调到 84/60，大约 0.05 秒就到位。
  accel: 84,
  friction: 60,
  // 起跳初速。跳跃高度 = v² / (2g) = 6.85² / 36 ≈ 1.30 米，
  // 差不多是这个 1.62 米小人的肩膀高度，跳起来才够得着高球、也才打得成扣杀。
  jumpSpeed: 6.85,
  gravity: 18,
  crouchEye: 0.62,          // 蹲下时眼高按这个比例算
  crouchSpeed: 0.5,         // 蹲下时移动速度按这个比例算
  // 击球判定范围：身前一个长方体（宽 × 高 × 进深）。
  // 高度不是人身高（1.62），而是"举起球拍能够到的高度"≈ 2.2 米——
  // 否则头顶球（门槛 2.0 米）站着一个都够不着，高远球和扑网等于废掉。
  // 它跟着脚走，所以跳起来整块升高；蹲下只是人变矮，范围不变。
  hitBox: { width: 0.8, height: 2.2, near: 0.12, far: 1.05 },
  swingWindup: 0.05,       // 出手前摇（秒）。越短越跟手
  swingActive: 0.11,       // 能碰到球的窗口
  swingRecover: 0.2,
  powerMin: 0.42,
  powerMax: 1.0,
  powerFullMs: 420,        // 长按多久到满力（越小蓄力越快）
  serveAimAssist: 0.55     // 发球时方向自动往斜对角发球区修正的比例
}

// 对手难度。低难度不是"故意送分"，而是反应慢、跑得慢、看落点会偏；
// 高难度预判快、覆盖范围大，但仍有很小的判断失误，不是无敌。
// smashSpeed 是 AI 的扣杀出手速度，高手比玩家满力扣杀（42）还快一点。
export const AI_LEVELS = {
  low: {
    key: 'low',
    label: '轻松',
    hint: '反应慢、不会扣杀；面对扣杀容易来不及',
    walkSpeed: 3.8,
    reaction: 0.42,
    smashReact: 0.42,      // 面对快球额外愣一下（秒）
    reach: 0.56,
    reachBonus: 0.14,
    trackError: 0.75,      // 预判落点的偏差（米）
    whiffSlow: 0.03,       // 慢球也可能漏
    whiffFast: 0.18,       // 快球漏的概率
    aimError: 0.38,
    outChance: 0.055,
    netChance: 0.045,
    smashChance: 0,        // 最低难度不扣杀
    liftChance: 0.48,
    smashSpeed: 40,
    swingCooldown: 0.6
  },
  normal: {
    key: 'normal',
    label: '普通',
    hint: '会跑位，偶尔判断失误',
    walkSpeed: 4.6,
    reaction: 0.24,
    smashReact: 0.18,
    reach: 0.64,
    reachBonus: 0.20,
    trackError: 0.38,
    whiffSlow: 0.015,
    whiffFast: 0.07,
    aimError: 0.22,
    outChance: 0.03,
    netChance: 0.025,
    smashChance: 0.26,
    liftChance: 0.40,
    smashSpeed: 43,
    swingCooldown: 0.45
  },
  high: {
    key: 'high',
    label: '高手',
    hint: '预判快，会扣杀和挑球',
    walkSpeed: 5.4,
    reaction: 0.08,
    smashReact: 0.04,
    reach: 0.72,
    reachBonus: 0.30,
    trackError: 0.08,
    whiffSlow: 0.002,
    whiffFast: 0.005,
    aimError: 0.10,
    outChance: 0.012,
    netChance: 0.008,
    smashChance: 0.42,
    liftChance: 0.34,
    smashSpeed: 46,
    swingCooldown: 0.35
  }
}

export const MATCH = {
  target: 11,              // 先到 11 分
  winBy: 2,
  cap: 15
}

// 握拍方式：按 Q 切换。它决定接下来这一拍是正手还是反手。
export const GRIPS = [
  { key: 'forehand', label: '正手', hint: '球高打高远或扑网，球低挑起来' },
  { key: 'backhand', label: '反手', hint: '被动球、球在身体另一侧时用' }
]

// 打什么球 = 握拍方式 + 击球点高度（再加一个网前判定的特例）。
// 这比"按键组合"更接近真实羽毛球：你站在哪、球在多高，就决定了你打出什么。
// 速度是照 tools/badminton-tune.js 的落点表标的，球场放大后重新扫过。
export const SHOT_TABLE = [
  { key: 'fh_clear', label: '正手高远球', grip: 'forehand', when: 'high', speed: 40.0, pitchDeg: 42, path: 'overhead' },
  { key: 'fh_net',   label: '扑网',       grip: 'forehand', when: 'nethigh', speed: 26.0, pitchDeg: -6, path: 'overhead' },
  { key: 'fh_smash', label: '正手扣杀',   grip: 'forehand', when: 'jump', speed: 42.0, pitchDeg: 0, path: 'overhead' },
  { key: 'fh_drive', label: '正手平抽',   grip: 'forehand', when: 'mid', speed: 26.0, pitchDeg: 12, path: 'drive' },
  { key: 'fh_lift',  label: '正手挑球',   grip: 'forehand', when: 'low', speed: 34.0, pitchDeg: 40, path: 'underarm' },
  { key: 'bh_clear', label: '反手高远',   grip: 'backhand', when: 'high', speed: 32.0, pitchDeg: 40, path: 'backhand' },
  { key: 'bh_smash', label: '反手扣杀',   grip: 'backhand', when: 'jump', speed: 34.0, pitchDeg: 2, path: 'backhand' },
  { key: 'bh_drive', label: '反手平抽',   grip: 'backhand', when: 'mid', speed: 24.0, pitchDeg: 12, path: 'backhand' },
  { key: 'bh_lift',  label: '反手挑球',   grip: 'backhand', when: 'low', speed: 26.0, pitchDeg: 38, path: 'underarm' }
]

// 击球点高度的三条线：高于 high 算头顶球，低于 low 算下手球
export const CONTACT = {
  high: 2.0,
  low: 1.25,
  netRange: 1.9   // 站位比这个更靠网，且击球点高，就算扑网
}

// 鼠标灵敏度：菜单里能拖，游戏里也能用 [ 和 ] 调，存在浏览器本地
export const SENS = {
  min: 0.3,
  max: 2.5,
  step: 0.1,
  def: 1.0,
  storeKey: 'badminton.sens'
}

// 人物骨架的高度表（米）。character.js 直接按这张表搭模型，
// 测试会据此验算"脚底是不是正好在地面"和头身比。
// 之前那版腿短了一截，整个小人悬空 14 厘米，就是没有这张表约束。
export const SKELETON = {
  hip: 0.86,        // 髋关节离地高度
  hipDrop: 0.02,    // 腿关节相对髋部再下沉一点
  thigh: 0.40,      // 髋关节 → 膝关节
  shin: 0.405,      // 膝关节 → 脚心
  footHeight: 0.07, // 脚掌厚度
  knee: 0.44,
  shoulder: 1.30,
  neck: 1.365,
  head: 1.50,       // 头心高度
  headR: 0.105,
  headScaleY: 1.06,
  height: 1.62
}

/**
 * 教学关卡：一关一件事，球由"教练"喂到指定高度，跟着你走。
 * 每一关都写清了球在多高、该用哪种握拍、最后要打出哪种球。
 * 关卡数据的自洽性有测试盯着（tools/badminton-test.js 最后一段）：
 * 每关的高度配合该关要求的握拍，必须正好打出那一关要的球。
 */
export const TUTORIAL = [
  {
    id: 'move',
    title: '先学会走路',
    body: '羽毛球是靠脚步找到击球点的。先用 WASD 走一圈，再按空格跳一下。',
    keys: 'W A S D 移动　Shift 加速　空格 起跳',
    goal: 'move',
    needWalk: 6,
    needJump: 1
  },
  {
    id: 'serve',
    title: '发球',
    body: '发球是唯一由你开始的一拍。按 E 把球抛起来，等它落到拍面附近时松开鼠标左键挥出去。抛空了不要紧，会自动重抛。',
    keys: 'E 抛球　按住左键蓄力　松开挥拍',
    goal: 'serve'
  },
  {
    id: 'fh_clear',
    title: '球在头顶 → 正手高远球',
    body: '球高于 2 米就是头顶球。这一关球就挂在你头顶高度，握正手挥出去，它会飞到底线附近。',
    keys: 'Q 保持正手　按住左键蓄力　松开挥拍',
    goal: 'shot:fh_clear',
    grip: 'forehand',
    feedY: 2.1
  },
  {
    id: 'fh_drive',
    title: '球在腰上 → 正手平抽',
    body: '球在 1.25 到 2 米之间是腰部高度，这时候最适合平着抽过去，球又快又平。',
    keys: 'Q 保持正手　按住左键　松开挥拍',
    goal: 'shot:fh_drive',
    grip: 'forehand',
    feedY: 1.5
  },
  {
    id: 'fh_lift',
    title: '球很低 → 正手挑球',
    body: '球低于 1.25 米，必须从下往上把它挑起来，不然过不了网。注意：球低的时候是打不出高远球的，这是规则不是 bug。',
    keys: 'Q 保持正手　按住左键　松开挥拍',
    goal: 'shot:fh_lift',
    grip: 'forehand',
    feedY: 0.75
  },
  {
    id: 'fh_net',
    title: '站到网前 → 扑网',
    body: '先在网前站住（球会跟着你），球高的时候挥拍就是扑网：又快又平，是得分手段。',
    keys: 'W 走到网前　Q 保持正手　松开左键挥拍',
    goal: 'shot:fh_net',
    grip: 'forehand',
    feedY: 2.1,
    feedZ: 1.3,
    standAt: 1.5
  },
  {
    id: 'bh_clear',
    title: '换反手：球在头顶 → 反手高远',
    body: '按 Q 换成反手。被动的时候来不及转身，就得用反手把球顶到后场。',
    keys: 'Q 换成反手　球高时松开左键挥拍',
    goal: 'shot:bh_clear',
    grip: 'backhand',
    feedY: 2.1
  },
  {
    id: 'bh_drive',
    title: '反手 + 球在腰上 → 反手平抽',
    body: '反手的腰部球，同样平着抽过去。反手平抽比正手慢一些，但不需要转身。',
    keys: 'Q 保持反手　按住左键　松开挥拍',
    goal: 'shot:bh_drive',
    grip: 'backhand',
    feedY: 1.5
  },
  {
    id: 'bh_lift',
    title: '反手 + 球很低 → 反手挑球',
    body: '反手把低球挑到后场——这是被压到底线时最常用的一拍。',
    keys: 'Q 保持反手　按住左键　松开挥拍',
    goal: 'shot:bh_lift',
    grip: 'backhand',
    feedY: 0.75
  },
  {
    id: 'smash',
    title: '跳起来打 → 扣杀',
    body: '球挂得高，站着够不着。按空格跳起来再挥——只要挥拍那一刻人在空中，这一拍就是扣杀，球最快最平。',
    keys: '空格起跳　球到身前时松开左键挥拍',
    goal: 'shot:fh_smash',
    grip: 'forehand',
    feedY: 2.6,
    requireAir: true
  },
  {
    id: 'crouch_lift',
    title: '蹲下来打 → 挑飞',
    body: '球在腰上高度，站着挥是平抽。按住 Ctrl 蹲下来挥，同一颗球就变成挑飞，高高挑到后场。',
    keys: '按住 Ctrl 蹲下　松开左键挥拍',
    goal: 'shot:fh_lift',
    grip: 'forehand',
    feedY: 1.5,
    requireCrouch: true
  }
]
