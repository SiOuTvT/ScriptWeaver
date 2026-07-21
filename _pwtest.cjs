const { chromium } = require('playwright')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const electronPath = require('electron')
const mainPath = path.resolve('d:/ScriptWeaver/dist-electron/main.js')

function waitCDP(port, cb) {
  const tryOnce = () => {
    http.get({ host: '127.0.0.1', port, path: '/json/version' }, (res) => {
      let d = ''
      res.on('data', (c) => (d += c))
      res.on('end', () => { if (d) cb(null); else setTimeout(tryOnce, 300) })
    }).on('error', () => setTimeout(tryOnce, 300))
  }
  tryOnce()
}

const child = spawn(electronPath, ['--remote-debugging-port=9222', '--user-data-dir=C:\\Users\\Dell\\AppData\\Roaming\\scriptweaver', mainPath], {
  env: { ...process.env, VITE_DEV_SERVER_URL: 'http://localhost:5173/' },
  stdio: 'ignore',
})
const cleanup = () => { try { child.kill('SIGKILL') } catch {} }
process.on('exit', cleanup)

waitCDP(9222, async () => {
  let browser
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
    const pages = []
    for (const ctx of browser.contexts()) for (const p of ctx.pages()) pages.push(p)
    let page = pages.find((p) => (p.url() || '').includes('localhost:5173')) || pages[0]
    await page.waitForTimeout(5000)

    const cardCount = await page.evaluate(() => document.querySelectorAll('[title="拖拽到舞台或时间轴使用"]').length)
    console.log('SPRITE_CARD_COUNT:', cardCount)

    const results = []
    for (let i = 0; i < cardCount; i++) {
      // 新建空场景以隔离
      const added = await page.evaluate(() => {
        const btn = document.querySelector('[title="在当前场景之后添加新场景"]')
        if (btn) { btn.click(); return true }
        return false
      })
      await page.waitForTimeout(400)
      const dragRes = await page.evaluate((idx) => {
        const cards = document.querySelectorAll('[title="拖拽到舞台或时间轴使用"]')
        const card = cards[idx]
        const stage = document.querySelector('div.bg-canvas.shadow-2xl')
        if (!card || !stage) return { ok: false, reason: 'no card/stage' }
        const cardSrc = (card.querySelector('img') || {}).src || ''
        const dt = new DataTransfer()
        const mk = (type, x, y) => new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y })
        card.dispatchEvent(mk('dragstart'))
        const r = stage.getBoundingClientRect()
        const cx = r.left + r.width / 2, cy = r.top + r.height * 0.6
        stage.dispatchEvent(mk('dragover', cx, cy))
        stage.dispatchEvent(mk('drop', cx, cy))
        card.dispatchEvent(mk('dragend'))
        return { ok: true, cardSrc }
      }, i)
      await page.waitForTimeout(900)
      const check = await page.evaluate((src) => {
        const stage = document.querySelector('div.bg-canvas.shadow-2xl')
        if (!stage) return { found: false }
        const imgs = Array.from(stage.querySelectorAll('img'))
        const m = imgs.find((im) => im.src === src)
        return { found: !!m, nat: m ? (m.naturalWidth + 'x' + m.naturalHeight) : null, stageImgCount: imgs.length }
      }, dragRes.cardSrc || '')
      results.push({ idx: i, added, cardSrc: (dragRes.cardSrc || '').slice(40), ok: dragRes.ok, found: check.found, nat: check.nat, stageImgCount: check.stageImgCount })
      console.log('CARD', i, 'added=', added, 'cardSrc=', (dragRes.cardSrc || '').slice(40), 'drop_ok=', dragRes.ok, 'found_in_stage=', check.found, 'nat=', check.nat)
    }
    console.log('SUMMARY:', JSON.stringify(results))
    await browser.close()
    cleanup()
    process.exit(0)
  } catch (e) {
    console.error('ERR', e)
    cleanup()
    process.exit(1)
  }
})
