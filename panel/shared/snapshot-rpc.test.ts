import { describe, expect, expectTypeOf, it } from 'vitest'
import type { z } from 'zod'
import type { Snapshot } from '@agent-flow/core/snapshot'
import type { SnapshotReply } from '@agent-flow/daemon/snapshot'
import { getSnapshotRpc, SnapshotSchema } from './snapshot-rpc.ts'

type SchemaSnapshot = z.output<typeof SnapshotSchema>
type RpcReply = z.input<typeof getSnapshotRpc.output>

const snapshot: Snapshot = {
  issue: '#1',
  title: 'Plan',
  steps: [
    {
      id: 's1',
      title: 'Implementation',
      role: 'dev-a',
      status: 'in_progress',
      origin: 'proposed',
      timeSpent: { milliseconds: 60_000, label: '1 min' },
    },
  ],
  currentStepId: 's1',
  errors: [
    { file: 'plan.json', location: 3, field: 'status', message: 'bad' },
    { file: 'plan.json', location: 'steps', field: null, message: 'bad' },
    { file: 'plan.json', location: null, field: null, message: 'bad' },
  ],
}

describe('getSnapshotRpc', () => {
  it('is named get-snapshot, the closest name defineRpc accepts to getSnapshot', () => {
    expect(getSnapshotRpc.name).toBe('get-snapshot')
  })

  it('mirrors the core Snapshot field for field', () => {
    expectTypeOf<SchemaSnapshot>().toEqualTypeOf<Snapshot>()
    expectTypeOf<SnapshotReply>().toExtend<RpcReply>()
  })

  it('accepts a snapshot reply and a refusal', () => {
    expect(getSnapshotRpc.output.parse({ kind: 'snapshot', snapshot })).toEqual({
      kind: 'snapshot',
      snapshot,
    })
    const refused = { kind: 'refused', reason: 'unknown-worktree' }
    expect(getSnapshotRpc.output.parse(refused)).toEqual(refused)
  })

  it('rejects an unknown refusal reason and an unknown kind', () => {
    expect(getSnapshotRpc.output.safeParse({ kind: 'refused', reason: 'nope' }).success).toBe(false)
    expect(getSnapshotRpc.output.safeParse({ kind: 'other' }).success).toBe(false)
  })

  it('accepts only a bounded workspaceId', () => {
    expect(getSnapshotRpc.input.safeParse({ workspaceId: 'w1' }).success).toBe(true)
    expect(getSnapshotRpc.input.safeParse({ workspaceId: '' }).success).toBe(false)
    expect(getSnapshotRpc.input.safeParse({ workspaceId: 'x'.repeat(257) }).success).toBe(false)
    expect(getSnapshotRpc.input.safeParse({ workspaceId: 'w1', extra: 1 }).success).toBe(false)
  })
})
