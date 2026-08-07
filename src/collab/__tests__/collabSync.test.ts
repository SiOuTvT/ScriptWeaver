import { describe, it, expect } from 'vitest'
import {
  diffAssetsToMessages,
  diffCharactersToMessages,
  diffVariablesToMessages,
} from '../collabBridge'
import type { CollabMessage } from '../types'
import type { AssetItem, CharacterConfig, GlobalVariable } from '@/core/types'

/** 镜像 handleRemoteMessage 中 asset_add / asset_delete 的应用语义（按 id upsert / filter 删除） */
function applyAssetMessages(assets: AssetItem[], msgs: CollabMessage[]): AssetItem[] {
  let next = [...assets]
  for (const m of msgs) {
    if (m.type === 'asset_add') {
      const i = next.findIndex((a) => a.id === m.asset.id)
      if (i >= 0) next[i] = m.asset
      else next.push(m.asset)
    } else if (m.type === 'asset_delete') {
      next = next.filter((a) => a.id !== m.assetId)
    }
  }
  return next
}

/** 镜像 handleRemoteMessage 中 character / variable 的应用语义 */
function applyCharacterMessages(configs: CharacterConfig[], msgs: CollabMessage[]): CharacterConfig[] {
  let next = [...configs]
  for (const m of msgs) {
    if (m.type === 'character_add') {
      const i = next.findIndex((c) => c.charId === m.config.charId)
      if (i >= 0) next[i] = m.config
      else next.push(m.config)
    } else if (m.type === 'character_update') {
      next = next.map((c) => (c.charId === m.charId ? { ...c, ...m.patch } : c))
    } else if (m.type === 'character_delete') {
      next = next.filter((c) => c.charId !== m.charId)
    }
  }
  return next
}

function applyVariableMessages(vars: GlobalVariable[], msgs: CollabMessage[]): GlobalVariable[] {
  let next = [...vars]
  for (const m of msgs) {
    if (m.type === 'variable_add') {
      const i = next.findIndex((v) => v.name === m.variable.name)
      if (i >= 0) next[i] = m.variable
      else next.push(m.variable)
    } else if (m.type === 'variable_update') {
      next = next.map((v) => (v.name === m.name ? { ...v, ...m.patch } : v))
    } else if (m.type === 'variable_delete') {
      next = next.filter((v) => v.name !== m.name)
    }
  }
  return next
}

const mkAsset = (id: string, name: string): AssetItem => ({
  id, type: 'sprite', name, fileName: `${name}.png`, relativePath: `assets/${name}.png`, importedAt: '',
})

describe('协作同步：素材/角色/变量的实时差量收敛', () => {
  it('A 新增素材 → 广播 asset_add → B 应用后能看到，且不丢原有素材', () => {
    const base = mkAsset('a1', 'js1')
    const peerA = [base]
    const peerB = [base]

    const nextA = [...peerA, mkAsset('a2', 'js2')]
    const msgs = diffAssetsToMessages(peerA, nextA, 'peerA')

    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatchObject({ type: 'asset_add', asset: { id: 'a2', name: 'js2' }, fromPeerId: 'peerA' })

    const afterB = applyAssetMessages(peerB, msgs)
    expect(afterB.map((a) => a.id).sort()).toEqual(['a1', 'a2'])
  })

  it('并发新增不丢：A 加 x、B 加 y，双方收敛到相同集合', () => {
    const peerA = [mkAsset('a1', 'base')]
    const peerB = [mkAsset('a1', 'base')]

    const nextA = [...peerA, mkAsset('a2', 'x')]
    const nextB = [...peerB, mkAsset('a3', 'y')]
    const msgsA2B = diffAssetsToMessages(peerA, nextA, 'peerA')
    const msgsB2A = diffAssetsToMessages(peerB, nextB, 'peerB')

    const afterB = applyAssetMessages(applyAssetMessages(peerB, msgsA2B), msgsB2A)
    const afterA = applyAssetMessages(applyAssetMessages(peerA, msgsB2A), msgsA2B)

    expect(afterA.map((a) => a.id).sort()).toEqual(['a1', 'a2', 'a3'])
    expect(afterB.map((a) => a.id).sort()).toEqual(['a1', 'a2', 'a3'])
  })

  it('A 删除素材 → 广播 asset_delete → B 应用后删除', () => {
    const peerA = [mkAsset('a1', 'x'), mkAsset('a2', 'y')]
    const peerB = [...peerA]

    const nextA = peerA.filter((a) => a.id !== 'a2')
    const msgs = diffAssetsToMessages(peerA, nextA, 'peerA')

    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatchObject({ type: 'asset_delete', assetId: 'a2' })

    const afterB = applyAssetMessages(peerB, msgs)
    expect(afterB.map((a) => a.id)).toEqual(['a1'])
  })

  it('角色变更：A 新增角色 → B 能看到；A 更新角色属性 → B 收到 character_update', () => {
    const mkChar = (charId: string, displayName: string): CharacterConfig => ({
      charId, displayName, expressions: [], defaultScale: 1, defaultSlot: 'center',
      createdAt: '', updatedAt: '',
    })
    const peerA: CharacterConfig[] = []
    const peerB: CharacterConfig[] = []

    // 新增
    const nextA = [mkChar('alice', '爱丽丝')]
    const addMsgs = diffCharactersToMessages(peerA, nextA, 'peerA')
    expect(addMsgs[0]).toMatchObject({ type: 'character_add', config: { charId: 'alice' } })
    const afterB = applyCharacterMessages(peerB, addMsgs)
    expect(afterB.map((c) => c.charId)).toEqual(['alice'])

    // 更新属性
    const updated = [{ ...nextA[0], displayName: '爱丽丝·改' }]
    const updMsgs = diffCharactersToMessages(nextA, updated, 'peerA')
    expect(updMsgs[0]).toMatchObject({ type: 'character_update', charId: 'alice' })
    const finalB = applyCharacterMessages(afterB, updMsgs)
    expect(finalB[0].displayName).toBe('爱丽丝·改')
  })

  it('变量同步：新增/更新/删除均收敛', () => {
    const mkVar = (name: string, initial: number): GlobalVariable => ({ name, type: 'number', initial })
    const peerA: GlobalVariable[] = []
    const peerB: GlobalVariable[] = []

    const nextA = [mkVar('好感度', 1)]
    const msgs1 = diffVariablesToMessages(peerA, nextA, 'peerA')
    expect(msgs1[0]).toMatchObject({ type: 'variable_add', variable: { name: '好感度' } })
    const afterB1 = applyVariableMessages(peerB, msgs1)
    expect(afterB1).toHaveLength(1)

    // A 更新变量值
    const nextA2 = [{ ...nextA[0], initial: 2 }]
    const msgs2 = diffVariablesToMessages(nextA, nextA2, 'peerA')
    expect(msgs2[0]).toMatchObject({ type: 'variable_update', name: '好感度' })
    const afterB2 = applyVariableMessages(afterB1, msgs2)
    expect(afterB2[0].initial).toBe(2)

    // A 删除变量
    const msgs3 = diffVariablesToMessages(nextA2, [], 'peerA')
    expect(msgs3[0]).toMatchObject({ type: 'variable_delete', name: '好感度' })
    const afterB3 = applyVariableMessages(afterB2, msgs3)
    expect(afterB3).toHaveLength(0)
  })

  it('无变化时 diff 不产生任何消息', () => {
    const assets = [mkAsset('a1', 'x')]
    expect(diffAssetsToMessages(assets, [...assets], 'peerA')).toHaveLength(0)
    expect(diffVariablesToMessages([], [], 'peerA')).toHaveLength(0)
  })
})
