import { describe, expect, it } from 'vitest'
import type { PluginServerContext } from '@getpaseo/plugin/server'
import contribute from '../index.server.ts'
import { getSnapshotRpc } from '../shared/snapshot-rpc.ts'

type Handler = (input: unknown, context: { paseo: { workspaces: unknown } }) => Promise<unknown>

describe('snapshot registration', () => {
  it('serves getSnapshotRpc and refuses a workspace the host does not know', async () => {
    const registered: { contract: unknown; handler: Handler }[] = []
    const server = {
      handle: (contract: unknown, handler: Handler) => registered.push({ contract, handler }),
    } as unknown as PluginServerContext
    contribute(server)
    expect(registered).toHaveLength(1)
    expect(registered[0]?.contract).toBe(getSnapshotRpc)
    const workspaces = { ref: () => ({ refresh: async () => null }) }
    const reply = await registered[0]?.handler({ workspaceId: 'w1' }, { paseo: { workspaces } })
    expect(reply).toEqual({ kind: 'refused', reason: 'unknown-worktree' })
  })
})
