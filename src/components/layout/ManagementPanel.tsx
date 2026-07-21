import SceneNavPanel from './SceneNavPanel'

export default function ManagementPanel({ embedded = false }: { embedded?: boolean }) {
  return <SceneNavPanel embedded={embedded} />
}
