import assert from 'node:assert/strict'
import { Given, Then, When } from '@cucumber/cucumber'
import { openPanel, stepOf, writePlan } from '../support/panel-host.ts'
import type { PanelWorld } from '../support/panel-host.ts'

const stepTitle = 'Implement'
const minute = 60_000

const planWith = (world: PanelWorld, step: Record<string, unknown>): void => {
  writePlan(world, { issue: '#19', title: 'Time spent', steps: [step] })
}

const rowOf = (world: PanelWorld): string => {
  const row = world.texts.find((text) => text.startsWith(stepTitle))
  assert.ok(row, `no row for "${stepTitle}" in ${JSON.stringify(world.texts)}`)
  return row
}

Given('a step started 38 minutes ago and is still in progress', function (this: PanelWorld) {
  const startedAt = new Date(Date.now() - 38 * minute - minute / 2).toISOString()
  planWith(this, stepOf('s1', stepTitle, 'in_progress', startedAt))
})

Given('a step started at 10:00 and ended at 11:15', function (this: PanelWorld) {
  planWith(this, stepOf('s1', stepTitle, 'done', '2026-11-02T10:00:00Z', '2026-11-02T11:15:00Z'))
})

Given('a step with status {string}', function (this: PanelWorld, status: string) {
  planWith(this, stepOf('s1', stepTitle, status))
})

When('I open the panel', async function (this: PanelWorld) {
  await openPanel(this)
})

Then('the step shows {string} and is marked as current', function (this: PanelWorld, label: string) {
  assert.ok(this.texts.includes(label), `"${label}" not in ${JSON.stringify(this.texts)}`)
  assert.equal(rowOf(this), `${stepTitle} (in_progress)`)
  assert.equal(this.texts.filter((text) => text === 'Current').length, 1, JSON.stringify(this.texts))
})

Then('the step shows {string} and is marked as done', function (this: PanelWorld, label: string) {
  assert.ok(this.texts.includes(label), `"${label}" not in ${JSON.stringify(this.texts)}`)
  assert.equal(rowOf(this), `${stepTitle} (done)`)
  assert.ok(!this.texts.includes('Current'), JSON.stringify(this.texts))
})

Then('the step shows no time spent', function (this: PanelWorld) {
  assert.deepEqual(
    this.texts.filter((text) => text !== '#19' && text !== 'Time spent'),
    [`${stepTitle} (todo)`],
  )
})
