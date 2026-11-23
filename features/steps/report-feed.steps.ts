import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { writeFileSync } from 'node:fs'
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

Then('the snapshot has no error', function (this: ReportFeedWorld): void {
  assert.deepEqual(this.snapshot.errors, [])
})
