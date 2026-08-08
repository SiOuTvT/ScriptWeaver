// 仅渲染端（renderer-only）的 Vite 配置，用于 e2e 冒烟测试。
// 刻意剥离 vite-plugin-electron / renderer，避免主进程崩溃把 dev server 一起带挂，
// 让渲染端可在纯浏览器（Playwright + 系统 Chrome）中独立启动与断言。
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5199,
    strictPort: true,
  },
  build: {
    emptyOutDir: false,
  },
})
