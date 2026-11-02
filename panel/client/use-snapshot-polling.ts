import { useEffect, useState } from 'react'
import type { z } from 'zod'
import type { getSnapshotRpc } from '../shared/snapshot-rpc.ts'

export type SnapshotReply = z.output<typeof getSnapshotRpc.output>

export type PanelState = { kind: 'loading' } | { kind: 'reply'; reply: SnapshotReply } | { kind: 'unreachable' }

export const useSnapshotPolling = (
  getSnapshot: (input: { workspaceId: string }) => Promise<SnapshotReply>,
  workspaceId: string,
): PanelState => {
  const [state, setState] = useState<PanelState>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    void getSnapshot({ workspaceId }).then((reply) => {
      if (active) setState({ kind: 'reply', reply })
    })
    return () => {
      active = false
    }
  }, [getSnapshot, workspaceId])

  return state
}
