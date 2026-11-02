import { useEffect, useState } from 'react'
import type { z } from 'zod'
import type { getSnapshotRpc } from '../shared/snapshot-rpc.ts'

export const SNAPSHOT_POLL_INTERVAL_MS = 2_000

export type SnapshotReply = z.output<typeof getSnapshotRpc.output>

export type PanelState = { kind: 'loading' } | { kind: 'reply'; reply: SnapshotReply } | { kind: 'unreachable' }

export const useSnapshotPolling = (
  getSnapshot: (input: { workspaceId: string }) => Promise<SnapshotReply>,
  workspaceId: string,
): PanelState => {
  const [state, setState] = useState<PanelState>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = () => {
      void getSnapshot({ workspaceId })
        .then((reply) => {
          if (active) setState({ kind: 'reply', reply })
        })
        .finally(() => {
          if (active) timer = setTimeout(poll, SNAPSHOT_POLL_INTERVAL_MS)
        })
    }
    poll()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [getSnapshot, workspaceId])

  return state
}
