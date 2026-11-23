import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { linkSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Given, Then, When } from '@cucumber/cucumber'
import type { Snapshot } from '@agent-flow/core/snapshot'
import { createGetSnapshot } from '@agent-flow/daemon/snapshot'
import type { AgentSource, WorkspaceSource } from '@agent-flow/daemon/snapshot'
import { passingCiOf } from './passing-ci'

type ReportFeedWorld = {
  worktree: string
  snapshot: Snapshot
}

const noAgents: AgentSource = { list: async () => ({ entries: [] }) }

const workspaceOf = (worktreeRoot: string): WorkspaceSource => ({
  ref: () => ({ refresh: async () => ({ project: { checkout: { worktreeRoot } } }) }),
})

Given(
  'the verified-fact file of that worktree has a vitest line of {int} passed out of {int} on step {string}',
  function (this: ReportFeedWorld, passed: number, total: number, step: string): void {
    const line = JSON.stringify({
      at: '2026-11-23T12:00:00.000Z',
      tool: 'vitest',
      step,
      attachment: 'role',
      role: 'dev-a',
      roleFrom: 'agent',
      passed,
      total,
      failedSuites: 0,
    })
    writeFileSync(join(this.worktree, '.agent-flow', 'verified-facts.jsonl'), `${line}\n`)
  },
)

const factFileOf = (world: ReportFeedWorld): string => join(world.worktree, '.agent-flow', 'verified-facts.jsonl')

const validLine = (): string =>
  `${JSON.stringify({
    at: '2026-11-23T12:00:00.000Z',
    tool: 'vitest',
    step: 's1',
    attachment: 'role',
    role: 'dev-a',
    roleFrom: 'agent',
    passed: 1,
    total: 1,
    failedSuites: 0,
  })}\n`

const obstacles: Record<string, (world: ReportFeedWorld) => void> = {
  'a directory': (world) => mkdirSync(factFileOf(world)),
  'a FIFO': (world) => execFileSync('mkfifo', [factFileOf(world)]),
  'a hard link': (world) => {
    const original = join(world.worktree, 'original-facts.jsonl')
    writeFileSync(original, validLine())
    linkSync(original, factFileOf(world))
  },
}

Given(
  /^the verified-fact file of that worktree is (a directory|a FIFO|a hard link)$/,
  function (this: ReportFeedWorld, obstacle: string): void {
    obstacles[obstacle]?.(this)
  },
)

Given(
  'the verified-fact file of that worktree is a symlink to a file outside the worktree',
  function (this: ReportFeedWorld): void {
    const outside = join(this.worktree, '..', 'outside-facts.jsonl')
    writeFileSync(outside, validLine())
    symlinkSync(outside, factFileOf(this))
  },
)

When(
  'the panel asks for the snapshot of that worktree without agents',
  async function (this: ReportFeedWorld): Promise<void> {
    const getSnapshot = createGetSnapshot({
      io: fs,
      now: () => new Date('2026-11-01T10:00:00.000Z'),
      ciStatus: passingCiOf('678b2c7355d66c094c072c5dcc2cb8ec26d70c68'),
    })
    const reply = await getSnapshot({ workspaceId: 'w1' }, workspaceOf(this.worktree), noAgents)
    assert.equal(reply.kind, 'snapshot')
    this.snapshot = reply.snapshot
  },
)

Then(
  'the step {string} of the snapshot carries the verified fact {string} from {string}',
  function (this: ReportFeedWorld, id: string, label: string, source: string): void {
    const step = this.snapshot.steps.find((candidate) => candidate.id === id)
    assert.ok(step !== undefined)
    assert.deepEqual(
      step.facts.filter(({ origin }) => origin === 'verified'),
      [{ origin: 'verified', source, label }],
    )
  },
)

Then('the snapshot carries no verified fact', function (this: ReportFeedWorld): void {
  assert.deepEqual(
    this.snapshot.steps.flatMap(({ facts }) => facts.filter(({ origin }) => origin === 'verified')),
    [],
  )
})

Then(
  'the snapshot has the single error {string} saying {string}',
  function (this: ReportFeedWorld, file: string, message: string): void {
    assert.deepEqual(this.snapshot.errors, [{ file, location: null, field: null, message }])
  },
)

Then('the snapshot has no error',function (this: ReportFeedWorld): void {
  assert.deepEqual(this.snapshot.errors, [])
})
