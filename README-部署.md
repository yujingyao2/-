# 一拍到底 · 部署说明

版本：1.0.0  
构建日期：2026-10-19  
类型：纯静态网页游戏

## 包里有什么

- `index.html` / `style.css`：页面与界面
- `js/`：游戏、AI、物理、皮肤、声音、设置等全部运行代码
- `js/vendor/three.module.js`：本地 Three.js，不依赖 CDN
- `assets/audio/bgm-clear-loop.wav`：本地背景音乐
- `favicon.svg`：站点图标
- `server.js` / `本地预览.bat`：只用于本机预览
- `_headers` / `vercel.json` / `nginx.conf.example`：不同托管平台的缓存与安全头示例
- `CREDITS.md`：第三方资源与授权说明

没有后端、数据库、登录、云同步，也没有外部 CDN 请求。

## 本机预览

1. 安装 Node.js（只需本机预览时用）。
2. 双击 `本地预览.bat`。
3. 浏览器打开 `http://127.0.0.1:8080/`。

不要直接双击 `index.html` 用 `file://` 打开：鼠标锁定和全屏在 `file://` 下会被浏览器限制。如果 `localhost` 打不开，请使用上面的 `127.0.0.1` 地址。

## 正式部署

### 任意静态托管 / Nginx

把整个文件夹上传到静态站点根目录，确保使用 **HTTPS**。Nginx 可以直接参考 `nginx.conf.example`，重点是：

- HTML / 游戏脚本不缓存，更新后用户能拿到新版本；
- `js/vendor/` 长缓存；
- `assets/audio/` 缓存一天；
- 开启 gzip。

### Netlify / Cloudflare Pages

把文件夹拖进部署入口，或用 Git 连接静态目录。`_headers` 会被这类平台读取；HTTPS 默认开启。

### Vercel

把文件夹作为静态项目导入，`vercel.json` 会配置安全头和缓存。HTTPS 默认开启。

### GitHub Pages

把文件提交到仓库并开启 Pages。GitHub Pages 不读取 `_headers`，缓存使用平台默认值；HTTPS 默认开启。

上传静态托管时，`server.js` 和 `本地预览.bat` 可以不上传，它们只是本机预览工具。

## 必须注意

- **必须通过 HTTP(S) 访问**：在线部署请用 HTTPS。`Pointer Lock`、全屏和 `Keyboard Lock` 在非 localhost 的普通 HTTP 下会受限。
- **第一次点击后才会有声音**：浏览器自动播放策略要求用户交互，属正常现象。
- **推荐桌面 Chrome / Edge**：全屏后会尝试用 Keyboard Lock 接管 Ctrl+W 等快捷键；Firefox / Safari 没有该能力时，蹲下请用 **C** 键。
- **数据在玩家自己的浏览器里**：皮肤、音量、难度、灵敏度和教学进度都存在 `localStorage`（`badminton.skins`、`badminton.audio`、`badminton.difficulty`、`badminton.sens`、`badminton.lessons`），不会上传服务器。清除站点数据会重置。
- **旧存档兼容**：旧版单皮肤 `badminton.skin` 会自动迁移成「我的球拍」。

## 操作

| 操作 | 按键 |
|---|---|
| 移动 | W / A / S / D |
| 加速跑 | Shift |
| 跳起 / 空中扣杀 | 空格 |
| 蹲下 / 蹲着挑飞 | C（也支持 Ctrl） |
| 蓄力 / 挥拍 | 按住鼠标左键 / 松开 |
| 换握拍 | Q |
| 发球时抛球 | E |
| 凑近看拍面 | F |
| 全屏开关 | G |
| 暂停 / 退出 | Esc |
| 收起帮助 | H |

## 更新版本

1. 替换 `index.html`、`style.css`、`js/` 下的运行文件。
2. 如果替换了音频，建议换文件名或让 CDN 刷新缓存；音频默认缓存一天。
3. 部署后确认 `index.html` 和游戏脚本仍然返回 `no-cache`。

## 授权

Three.js 使用 MIT 许可证，许可证头保留在 `js/vendor/three.module.js` 中。背景音乐是本项目生成的本地原创循环，没有使用外部商业曲目。详见 `CREDITS.md`。
