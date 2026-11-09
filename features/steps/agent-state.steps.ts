import assert from 'node:assert/strict'
import { mock } from 'node:test'
import { act } from 'react-test-renderer'
import { Given, Then, When } from '@cucumber/cucumber'
import { openPanel, stepOf, writePlan } from '../support/panel-host.ts'
import type { PanelWorld } from '../support/panel-host.ts'

const hostStatusOf = { running: 'running', stopped: 'idle' } as const

const planWithAgentOn = (world: PanelWorld, role: string, status: string): void => {
  writePlan(world, {
    issue: '#21',
    title: 'Agent state',
    steps: [{ ...stepOf('s1', 'Implement', 'in_progress', '2026-11-09T09:00:00Z'), role }],
  })
  world.agentStatus = status
}

const agentAfterCurrent = (world: PanelWorld): string[] => {
  const marker = world.texts.indexOf('Current')
  assert.ok(marker >= 0, `no current step in ${JSON.stringify(world.texts)}`)
  return world.texts.slice(marker + 1, marker + 3)
}

Given('the agent {string} is running on the step in progress', function (this: PanelWorld, role: string) {
  planWithAgentOn(this, role, hostStatusOf.running)
})

Given('the agent on the step in progress has stopped', function (this: PanelWorld) {
  planWithAgentOn(this, 'dev-a', hostStatusOf.stopped)
})

Given('I have opened the panel', async function (this: PanelWorld) {
  await openPanel(this)
})

When('the agent stops', async function (this: PanelWorld) {
  this.agentStatus = hostStatusOf.stopped
  await act(async () => {
    mock.timers.tick(2_000)
  })
  this.texts = this.panel.texts()
})

Then('the current step shows {string} as running', function (this: PanelWorld, role: string) {
  assert.deepEqual(agentAfterCurrent(this), [`Agent: ${role}`, 'running'], JSON.stringify(this.texts))
})

Then('the current step shows the agent as stopped', function (this: PanelWorld) {
  assert.deepEqual(agentAfterCurrent(this), ['Agent: dev-a', 'stopped'], JSON.stringify(this.texts))
})

Then('the current step shows the agent as stopped without reopening the panel', function (this: PanelWorld) {
  assert.deepEqual(agentAfterCurrent(this), ['Agent: dev-a', 'stopped'], JSON.stringify(this.texts))
  assert.ok(!this.texts.includes('running'), JSON.stringify(this.texts))
})
