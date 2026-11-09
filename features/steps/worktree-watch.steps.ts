import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { After, Given, Then, When } from '@cucumber/cucumber'
import { applyStepEvent } from '@agent-flow/capture-shared/plan-writer'
import { createGetSnapshot } from '@agent-flow/daemon/snapshot'
import type { AgentSource, ReadIo, SnapshotReply, WorkspaceSource } from '@agent-flow/daemon/snapshot'

type WorktreeWatchWorld = {
  root: string
  worktrees: Map<string, string>
  source: WorkspaceSource
  paths: string[]
  before: SnapshotReply
  reply: SnapshotReply
}

const startedAt = '2026-01-01T09:00:00.000Z'
const finishedAt = '2026-01-01T10:00:00.000Z'
const clock = () => new Date('2026-01-01T11:00:00.000Z')
const stepId = 's1'
const noAgents: AgentSource = { list: async () => ({ entries: [] }) }

const planOf = (issue: string): string =>
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
  world.paths = []
}

const addWorktree = (world: WorktreeWatchWorld, name: string, issue: string): void => {
  const worktree = join(world.root, name)
  mkdirSync(join(worktree, '.agent-flow'), { recursive: true })
  writeFileSync(join(worktree, '.agent-flow', 'plan.json'), planOf(issue))
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

const recordingIo = (paths: string[]): ReadIo => ({
  ...fs,
  openSync: ((path: fs.PathLike, ...rest: unknown[]) => {
    paths.push(String(path))
    return (fs.openSync as (p: fs.PathLike, ...r: unknown[]) => number)(path, ...rest)
  }) as ReadIo['openSync'],
  realpathSync: ((path: fs.PathLike, ...rest: unknown[]) => {
    paths.push(String(path))
    return (fs.realpathSync as (p: fs.PathLike, ...r: unknown[]) => string)(path, ...rest)
  }) as ReadIo['realpathSync'],
})

const worktreeNamed = (world: WorktreeWatchWorld, name: string): string => {
  const worktree = world.worktrees.get(name)
  assert.ok(worktree !== undefined, `worktree ${name} is not set up`)
  return worktree
}

const requestSnapshot = (world: WorktreeWatchWorld, workspaceId: string): Promise<SnapshotReply> =>
  createGetSnapshot({ io: recordingIo(world.paths), now: clock })(
    { workspaceId },
    world.source,
    noAgents,
  )

const snapshotOf = (reply: SnapshotReply) => {
  assert.equal(reply.kind, 'snapshot')
  return reply.snapshot
}

const finishStep = (world: WorktreeWatchWorld, name: string): void => {
  const result = applyStepEvent(worktreeNamed(world, name), { kind: 'finish', stepId, at: finishedAt })
  assert.deepEqual(result, { accepted: true })
}

Given('the daemon watches a worktree', function (this: WorktreeWatchWorld): void {
  openRoot(this)
  addWorktree(this, 'watched', '#1')
  this.source = sourceOver(this.worktrees)
})

When('an agent marks a step as done in that worktree', function (this: WorktreeWatchWorld): void {
  finishStep(this, 'watched')
})

Then(
  'the next snapshot of that worktree shows the step as done',
  async function (this: WorktreeWatchWorld): Promise<void> {
    const snapshot = snapshotOf(await requestSnapshot(this, 'watched'))
    assert.equal(snapshot.issue, '#1')
    assert.equal(snapshot.steps.find((step) => step.id === stepId)?.status, 'done')
  },
)

Given(
  'two worktrees each work on a different issue',
  async function (this: WorktreeWatchWorld): Promise<void> {
    openRoot(this)
    addWorktree(this, 'first', '#1')
    addWorktree(this, 'second', '#2')
    this.source = sourceOver(this.worktrees)
    this.before = await requestSnapshot(this, 'second')
    assert.equal(snapshotOf(this.before).issue, '#2')
  },
)

When('a step changes in the first worktree', function (this: WorktreeWatchWorld): void {
  finishStep(this, 'first')
})

Then(
  'the snapshot of the second worktree is unchanged',
  async function (this: WorktreeWatchWorld): Promise<void> {
    assert.deepEqual(await requestSnapshot(this, 'second'), this.before)
  },
)

Given(
  'the panel names a workspace that the host cannot map to a known worktree',
  function (this: WorktreeWatchWorld): void {
    openRoot(this)
    addWorktree(this, 'planted', '#3')
    this.source = sourceOver(new Map([['planted', worktreeNamed(this, 'planted')]]))
  },
)

When(
  'the panel asks for the snapshot of that workspace',
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

Then(
  "the answer carries nothing from any worktree's plan",
  function (this: WorktreeWatchWorld): void {
    assert.deepEqual(this.paths.filter((path) => path.includes('.agent-flow')), [])
    assert.deepEqual(this.reply, { kind: 'refused', reason: 'unknown-worktree' })
  },
)

After(function (this: WorktreeWatchWorld): void {
  if (this.root !== undefined) rmSync(this.root, { recursive: true, force: true })
})
