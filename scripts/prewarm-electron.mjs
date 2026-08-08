#!/usr/bin/env node
/**
 * ScriptWeaver 构建缓存预热脚本
 * ------------------------------------------------------------------
 * 将约 111MB 的 Electron 运行时二进制下载到项目级固化缓存目录
 * （与 electron-builder.yml 中的 electronDownload.cache 保持一致），
 * 使得后续 `npm run build:win` 等打包命令直接复用，无需在打包时
 * 卡在网络下载。幂等：已缓存则秒过。
 *
 * 可选加速：调用前设置 ELECTRON_MIRROR 环境变量（国内用户常用镜像），
 *           @electron/get 会自动读取，无需修改本脚本。
 *   例（PowerShell）： $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
 *
 * 注意：缓存目录 .build-cache/ 已被 .gitignore 忽略，不进版本库。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = path.join(root, '.build-cache', 'electron')

fs.mkdirSync(cacheDir, { recursive: true })
process.env.ELECTRON_CACHE = cacheDir

const installJs = path.join(root, 'node_modules', 'electron', 'install.js')
if (!fs.existsSync(installJs)) {
  console.error('[prewarm] 未找到 node_modules/electron/install.js，请先执行 npm install')
  process.exit(1)
}

console.log('[prewarm] 预热 Electron 运行时 → ' + cacheDir)
console.log('[prewarm] 提示：如需加速可先设置 ELECTRON_MIRROR 镜像环境变量')
try {
  execFileSync(process.execPath, [installJs], {
    stdio: 'inherit',
    env: process.env,
  })
} catch (err) {
  console.error('[prewarm] 预热失败：', err instanceof Error ? err.message : String(err))
  process.exit(1)
}
console.log('[prewarm] 完成 ✅ 后续 build:win 将直接复用该缓存')
