import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// 本地打包字体（离线可用、符合 CSP）：拉丁 Noto Sans + 中文 Noto Sans SC（同族，最和谐中性、无海报味）+ 等宽 JetBrains Mono
import '@fontsource/noto-sans/400.css'
import '@fontsource/noto-sans/500.css'
import '@fontsource/noto-sans/600.css'
import '@fontsource/noto-sans/700.css'
import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/500.css'
import '@fontsource/noto-sans-sc/600.css'
import '@fontsource/noto-sans-sc/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import './index.css'
import { applyAccent, DEFAULT_ACCENT } from './utils/themeColor'
import type { ThemeMode } from './utils/themeColor'

// 在 React 渲染前同步写入 CSS 变量，消除「首次使用需要手动保存才能看到主题色」的等待
const savedAccent = (typeof localStorage !== 'undefined' && localStorage.getItem('sw-accent')) || DEFAULT_ACCENT
const savedTheme: ThemeMode =
  (typeof localStorage !== 'undefined' && (localStorage.getItem('sw-theme') as ThemeMode | null)) || 'dark'
applyAccent(savedAccent, savedTheme)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
