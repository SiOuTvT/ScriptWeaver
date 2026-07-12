import { Component, type ReactNode } from 'react'
import AppLayout from './components/layout/AppLayout'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('=== App Error Boundary ===')
    console.error(error)
    console.error(info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-200 p-8">
          <div className="max-w-lg">
            <h1 className="text-lg font-bold text-red-400 mb-3">App Error</h1>
            <pre className="text-xs text-gray-400 whitespace-pre-wrap break-all bg-gray-900 p-4 rounded-lg border border-gray-800 mb-3">
              {this.state.error.message}
            </pre>
            <pre className="text-[10px] text-gray-600 whitespace-pre-wrap bg-gray-900/50 p-3 rounded">
              {this.state.error.stack?.slice(0, 500)}
            </pre>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  return (
    <ErrorBoundary>
      <AppLayout />
    </ErrorBoundary>
  )
}

export default App
