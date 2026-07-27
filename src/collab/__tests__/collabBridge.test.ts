import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { CollabEvent } from '@/collab/CollabManager'

// ---- 用可控的假 CollabManager 替换真实网络层 ----
// vi.hoisted 保证在 vi.mock 工厂执行前完成初始化，避免 TDZ 报错。
const { handlers, fire } = vi.hoisted(() => {
  const hs: Array<(e: CollabEvent) => void> = []
  const f = (e: CollabEvent) => hs.forEach((h) => h(e))
  return { handlers: hs, fire: f }
})

vi.mock('@/collab/CollabManager', () => {
  class CollabManager {
    broadcast = vi.fn()
    relayExcept = vi.fn()
    sendFullSyncTo = vi.fn()
    sendTo = vi.fn()
    lockBlock = vi.fn()
    unlockBlock = vi.fn()
    setPermission = vi.fn()
    kickPeer = vi.fn()
    syncAuditLog = vi.fn()
    host = vi.fn(async () => 'host-mock-id')
    join = vi.fn(async () => {})
    destroy = vi.fn(async () => {})
    on(handler: (e: CollabEvent) => void) {
      handlers.push(handler)
      return () => {
        const i = handlers.indexOf(handler)
        if (i >= 0) handlers.splice(i, 1)
      }
    }
  }
  return { CollabManager, __fire: fire }
})

// 直接用 vi.hoisted 中暴露的 fire 派发事件，避免触碰 mock 模块命名空间造成 TDZ
const fireEvent = (e: CollabEvent) => fire(e)

// 通过动态 import 持有被测模块与 store，规避与被试管 collabBridge 之间的模块初始化顺序问题
let bridge: any
let appStore: any
let collabStore: any

// 被测模块的命名导出别名（在 beforeEach 中通过动态 import 注入）
const startHost = (...a: any[]) => bridge.startHost(...a)
const joinSession = (...a: any[]) => bridge.joinSession(...a)
const stopCollab = (...a: any[]) => bridge.stopCollab(...a)
const kickPeer = (...a: any[]) => bridge.kickPeer(...a)
const setPeerPermission = (...a: any[]) => bridge.setPeerPermission(...a)
const getCollabManager = (...a: any[]) => bridge.getCollabManager(...a)

function manager(): any {
  return getCollabManager()
}

function setupBaselineLines(): void {
  const s = appStore.useAppStore.getState()
  s.newProject()
  s.insertDeltaAt(0)
  s.updateDeltaAt(0, (p: any) => ({ ...p, dialogue: 'line-zero', speaker: 'Alice' }))
  s.insertDeltaAt(1)
  s.updateDeltaAt(1, (p: any) => ({ ...p, dialogue: 'line-one', speaker: 'Bob' }))
}

beforeEach(async () => {
  appStore = await import('@/stores/appStore')
  collabStore = await import('@/collab/collabStore')
  bridge = await import('@/collab/collabBridge')
  appStore.useAppStore.getState().newProject()
  collabStore.useCollabStore.getState().reset()
  handlers.length = 0
  vi.clearAllMocks()
})

afterEach(async () => {
  vi.useRealTimers()
  await stopCollab(false).catch(() => {})
  appStore.useAppStore.getState().newProject()
  collabStore.useCollabStore.getState().reset()
  handlers.length = 0
})

describe('collabBridge - 生命周期', () => {
  it('startHost 触发 connected 后进入 host 在线态', async () => {
    await startHost('主机甲')
    fireEvent({ type: 'connected', role: 'host', peerId: 'host-1' })

    const cs = collabStore.useCollabStore.getState()
    expect(cs.status).toBe('connected')
    expect(cs.role).toBe('host')
    expect(cs.peerId).toBe('host-1')
    expect(cs.inviteCode).toBe('host-1')
  })

  it('joinSession 触发 connected 后进入 guest 在线态', async () => {
    await joinSession('invite-code', '协作者乙')
    fireEvent({ type: 'connected', role: 'guest', peerId: 'guest-9' })

    const cs = collabStore.useCollabStore.getState()
    expect(cs.status).toBe('connected')
    expect(cs.role).toBe('guest')
    expect(cs.peerId).toBe('guest-9')
  })
})

describe('collabBridge - 本地编辑广播', () => {
  it('单行改动 → 广播 delta_set 并写入审计日志', async () => {
    setupBaselineLines()
    await startHost('主机甲')
    fireEvent({ type: 'connected', role: 'host', peerId: 'host-1' })

    const before = collabStore.useCollabStore.getState().auditLogs.length

    vi.useFakeTimers()
    appStore.useAppStore.getState().updateDeltaAt(0, (p: any) => ({ ...p, dialogue: 'edited-local' }))
    await vi.advanceTimersByTimeAsync(200)
    vi.useRealTimers()

    const broadcastMock = manager().broadcast
    expect(broadcastMock).toHaveBeenCalled()
    const calls = broadcastMock.mock.calls
    const deltaSet = calls.find((c: any) => c[0]?.type === 'delta_set')
    expect(deltaSet).toBeTruthy()
    expect(deltaSet[0].index).toBe(0)
    expect(deltaSet[0].delta.dialogue).toBe('edited-local')

    expect(collabStore.useCollabStore.getState().auditLogs.length).toBeGreaterThan(before)
  })
})

