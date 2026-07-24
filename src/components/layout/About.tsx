import { useState, useEffect } from 'react'
import {
  Atom, Cpu, Bug, Heart, ExternalLink,
  RefreshCw, CheckCircle2, AlertTriangle
} from 'lucide-react'

const GithubIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
)

const TECH_STACK = [
  { icon: Cpu, label: 'Electron',     color: '#9FEAF9' },
  { icon: Atom, label: 'React 18',    color: '#61DAFB' },
  { label: 'TypeScript',  color: '#3178C6' },
  { label: 'Vite',        color: '#BD34FE' },
  { label: 'Tailwind',    color: '#38BDF8' },
  { label: 'Zustand',     color: '#F5A623' },
  { label: 'Ren\'Py 7.x', color: '#E95678' },
]

export default function About() {
  const [version, setVersion] = useState('0.9.0')
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'available'>('idle')

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    ;(async () => {
      try {
        const v = await api.getVersion?.()
        if (v) setVersion(v)
      } catch { /* ignore */ }
    })()
    ;(async () => {
      try {
        const v = await api.getAppVersion?.()
        if (v) setVersion(v)
      } catch { /* ignore */ }
    })()
  }, [])

  const handleCheckUpdate = async () => {
    setUpdateStatus('checking')
    try {
      const api = window.electronAPI
      const result = await api?.checkForUpdates?.()
      if (result?.updateAvailable) {
        setUpdateStatus('available')
      } else {
        setUpdateStatus('up-to-date')
      }
    } catch {
      setUpdateStatus('up-to-date')
    } finally {
      setTimeout(() => setUpdateStatus('idle'), 5000)
    }
  }

  return (
    <div className="flex flex-col items-center h-full overflow-y-auto px-8 py-10 select-none">
      {/* Logo & Brand */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-600 to-rose-500 flex items-center justify-center shadow-lg mb-5 ring-1 ring-white/10">
          <span className="text-white text-3xl font-semibold tracking-tight">SW</span>
        </div>
        <h1 className="text-lg font-semibold text-fg-default mb-1">ScriptWeaver</h1>
        <p className="text-sm text-fg-subtle mb-3">视觉小说引擎 · 一站式创作工具</p>

        {/* Version & Update */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-surface-3/60 text-fg-muted">
            v{version}
          </span>
          <button
            onClick={handleCheckUpdate}
            disabled={updateStatus === 'checking'}
            className="inline-flex items-center gap-1.5 text-xs text-fg-subtle hover:text-primary
              transition-colors px-2.5 py-1 rounded-md hover:bg-surface-hover/60
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateStatus === 'checking' ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : updateStatus === 'up-to-date' ? (
              <CheckCircle2 size={13} className="text-success" />
            ) : updateStatus === 'available' ? (
              <AlertTriangle size={13} className="text-signal" />
            ) : null}
            <span>
              {updateStatus === 'checking' ? '检查中...'
               : updateStatus === 'up-to-date' ? '已是最新'
               : updateStatus === 'available' ? '发现新版本'
               : '检查更新'}
            </span>
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="w-full max-w-[420px] border-t border-edge/8 mb-8" />

      {/* Tech Stack */}
      <div className="w-full max-w-[420px] mb-8">
        <h2 className="text-xs font-medium text-fg-faint uppercase tracking-[0.12em] mb-4 text-center">
          技术栈
        </h2>
        <div className="flex flex-wrap justify-center gap-2">
          {TECH_STACK.map((tech) => {
            const Icon = tech.icon
            return (
              <span
                key={tech.label}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                  text-xs font-medium border border-edge/8
                  bg-surface/60 text-fg-muted
                  transition-colors hover:bg-surface-hover/60"
              >
                {Icon && <Icon size={13} style={{ color: tech.color }} />}
                <span style={{ color: tech.color }}>{tech.label}</span>
              </span>
            )
          })}
        </div>
      </div>

      {/* License */}
      <div className="w-full max-w-[420px] mb-8 text-center">
        <h2 className="text-xs font-medium text-fg-faint uppercase tracking-[0.12em] mb-3">
          开源协议
        </h2>
        <p className="text-sm text-fg-subtle leading-relaxed">
          基于 <span className="text-fg-muted font-medium">MIT License</span> 开源
          · Copyright &copy; 2026 ScriptWeaver Team
          <br />
          自由使用、修改与分发，保留版权声明即可
        </p>
      </div>

      {/* Community */}
      <div className="w-full max-w-[420px] mb-10">
        <h2 className="text-xs font-medium text-fg-faint uppercase tracking-[0.12em] mb-3 text-center">
          社区与反馈
        </h2>
        <div className="flex items-center justify-center gap-1">
          {[
            { icon: GithubIcon, label: 'GitHub', href: 'https://github.com' },
            { icon: Bug, label: '报告 Bug', href: 'https://github.com' },
            { icon: Heart, label: '功能建议', href: 'https://github.com' },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md
                text-xs text-fg-subtle hover:text-fg-muted
                hover:bg-surface-hover/60 transition-colors"
            >
              <link.icon size={13} />
              <span>{link.label}</span>
              <ExternalLink size={10} className="text-fg-faint" />
            </a>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-6 text-center">
        <p className="text-xs text-fg-faint">
          Made with care for visual novel creators
        </p>
      </div>
    </div>
  )
}
