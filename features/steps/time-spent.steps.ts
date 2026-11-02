import assert from 'node:assert/strict'
import { mock } from 'node:test'
import { Given, Then, When } from '@cucumber/cucumber'
import { renderPanel } from '../../panel/client/testing/render-panel.tsx'
import { hostInvoke, stepOf, writePlan } from '../support/panel-host.ts'
import type { PanelWorld } from '../support/panel-host.ts'

const MINUTE = 60_000

const planWith = (world: PanelWorld, step: Record<string, unknown>): void =>
  writePlan(world, { issue: '#19', title: 'Time spent', steps: [step] })

Given('a step started 38 minutes ago and is still in progress', function (this: PanelWorld) {
  const startedAt = new Date(Date.now() - 38 * MINUTE - MINUTE / 2).toISOString()
  planWith(this, stepOf('s1', 'Implement', 'in_progress', startedAt))
})

Given('a step started at 10:00 and ended at 11:15', function (this: PanelWorld) {
  planWith(this, stepOf('s1', 'Implement', 'done', '2026-11-02T10:00:00Z', '2026-11-02T11:15:00Z'))
})

Given('a step with status {string}', function (this: PanelWorld, status: string) {
  planWith(this, stepOf('s1', 'Implement', status))
})

When('I open the panel', async function (this: PanelWorld) {
  mock.timers.enable({ apis: ['setTimeout'] })
  this.panel = await renderPanel(hostInvoke(this), { workspaceId: 'w1' })
  this.texts = this.panel.texts()
})

Then('the step shows {string} and is marked as current', function (this: PanelWorld, label: string) {
  assert.ok(this.texts.includes(label), `"${label}" not in ${JSON.stringify(this.texts)}`)
  assert.ok(this.texts.includes('Current'), `no Current marker in ${JSON.stringify(this.texts)}`)
})

Then('the step shows {string} and is marked as done', function (this: PanelWorld, label: string) {
  assert.ok(this.texts.includes(label), `"${label}" not in ${JSON.stringify(this.texts)}`)
  assert.ok(this.texts.includes('Implement (done)'), `step not done in ${JSON.stringify(this.texts)}`)
  assert.ok(!this.texts.includes('Current'))
})

Then('the step shows no time spent', function (this: PanelWorld) {
  assert.deepEqual(this.texts.slice(2), ['Implement (todo)'])
})
