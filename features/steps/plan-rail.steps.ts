import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mock } from 'node:test'
import { act } from 'react-test-renderer'
import { Given, Then, When } from '@cucumber/cucumber'
import { openPanel, stepOf, writePlan } from '../support/panel-host.ts'
import type { PanelWorld } from '../support/panel-host.ts'

Given(
  'the current worktree works on the issue {string} with the steps {string}, {string} and {string} in that order',
  function (this: PanelWorld, title: string, first: string, second: string, third: string) {
    writePlan(this, {
      issue: '#42',
      title,
      steps: [stepOf('s1', first), stepOf('s2', second), stepOf('s3', third)],
    })
  },
)

Given(
  'the snapshot of the current worktree carries one error naming step {string} and field {string}',
  function (this: PanelWorld, stepId: string, field: string) {
    writePlan(this, {
      issue: '#42',
      title: 'Add login',
      steps: [stepOf(stepId, 'Open PR', 'not-a-status')],
    })
    this.expectedField = field
    this.expectedStep = stepId
  },
)

When('the user opens the {string} tab', async function (this: PanelWorld, _tab: string) {
  await openPanel(this)
})

Then('the panel shows the title {string}', function (this: PanelWorld, title: string) {
  assert.ok(this.texts.includes(title), `title "${title}" not in ${JSON.stringify(this.texts)}`)
})

Then(
  'the panel lists the steps {string}, {string} and {string} in that order',
  function (this: PanelWorld, first: string, second: string, third: string) {
    const positions = [first, second, third].map((title) => this.texts.findIndex((text) => text.includes(title)))
    assert.ok(positions.every((position) => position >= 0), `steps missing in ${JSON.stringify(this.texts)}`)
    assert.deepEqual([...positions].sort((a, b) => a - b), positions)
  },
)

Then('the panel lists that error', function (this: PanelWorld) {
  assert.ok(this.texts.includes('Snapshot errors'), `no errors heading in ${JSON.stringify(this.texts)}`)
  const row = this.texts.find((text) => text.includes(this.expectedStep) && text.includes(this.expectedField))
  assert.ok(row, `no error row naming ${this.expectedStep} and ${this.expectedField} in ${JSON.stringify(this.texts)}`)
})

Then('the panel stays usable', async function (this: PanelWorld) {
  const fallbacks = ['Agent Flow cannot read this workspace.', 'The Agent Flow server did not answer. Retrying.']
  assert.ok(!this.texts.some((text) => fallbacks.includes(text)))
  writeFileSync(
    join(this.root, '.agent-flow', 'plan.json'),
    JSON.stringify({ issue: '#42', title: 'Add login', steps: [stepOf(this.expectedStep, 'Open PR')] }),
  )
  await act(async () => {
    mock.timers.tick(2_000)
  })
  const texts = this.panel.texts()
  assert.ok(texts.some((text) => text.startsWith('Open PR')), `plan not shown after the next poll: ${JSON.stringify(texts)}`)
  assert.ok(!texts.includes('Snapshot errors'))
})
