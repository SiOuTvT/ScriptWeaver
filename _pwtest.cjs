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

    // 注入一个 blobUrl sprite 素材（模拟 OS 拖入 AssetManager 未落盘的情况）
    const blobSrc = await page.evaluate(async () => {
      const store = await import('/src/stores/appStore.ts')
      const canvas = document.createElement('canvas')
      canvas.width = 220; canvas.height = 320
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#3366cc'; ctx.fillRect(0, 0, 220, 320)
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'))
      const url = URL.createObjectURL(blob)
      store.useAppStore.getState().addAsset({
        id: 'test_blob_sprite', type: 'sprite', name: 'blobtest', fileName: 'b.png',
        relativePath: '', blobUrl: url, importedAt: new Date().toISOString(),
      })
      return url
    })
    console.log('BLOB_SRC:', blobSrc.slice(0, 30))
    await page.waitForTimeout(500)

    // 新建场景并真实拖入（setDragCache + drop）
    await page.evaluate(() => { const b = document.querySelector('[title="在当前场景之后添加新场景"]'); if (b) b.click() })
    await page.waitForTimeout(300)
    const res = await page.evaluate(async () => {
      const { setDragCache } = await import('/src/utils/assetHelpers.ts')
      const stage = document.querySelector('div.bg-canvas.shadow-2xl')
      if (!stage) return { ok: false }
      setDragCache({ type: 'sprite', assetId: 'test_blob_sprite', label: 'blobtest', name: 'blobtest' })
      const r = stage.getBoundingClientRect()
      const dt = new DataTransfer()
      const mk = (t, x, y) => new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y })
      stage.dispatchEvent(mk('dragover', r.left + r.width / 2, r.top + r.height * 0.6))
      stage.dispatchEvent(mk('drop', r.left + r.width / 2, r.top + r.height * 0.6))
      return { ok: true }
    })
    await page.waitForTimeout(900)
    const check = await page.evaluate((expectedSrc) => {
      const stage = document.querySelector('div.bg-canvas.shadow-2xl')
      if (!stage) return { found: false }
      const imgs = Array.from(stage.querySelectorAll('img'))
      const m = imgs.find((im) => im.src === expectedSrc)
      return { found: !!m, nat: m ? m.naturalWidth + 'x' + m.naturalHeight : null }
    }, blobSrc)
    console.log('BLOB_DROP_RESULT:', JSON.stringify({ dropOk: res.ok, found: check.found, nat: check.nat }))
    console.log('BLOB_SUMMARY:', JSON.stringify({ dropOk: res.ok, found: check.found, nat: check.nat }))
    await browser.close()
    cleanup()
    process.exit(0)
  } catch (e) {
    console.error('ERR', e)
    cleanup()
    process.exit(1)
  }
})
