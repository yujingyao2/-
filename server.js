// 生产包的本地预览服务，零依赖。
// 正式上线时不需要它：把同目录的静态文件上传到任意 HTTPS 静态托管即可。

const http = require('http')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { exec } = require('child_process')

const ROOT = __dirname
const START_PORT = 8080
const NO_OPEN = process.argv.indexOf('--no-open') >= 0 || process.env.MOTION_NO_OPEN === '1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.ico': 'image/x-icon'
}

function serve(req, res) {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '')
  const file = path.join(ROOT, rel)

  if (!file.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('越界了')
    return
  }

  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('找不到 ' + rel)
      return
    }
    const ext = path.extname(file).toLowerCase()
    const type = MIME[ext] || 'application/octet-stream'
    const isVendor = rel.indexOf('js/vendor/') === 0
    const isAsset = ['.wav', '.mp3', '.ogg', '.m4a', '.png', '.jpg', '.svg', '.ico'].indexOf(ext) >= 0
    const canGzip = /^(text\/|application\/json|image\/svg)/.test(type) &&
      /\bgzip\b/.test(req.headers['accept-encoding'] || '')
    const headers = {
      'Content-Type': type,
      'Cache-Control': isVendor ? 'public, max-age=31536000, immutable' :
        (isAsset ? 'public, max-age=86400' : 'no-cache'),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
    if (canGzip) {
      headers['Content-Encoding'] = 'gzip'
      headers['Vary'] = 'Accept-Encoding'
    }
    res.writeHead(200, headers)
    const stream = fs.createReadStream(file)
    if (canGzip) stream.pipe(zlib.createGzip()).pipe(res)
    else stream.pipe(res)
  })
}

function listen(port) {
  const server = http.createServer(serve)
  server.on('error', function (e) {
    if (e.code === 'EADDRINUSE') {
      console.log('端口 ' + port + ' 被占用了，换一个。')
      listen(port + 1)
    } else {
      console.error('启动失败：' + e.message)
      process.exit(1)
    }
  })
  server.listen(port, '127.0.0.1', function () {
    const url = 'http://127.0.0.1:' + port + '/'
    console.log('')
    console.log('  一拍到底 · 生产预览')
    console.log('  地址：' + url)
    console.log('  这个窗口别关，关了服务就停了。想停按 Ctrl+C。')
    console.log('')
    if (!NO_OPEN) exec('start "" "' + url + '"')
  })
}

listen(START_PORT)
