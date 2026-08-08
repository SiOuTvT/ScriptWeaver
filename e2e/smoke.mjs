// 渲染端 e2e 冒烟测试（Playwright + 系统 Chrome 无头）。
// 目标：在纯浏览器环境启动渲染端，断言 (1) 应用挂载成功 (2) 无未捕获异常
// (3) 核心 UI（导航/按钮）渲染出来。用于守护「主进程崩 / 渲染端挂载失败」类回归。
//
// 用法：node e2e/smoke.mjs   （会自起渲染端 dev server，无需 Electron GUI）
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 5199
const BASE = `http://127.0.0.1:${PORT}/`
// 系统 Chrome 可执行文件路径（本环境已验证可用）；可用 CHROME_PATH 覆盖。
const CHROME_PATH =
  process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

function waitForServer(timeoutMs = 60000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(BASE)
        if (res.ok) return resolve()
      } catch {
        /* not up yet */
      }
      if (Date.now() - start > timeoutMs) return reject(new Error('vite dev server 启动超时'))
      setTimeout(tick, 500)
    }
    tick()
  })
}

let vite = null
let browser = null

try {
  // 1) 启动仅渲染端的 Vite dev server
  vite = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--config', 'vite.config.e2e.mjs'],
    { cwd: process.cwd(), stdio: 'ignore' },
  )
  await waitForServer()
  console.log(`[smoke] vite ready @ ${BASE}`)

  // 2) 用系统 Chrome 无头启动
  browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const page = await browser.newPage()

  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  // 3) 加载并断言挂载
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForFunction(
    () => {
      const r = document.getElementById('root')
      return r && r.childElementCount > 0
    },
    { timeout: 30000 },
  )
  // 等待核心 UI（至少一个按钮/导航）出现
  await page.waitForSelector('button, nav, [role="navigation"]', { timeout: 15000 })

  const bodyLen = (await page.evaluate(() => document.body.innerText)).trim().length
  const hasNav = (await page.locator('nav, [role="navigation"]').count()) > 0

  console.log(`[smoke] 渲染端已挂载；body 文本长度=${bodyLen}，导航元素=${hasNav ? '存在' : '缺失'}`)
  if (consoleErrors.length) {
    console.log(`[smoke] 控制台错误(${consoleErrors.length})：`)
    consoleErrors.slice(0, 10).forEach((e) => console.log('   - ' + e))
  }

  // 4) 判定
  const ok =
    pageErrors.length === 0 &&
    bodyLen > 20 &&
    hasNav
  if (!ok) {
    console.error('[smoke] ❌ 失败：', {
      pageErrors,
      bodyLen,
      hasNav,
    })
    process.exitCode = 1
  } else {
    console.log('[smoke] ✅ 通过：渲染端挂载正常、无未捕获异常、核心 UI 存在')
  }
} catch (err) {
  console.error('[smoke] ❌ 异常：', err)
  process.exitCode = 1
} finally {
  if (browser) await browser.close().catch(() => {})
  if (vite) vite.kill('SIGTERM')
}
