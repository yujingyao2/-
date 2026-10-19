// Three.js 直接放在项目里（js/vendor/three.module.js）。
// 之前是从 CDN 依次试，断网或缓存失效时整个游戏会卡在“正在准备球场”；
// 这个游戏只要求本机运行，所以不再依赖网络。

import * as mod from './vendor/three.module.js'

export default mod
