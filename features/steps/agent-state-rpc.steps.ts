import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { After, Given, Then, When } from '@cucumber/cucumber'
import type { Snapshot } from '@agent-flow/core/snapshot'
import { createGetSnapshot } from '@agent-flow/daemon/snapshot'
import type { AgentSource, WorkspaceSource } from '@agent-flow/daemon/snapshot'

type AgentStateRpcWorld = {
  root: string
  worktree: string
  agents: AgentSource
  snapshot: Snapshot
}

const workspaceId = 'w1'

const planOf = (role: string): string =>
  JSON.stringify({
    issue: '#41',
    title: 'Agent state in the snapshot',
    steps: [
      {
        id: 's1',
        title: 'Implementation',
        role,
        status: 'in_progress',
        origin: 'planned',
        startedAt: '2026-11-01T09:00:00.000Z',
        endedAt: null,
      },
    ],
  })

const addWorktree = (world: AgentStateRpcWorld, name: string, role: string): string => {
  const worktree = join(world.root, name)
  mkdirSync(join(worktree, '.agent-flow'), { recursive: true })
  writeFileSync(join(worktree, '.agent-flow', 'plan.json'), planOf(role))
  return worktree
}

const agentOn = (worktreeRoot: string, status: string): AgentSource => ({
  list: async () => ({ entries: [{ agent: { status }, project: { checkout: { worktreeRoot } } }] }),
})

const workspaceOf = (worktreeRoot: string): WorkspaceSource => ({
  ref: () => ({ refresh: async () => ({ project: { checkout: { worktreeRoot } } }) }),
})

Given(
  'a worktree has the step {string} in progress',
  function (this: AgentStateRpcWorld, role: string): void {
    this.root = realpathSync(mkdtempSync(join(tmpdir(), 'agent-state-rpc-')))
    this.worktree = addWorktree(this, 'watched', role)
  },
)

Given(
  'the host has an agent running on that worktree',
  function (this: AgentStateRpcWorld): void {
    this.agents = agentOn(this.worktree, 'running')
  },
)

Given(
  'the host has an agent that is idle on that worktree',
  function (this: AgentStateRpcWorld): void {
    this.agents = agentOn(this.worktree, 'idle')
  },
)

Given(
  'the only host agent works on a different worktree',
  function (this: AgentStateRpcWorld): void {
    this.agents = agentOn(addWorktree(this, 'elsewhere', 'dev-a'), 'running')
  },
)

const failingWith = (message: string): AgentSource => ({
  list: async () => Promise.reject(new Error(message)),
})

Given('the host agent list fails', function (this: AgentStateRpcWorld): void {
  this.agents = failingWith('host unreachable')
})

Given('the host agent list refuses permission', function (this: AgentStateRpcWorld): void {
  this.agents = failingWith('permission denied')
})

Then('the plan steps of the snapshot are intact', function (this: AgentStateRpcWorld): void {
  assert.deepEqual(
    this.snapshot.steps.map(({ id, role, status }) => ({ id, role, status })),
    [{ id: 's1', role: 'dev-a', status: 'in_progress' }],
  )
  assert.equal(this.snapshot.currentStepId, 's1')
})

Then(
  'the snapshot has exactly one error labelled {string}',
  function (this: AgentStateRpcWorld, label: string): void {
    assert.deepEqual(
      this.snapshot.errors.map(({ file }) => file),
      [label],
    )
  },
)

When(
  'the panel asks for the snapshot of that worktree',
  async function (this: AgentStateRpcWorld): Promise<void> {
    const getSnapshot = createGetSnapshot({ io: fs, now: () => new Date('2026-11-01T10:00:00.000Z') })
    const reply = await getSnapshot({ workspaceId }, workspaceOf(this.worktree), this.agents)
    assert.equal(reply.kind, 'snapshot')
    this.snapshot = reply.snapshot
  },
)

After(function (this: AgentStateRpcWorld): void {
  if (this.root !== undefined) rmSync(this.root, { recursive: true, force: true })
})
