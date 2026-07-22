export default function About() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center select-none">
      <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg">
        <span className="text-white text-2xl font-semibold">S</span>
      </div>
      <h2 className="text-base font-semibold text-fg-default mb-1">ScriptWeaver</h2>
      <p className="text-sm text-fg-muted mb-4">视觉小说引擎 一站式创作工具</p>
      <div className="text-xs text-fg-subtle space-y-1">
        <p>版本 0.7.0</p>
        <p>基于 Electron + React + Vite</p>
        <p>Ren'Py 兼容导出</p>
      </div>
      <div className="mt-6 text-xs text-fg-faint">
        <p>Made with care for visual novel creators</p>
      </div>
    </div>
  )
}
