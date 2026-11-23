import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Given, Then, When } from '@cucumber/cucumber'
import type { Snapshot } from '@agent-flow/core/snapshot'
import { createGetSnapshot, createGhRunner } from '@agent-flow/daemon/snapshot'
import type { AgentSource, ExecFile, WorkspaceSource } from '@agent-flow/daemon/snapshot'
import { passingRollupOf } from './passing-ci'

type GhCall = { readonly args: readonly string[]; readonly cwd: string }

type CiStatusRpcWorld = {
  worktree: string
  gh: ExecFile
  ghCalls: GhCall[]
  snapshot: Snapshot
}

type GhAnswer = (callback: Parameters<ExecFile>[3]) => void

const workspaceId = 'w1'

const noAgents: AgentSource = { list: async () => ({ entries: [] }) }

const workspaceOf = (worktreeRoot: string): WorkspaceSource => ({
  ref: () => ({ refresh: async () => ({ project: { checkout: { worktreeRoot } } }) }),
})

const ghAnswering = (world: CiStatusRpcWorld, answer: GhAnswer): void => {
  world.ghCalls = []
  world.gh = (_file, args, options, callback) => {
    world.ghCalls.push({ args, cwd: options.cwd })
    answer(callback)
    return undefined
  }
}

const ghFailingWith = (world: CiStatusRpcWorld, code: unknown): void =>
  ghAnswering(world, (callback) => callback(Object.assign(new Error('gh failed'), { code }), ''))

Given(
  'gh reports a pull request at head commit {string} whose checks all passed',
  function (this: CiStatusRpcWorld, headCommit: string): void {
    ghAnswering(this, (callback) => callback(null, passingRollupOf(headCommit)))
  },
)

Given('gh is not installed', function (this: CiStatusRpcWorld): void {
  ghFailingWith(this, 'ENOENT')
})

Given('gh exits with a failure', function (this: CiStatusRpcWorld): void {
  ghFailingWith(this, 1)
})

Given('gh does not answer in time', function (this: CiStatusRpcWorld): void {
  ghFailingWith(this, null)
})

Given('gh answers with more output than the bound', function (this: CiStatusRpcWorld): void {
  ghFailingWith(this, 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
})

Given(
  'the plan of that worktree is titled {string}',
  function (this: CiStatusRpcWorld, title: string): void {
    const planPath = join(this.worktree, '.agent-flow', 'plan.json')
    writeFileSync(planPath, JSON.stringify({ ...JSON.parse(readFileSync(planPath, 'utf8')), title }))
  },
)

When(
  'the panel asks for the snapshot of that worktree with its CI status',
  async function (this: CiStatusRpcWorld): Promise<void> {
    const getSnapshot = createGetSnapshot({
      io: fs,
      now: () => new Date('2026-11-01T10:00:00.000Z'),
      ciStatus: createGhRunner(this.gh, '/usr/bin/gh'),
    })
    const reply = await getSnapshot({ workspaceId }, workspaceOf(this.worktree), noAgents)
    assert.equal(reply.kind, 'snapshot')
    this.snapshot = reply.snapshot
  },
)

Then(
  'the snapshot carries a verified CI fact for head commit {string} in state {string}',
  function (this: CiStatusRpcWorld, headCommit: string, state: string): void {
    assert.deepEqual(this.snapshot.ci, { origin: 'verified', source: 'gh', headCommit, state })
  },
)

Then('the steps of the snapshot are intact', function (this: CiStatusRpcWorld): void {
  assert.deepEqual(
    this.snapshot.steps.map(({ id, role, status }) => ({ id, role, status })),
    [{ id: 's1', role: 'dev-a', status: 'in_progress' }],
  )
  assert.equal(this.snapshot.currentStepId, 's1')
})

Then('the snapshot reports no CI fact', function (this: CiStatusRpcWorld): void {
  assert.equal(this.snapshot.ci, null)
})

Then(
  'the snapshot carries exactly one error, labelled {string}',
  function (this: CiStatusRpcWorld, label: string): void {
    assert.deepEqual(
      this.snapshot.errors.map(({ file }) => file),
      [label],
    )
  },
)

Then(
  'gh was run once from that worktree with the arguments {string}',
  function (this: CiStatusRpcWorld, args: string): void {
    assert.deepEqual(this.ghCalls, [{ args: args.split(' '), cwd: this.worktree }])
  },
)
