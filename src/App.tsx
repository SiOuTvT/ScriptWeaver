import { useAppStore } from './stores/appStore'

function App() {
  const { count, increment, decrement } = useAppStore()

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="flex flex-col items-center gap-6 rounded-2xl bg-gray-900 p-10 shadow-2xl ring-1 ring-gray-800 animate-fade-in">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          ScriptWeaver
        </h1>
        <p className="text-sm text-gray-400">
          Electron + React + TypeScript + Zustand + Tailwind
        </p>

        <div className="flex items-center gap-4">
          <button
            onClick={decrement}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800 text-lg text-gray-300 transition-colors hover:bg-gray-700 active:scale-95"
          >
            −
          </button>
          <span className="min-w-[3rem] text-center text-2xl font-mono tabular-nums text-brand-400">
            {count}
          </span>
          <button
            onClick={increment}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800 text-lg text-gray-300 transition-colors hover:bg-gray-700 active:scale-95"
          >
            +
          </button>
        </div>

        <span className="text-xs text-gray-600">
          Zustand 状态管理验证通过
        </span>
      </div>
    </div>
  )
}

export default App
