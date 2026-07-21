import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

// 临时测试配置：仅作为稳定 dev server 使用，不自动启动 Electron，
// 避免 vite-plugin-electron 在 Electron 退出时连带关闭 vite。
export default defineConfig({
  plugins: [
    react(),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
