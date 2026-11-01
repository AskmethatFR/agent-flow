import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { After, Given, Then, When } from '@cucumber/cucumber'
import { applyStepEvent } from '@agent-flow/capture-shared/plan-writer'
import { getSnapshot } from '@agent-flow/daemon/snapshot'
import type { SnapshotReply, WorkspaceSource } from '@agent-flow/daemon/snapshot'

type WorktreeWatchWorld = {
  root: string
  worktrees: Map<string, string>
  source: WorkspaceSource
  before: SnapshotReply
  reply: SnapshotReply
}

const startedAt = '2026-01-01T09:00:00.000Z'
const finishedAt = '2026-01-01T10:00:00.000Z'

const planOf = (issue: string, stepId: string): string =>
  JSON.stringify({
    issue,
    title: `Plan ${issue}`,
    steps: [
      {
        id: stepId,
        title: 'Implementation',
        role: 'dev-a',
        status: 'in_progress',
        origin: 'planned',
        startedAt,
        endedAt: null,
      },
    ],
  })

const openRoot = (world: WorktreeWatchWorld): void => {
  world.root = realpathSync(mkdtempSync(join(tmpdir(), 'worktree-watch-')))
  world.worktrees = new Map()
}

const addWorktree = (world: WorktreeWatchWorld, name: string, plan: string): void => {
  const worktree = join(world.root, name)
  mkdirSync(join(worktree, '.agent-flow'), { recursive: true })
  writeFileSync(join(worktree, '.agent-flow', 'plan.json'), plan)
  world.worktrees.set(name, worktree)
}

const sourceOver = (known: ReadonlyMap<string, string>): WorkspaceSource => ({
  ref: (workspaceId) => ({
    refresh: async () => {
      const worktreeRoot = known.get(workspaceId)
      return worktreeRoot === undefined ? null : { project: { checkout: { worktreeRoot } } }
    },
  }),
})

const worktreeNamed = (world: WorktreeWatchWorld, name: string): string => {
  const worktree = world.worktrees.get(name)
  assert.ok(worktree !== undefined, `worktree ${name} is not set up`)
  return worktree
}

const requestSnapshot = (world: WorktreeWatchWorld, name: string): Promise<SnapshotReply> =>
  getSnapshot({ workspaceId: name }, world.source)

const snapshotOf = (reply: SnapshotReply) => {
  assert.equal(reply.kind, 'snapshot')
  return reply.snapshot
}

const withoutElapsedTime = (reply: SnapshotReply) => {
  const snapshot = snapshotOf(reply)
  return { ...snapshot, steps: snapshot.steps.map(({ timeSpent: _, ...step }) => step) }
}

const names = { first: 'first', second: 'second' } as const

Given(
  'two worktrees, each with its own plan where step {string} is in progress',
  async function (this: WorktreeWatchWorld, stepId: string): Promise<void> {
    openRoot(this)
    addWorktree(this, names.first, planOf('#1', stepId))
    addWorktree(this, names.second, planOf('#2', stepId))
    this.source = sourceOver(this.worktrees)
    this.before = await requestSnapshot(this, names.second)
  },
)

When(
  'step {string} is finished in the first worktree',
  function (this: WorktreeWatchWorld, stepId: string): void {
    const result = applyStepEvent(worktreeNamed(this, names.first), {
      kind: 'finish',
      stepId,
      at: finishedAt,
    })
    assert.deepEqual(result, { accepted: true })
  },
)

Then(
  "the first worktree's snapshot shows step {string} as done",
  async function (this: WorktreeWatchWorld, stepId: string): Promise<void> {
    const snapshot = snapshotOf(await requestSnapshot(this, names.first))
    assert.equal(snapshot.issue, '#1')
    assert.equal(snapshot.steps.find((step) => step.id === stepId)?.status, 'done')
  },
)

Then(
  "the second worktree's snapshot is unchanged",
  async function (this: WorktreeWatchWorld): Promise<void> {
    const after = await requestSnapshot(this, names.second)
    assert.deepEqual(withoutElapsedTime(after), withoutElapsedTime(this.before))
  },
)

Given(
  'a workspace the host cannot map to a known worktree',
  function (this: WorktreeWatchWorld): void {
    openRoot(this)
    addWorktree(this, 'unmapped', planOf('#3', 's1'))
    this.source = sourceOver(new Map())
  },
)

When(
  'the snapshot of that workspace is requested',
  async function (this: WorktreeWatchWorld): Promise<void> {
    this.reply = await requestSnapshot(this, 'unmapped')
  },
)

Then(
  'the request is refused with the reason {string}',
  function (this: WorktreeWatchWorld, reason: string): void {
    assert.deepEqual(this.reply, { kind: 'refused', reason })
  },
)

Then('no plan is read', function (this: WorktreeWatchWorld): void {
  assert.equal(JSON.stringify(this.reply).includes('#3'), false)
})

After(function (this: WorktreeWatchWorld): void {
  if (this.root !== undefined) rmSync(this.root, { recursive: true, force: true })
})
