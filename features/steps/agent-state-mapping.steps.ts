import assert from 'node:assert/strict'
import { Given, Then } from '@cucumber/cucumber'
import type { Snapshot } from '@agent-flow/core/snapshot'

type AgentStateWorld = {
  now: Date
  planText: string
  agentStatus: string | undefined
  snapshot: Snapshot
}

const planOf = (role: string, status: 'todo' | 'in_progress'): string =>
  JSON.stringify({
    issue: '#40',
    title: 'Agent display state',
    steps: [
      {
        id: 's1',
        title: 'Implementation',
        role,
        status,
        origin: 'planned',
        startedAt: status === 'in_progress' ? '2026-10-22T10:00:00Z' : null,
        endedAt: null,
      },
    ],
  })

Given(
  'the adapter reports the role {string} with the host status {string}',
  function (this: AgentStateWorld, role: string, hostStatus: string): void {
    this.now = new Date('2026-10-22T10:30:00Z')
    this.planText = planOf(role, 'in_progress')
    this.agentStatus = hostStatus
  },
)

Given('the adapter reports no role and no host status', function (this: AgentStateWorld): void {
  this.now = new Date('2026-10-22T10:30:00Z')
  this.planText = planOf('dev-a', 'todo')
  this.agentStatus = undefined
})

Then(
  'the current agent is {string} in the state {string}',
  function (this: AgentStateWorld, role: string, state: string): void {
    assert.deepEqual(this.snapshot.currentAgent, { role, state })
  },
)

Then('the snapshot has no current agent', function (this: AgentStateWorld): void {
  assert.equal(this.snapshot.currentAgent, null)
})
