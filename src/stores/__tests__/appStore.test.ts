import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '@/stores/appStore'
import type { LineDelta, AssetItem, CharacterConfig } from '@/core/types'

describe('appStore - Undo/Redo', () => {
  beforeEach(() => {
    // Reset store to a known state
    const store = useAppStore.getState()
    store.newProject()
  })

  function addTestLine(): void {
    useAppStore.getState().insertDeltaAt(0)
  }

  it('should push history on updateDeltaAt', () => {
    addTestLine()
    addTestLine()

    const store = useAppStore.getState()
    const beforeLength = store.draftDeltas.length

    store.updateDeltaAt(0, (prev) => ({ ...prev, dialogue: 'hello' }))

    const after = useAppStore.getState()
    expect(after._history.length).toBeGreaterThan(0)
    expect(after.draftDeltas[0].dialogue).toBe('hello')
  })

  it('should undo back to previous state', () => {
    addTestLine()
    useAppStore.getState().updateDeltaAt(0, (prev) => ({ ...prev, dialogue: 'before undo' }))
    useAppStore.getState().updateDeltaAt(0, (prev) => ({ ...prev, dialogue: 'after change' }))

    const store = useAppStore.getState()
    expect(store.draftDeltas[0].dialogue).toBe('after change')

    store.undo()

    const afterUndo = useAppStore.getState()
    expect(afterUndo.draftDeltas[0].dialogue).toBe('before undo')
  })

  it('should redo after undo', () => {
    addTestLine()
    useAppStore.getState().updateDeltaAt(0, (prev) => ({ ...prev, dialogue: 'first' }))
    useAppStore.getState().updateDeltaAt(0, (prev) => ({ ...prev, dialogue: 'second' }))

    const store = useAppStore.getState()
    store.undo()
    expect(useAppStore.getState().draftDeltas[0].dialogue).toBe('first')

    store.redo()
    expect(useAppStore.getState().draftDeltas[0].dialogue).toBe('second')
  })

  it('should clear future on new mutation after undo', () => {
    addTestLine()
    useAppStore.getState().updateDeltaAt(0, (prev) => ({ ...prev, dialogue: 'v1' }))
    useAppStore.getState().updateDeltaAt(0, (prev) => ({ ...prev, dialogue: 'v2' }))

    useAppStore.getState().undo() // back to v1
    expect(useAppStore.getState().canRedo()).toBe(true)

    // New mutation clears future
    useAppStore.getState().updateDeltaAt(0, (prev) => ({ ...prev, dialogue: 'v3' }))
    expect(useAppStore.getState().canRedo()).toBe(false)
    expect(useAppStore.getState().draftDeltas[0].dialogue).toBe('v3')
  })

  it('should track assets changes', () => {
    const asset: AssetItem = {
      id: 'test_asset', type: 'background', name: 'Test', fileName: 'test.png',
      relativePath: '', importedAt: new Date().toISOString(),
    }
    useAppStore.getState().addAsset(asset)

    expect(useAppStore.getState().assets.length).toBe(1)

    useAppStore.getState().undo()
    expect(useAppStore.getState().assets.length).toBe(0)
  })

  it('should track character changes', () => {
    const char: Omit<CharacterConfig, 'createdAt' | 'updatedAt'> = {
      charId: 'test_char', displayName: 'Test', expressions: [],
    }
    useAppStore.getState().addCharacter(char)

    expect(useAppStore.getState().characterConfigs.length).toBe(1)

    useAppStore.getState().undo()
    expect(useAppStore.getState().characterConfigs.length).toBe(0)
  })

  it('canUndo returns false with empty history', () => {
    useAppStore.getState().newProject()
    expect(useAppStore.getState().canUndo()).toBe(false)
  })
})

describe('appStore - LineDelta CRUD', () => {
  beforeEach(() => {
    useAppStore.getState().newProject()
  })

  it('insertDeltaAt adds a line', () => {
    useAppStore.getState().insertDeltaAt(0)
    expect(useAppStore.getState().draftDeltas.length).toBe(1)
  })

  it('updateDeltaAt modifies a line', () => {
    useAppStore.getState().insertDeltaAt(0)
    useAppStore.getState().updateDeltaAt(0, (prev) => ({
      ...prev, speaker: 'Alice', dialogue: 'Hello!',
    }))
    const d = useAppStore.getState().draftDeltas[0]
    expect(d.speaker).toBe('Alice')
    expect(d.dialogue).toBe('Hello!')
  })

  it('batchUpdateDeltas updates multiple lines', () => {
    useAppStore.getState().insertDeltaAt(0)
    useAppStore.getState().insertDeltaAt(1)
    useAppStore.getState().batchUpdateDeltas([
      { index: 0, updater: (p) => ({ ...p, dialogue: 'A' }) },
      { index: 1, updater: (p) => ({ ...p, dialogue: 'B' }) },
    ])
    expect(useAppStore.getState().draftDeltas[0].dialogue).toBe('A')
    expect(useAppStore.getState().draftDeltas[1].dialogue).toBe('B')
  })
})