describe('collabBridge - 权限强制（仅查看）', () => {
  it('guest 仅查看模式下本地编辑被回滚并报错', async () => {
    setupBaselineLines()
    await joinSession('invite-code', '协作者乙')
    fireEvent({ type: 'connected', role: 'guest', peerId: 'guest-9' })
    collabStore.useCollabStore.setState({ myPermission: 'view' })

    vi.useFakeTimers()
    appStore.useAppStore.getState().updateDeltaAt(0, (p: any) => ({ ...p, dialogue: 'should-revert' }))
    await vi.advanceTimersByTimeAsync(200)
    vi.useRealTimers()

    expect(appStore.useAppStore.getState().draftDeltas[0].dialogue).toBe('line-zero')
    expect(collabStore.useCollabStore.getState().error).toMatch(/查看/)
  })
})

describe('collabBridge - 远端消息应用', () => {
  it('收到 delta_set → 应用到本地并记远端审计', async () => {
    setupBaselineLines()
    await startHost('主机甲')
    fireEvent({ type: 'connected', role: 'host', peerId: 'host-1' })

    const d0 = appStore.useAppStore.getState().draftDeltas[0]
    fireEvent({
      type: 'message',
      sourcePeerId: 'peer-x',
      msg: { type: 'delta_set', index: 0, delta: { ...d0, dialogue: 'remote-edit' }, fromPeerId: 'peer-x' },
    })

    expect(appStore.useAppStore.getState().draftDeltas[0].dialogue).toBe('remote-edit')
    expect(collabStore.useCollabStore.getState().auditLogs.some((l: any) => l.action === 'modify_dialogue')).toBe(true)
  })

  it('收到 delta_insert → 插入到指定位置', async () => {
    setupBaselineLines()
    await startHost('主机甲')
    fireEvent({ type: 'connected', role: 'host', peerId: 'host-1' })

    const insertDelta = {
      line_id: 'L-new',
      speaker: null,
      dialogue: 'inserted',
      background: null,
      characters: {},
      audio: { bgm: null, ambient: null, se: [], voice: null },
      choices: undefined,
      prompt: undefined,
      label: undefined,
    }
    fireEvent({
      type: 'message',
      sourcePeerId: 'peer-x',
      msg: { type: 'delta_insert', index: 1, delta: insertDelta, fromPeerId: 'peer-x' },
    })

    expect(appStore.useAppStore.getState().draftDeltas.length).toBe(3)
    expect(appStore.useAppStore.getState().draftDeltas[1].dialogue).toBe('inserted')
  })
})

describe('collabBridge - Host 中继与权限拦截', () => {
  it('Host 对仅查看成员的编辑予以拦截并发全量纠正', async () => {
    setupBaselineLines()
    await startHost('主机甲')
    fireEvent({ type: 'connected', role: 'host', peerId: 'host-1' })
    collabStore.useCollabStore.getState().addPeer({
      id: 'viewer-1', displayName: '看客', permission: 'view', connectedAt: Date.now(),
    })

    const d0 = appStore.useAppStore.getState().draftDeltas[0]
    fireEvent({
      type: 'message',
      sourcePeerId: 'viewer-1',
      msg: { type: 'delta_set', index: 0, delta: { ...d0, dialogue: 'hacked' }, fromPeerId: 'viewer-1' },
    })

    expect(manager().sendFullSyncTo).toHaveBeenCalledWith('viewer-1', expect.anything())
    expect(manager().relayExcept).not.toHaveBeenCalled()
    expect(appStore.useAppStore.getState().draftDeltas[0].dialogue).toBe('line-zero')
  })

  it('Host 对可编辑成员的编辑予以中继并应用', async () => {
    setupBaselineLines()
    await startHost('主机甲')
    fireEvent({ type: 'connected', role: 'host', peerId: 'host-1' })
    collabStore.useCollabStore.getState().addPeer({
      id: 'editor-1', displayName: '编辑者', permission: 'edit', connectedAt: Date.now(),
    })

    const d0 = appStore.useAppStore.getState().draftDeltas[0]
    fireEvent({
      type: 'message',
      sourcePeerId: 'editor-1',
      msg: { type: 'delta_set', index: 0, delta: { ...d0, dialogue: 'from-editor' }, fromPeerId: 'editor-1' },
    })

    expect(manager().relayExcept).toHaveBeenCalled()
    expect(appStore.useAppStore.getState().draftDeltas[0].dialogue).toBe('from-editor')
  })
})

describe('collabBridge - 审计与踢人', () => {
  it('kickPeer 由 host 触发且生成 danger 级审计', async () => {
    await startHost('主机甲')
    fireEvent({ type: 'connected', role: 'host', peerId: 'host-1' })

    const before = collabStore.useCollabStore.getState().auditLogs.length
    kickPeer('bad-guy')

    expect(manager().kickPeer).toHaveBeenCalledWith('bad-guy')
    const logs = collabStore.useCollabStore.getState().auditLogs
    expect(logs.length).toBeGreaterThan(before)
    expect(logs.some((l: any) => l.action === 'kick' && l.severity === 'danger')).toBe(true)
  })

  it('setPeerPermission 由 host 触发并生成 warning 级审计', async () => {
    await startHost('主机甲')
    fireEvent({ type: 'connected', role: 'host', peerId: 'host-1' })

    setPeerPermission('some-peer', 'view')

    expect(manager().setPermission).toHaveBeenCalledWith('some-peer', 'view')
    expect(collabStore.useCollabStore.getState().auditLogs.some((l: any) => l.action === 'permission_change')).toBe(true)
  })

  it('非 host 调用 setPeerPermission / kickPeer 静默无效', async () => {
    await joinSession('invite-code', '协作者乙')
    fireEvent({ type: 'connected', role: 'guest', peerId: 'guest-9' })

    kickPeer('x')
    setPeerPermission('x', 'view')
    expect(manager().kickPeer).not.toHaveBeenCalled()
    expect(manager().setPermission).not.toHaveBeenCalled()
  })
})
