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
      decisions: [
        { title: 'Use a Map', why: 'safe keys', rejected: ['object'], role: 'dev-a', confidence: 'high' },
      ],
      omittedDecisions: 4,
      facts: [{ origin: 'declared', source: 'decisions.jsonl', label: 'Use a Map' }],
      omittedFacts: 6,
    },
  ],
  currentStepId: 's1',
  currentAgent: { role: 'dev-a', state: 'running' },
  ci: { origin: 'verified', source: 'gh', headCommit: 'abc123', state: 'passed' },
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

  it('keeps the decisions of a step intact and rejects a bad confidence', () => {
    const parsed = getSnapshotRpc.output.parse({ kind: 'snapshot', snapshot })
    expect(parsed).toMatchObject({ snapshot: { steps: [{ decisions: snapshot.steps[0]?.decisions }] } })
    const bad = { ...snapshot, steps: [{ ...snapshot.steps[0], decisions: [{ title: 't', why: 'w', rejected: [], role: 'r', confidence: 'sure' }] }] }
    expect(getSnapshotRpc.output.safeParse({ kind: 'snapshot', snapshot: bad }).success).toBe(false)
  })

  it('keeps the omitted decisions count of a step and rejects a step without it', () => {
    const parsed = getSnapshotRpc.output.parse({ kind: 'snapshot', snapshot })
    expect(parsed).toMatchObject({ snapshot: { steps: [{ omittedDecisions: 4 }] } })
    const { omittedDecisions: _, ...withoutCount } = snapshot.steps[0] as Snapshot['steps'][number]
    const bad = { ...snapshot, steps: [withoutCount] }
    expect(getSnapshotRpc.output.safeParse({ kind: 'snapshot', snapshot: bad }).success).toBe(false)
  })

  it('keeps the omitted facts count of a step and rejects a step without it', () => {
    const parsed = getSnapshotRpc.output.parse({ kind: 'snapshot', snapshot })
    expect(parsed).toMatchObject({ snapshot: { steps: [{ omittedFacts: 6 }] } })
    const { omittedFacts: _, ...withoutCount } = snapshot.steps[0] as Snapshot['steps'][number]
    const bad = { ...snapshot, steps: [withoutCount] }
    expect(getSnapshotRpc.output.safeParse({ kind: 'snapshot', snapshot: bad }).success).toBe(false)
  })

  it.each([
    ['a negative count', -1],
    ['a fractional count', 1.5],
  ])('rejects %s of omitted facts', (_, omittedFacts) => {
    const bad = { ...snapshot, steps: [{ ...snapshot.steps[0], omittedFacts }] }
    expect(getSnapshotRpc.output.safeParse({ kind: 'snapshot', snapshot: bad }).success).toBe(false)
  })

  it('keeps the facts of a step intact', () => {
    const parsed = getSnapshotRpc.output.parse({ kind: 'snapshot', snapshot })
    expect(parsed).toMatchObject({ snapshot: { steps: [{ facts: snapshot.steps[0]?.facts }] } })
  })

  it('rejects an unknown fact origin', () => {
    const bad = { ...snapshot, steps: [{ ...snapshot.steps[0], facts: [{ origin: 'maybe', source: 'decisions.jsonl', label: 'Use a Map' }] }] }
    expect(getSnapshotRpc.output.safeParse({ kind: 'snapshot', snapshot: bad }).success).toBe(false)
  })

  it('rejects a step without facts', () => {
    const { facts: _, ...withoutFacts } = snapshot.steps[0] as Snapshot['steps'][number]
    const bad = { ...snapshot, steps: [withoutFacts] }
    expect(getSnapshotRpc.output.safeParse({ kind: 'snapshot', snapshot: bad }).success).toBe(false)
  })

  it.each([
    ['a negative count', -1],
    ['a fractional count', 1.5],
  ])('rejects %s of omitted decisions', (_, omittedDecisions) => {
    const bad = { ...snapshot, steps: [{ ...snapshot.steps[0], omittedDecisions }] }
    expect(getSnapshotRpc.output.safeParse({ kind: 'snapshot', snapshot: bad }).success).toBe(false)
  })

  it.each([
    ['a running agent', { role: 'dev-a', state: 'running' }],
    ['a stopped agent', { role: 'dev-a', state: 'stopped' }],
    ['an unknown agent state', { role: 'dev-a', state: 'unknown' }],
    ['no agent', null],
  ])('keeps %s intact', (_, currentAgent) => {
    const parsed = getSnapshotRpc.output.parse({ kind: 'snapshot', snapshot: { ...snapshot, currentAgent } })
    expect(parsed).toMatchObject({ snapshot: { currentAgent } })
  })

  it.each([
    ['a display state outside the set', { role: 'dev-a', state: 'idle' }],
    ['a missing role', { state: 'running' }],
    ['a missing state', { role: 'dev-a' }],
    ['a missing field', undefined],
  ])('rejects %s on the current agent', (_, currentAgent) => {
    const bad = { ...snapshot, currentAgent }
    expect(getSnapshotRpc.output.safeParse({ kind: 'snapshot', snapshot: bad }).success).toBe(false)
  })

  it.each([
    ['a passed fact', { origin: 'verified', source: 'gh', headCommit: 'abc123', state: 'passed' }],
    ['a failed fact', { origin: 'verified', source: 'gh', headCommit: 'abc123', state: 'failed' }],
    ['a pending fact', { origin: 'verified', source: 'gh', headCommit: 'abc123', state: 'pending' }],
    ['no fact', null],
  ])('keeps %s on the CI field intact', (_, ci) => {
    const parsed = getSnapshotRpc.output.parse({ kind: 'snapshot', snapshot: { ...snapshot, ci } })
    expect(parsed).toMatchObject({ snapshot: { ci } })
  })

  it.each([
    ['a state outside the set', { origin: 'verified', source: 'gh', headCommit: 'abc123', state: 'green' }],
    ['a declared origin', { origin: 'declared', source: 'gh', headCommit: 'abc123', state: 'passed' }],
    ['a missing head commit', { origin: 'verified', source: 'gh', state: 'passed' }],
    ['a missing source', { origin: 'verified', headCommit: 'abc123', state: 'passed' }],
    ['a missing state', { origin: 'verified', source: 'gh', headCommit: 'abc123' }],
    ['a missing field', undefined],
  ])('rejects %s on the CI field', (_, ci) => {
    const bad = { ...snapshot, ci }
    expect(getSnapshotRpc.output.safeParse({ kind: 'snapshot', snapshot: bad }).success).toBe(false)
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
