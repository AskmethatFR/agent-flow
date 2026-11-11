import assert from 'node:assert/strict'
import { Given, Then, When } from '@cucumber/cucumber'
import { openPanelOnReply, selectStep } from '../support/panel-host.ts'
import type { PanelWorld } from '../support/panel-host.ts'

const stepTitle = 'Design'
const stepRow = `${stepTitle} (todo)`

type Fact = { origin: 'verified' | 'declared'; source: string; label: string }

const snapshotWithFacts = (facts: readonly Fact[]): unknown => ({
  kind: 'snapshot',
  snapshot: {
    issue: '#113',
    title: 'Step detail',
    steps: [
      {
        id: 's1',
        title: stepTitle,
        role: 'dev-a',
        status: 'todo',
        origin: 'planned',
        timeSpent: null,
        decisions: [],
        omittedDecisions: 0,
        facts,
      },
    ],
    currentStepId: null,
    currentAgent: null,
    errors: [],
  },
})

const factLines = (world: PanelWorld, badge: string, label: string, source: string): number => {
  const start = world.texts.indexOf(badge)
  assert.ok(start >= 0, `"${badge}" not in ${JSON.stringify(world.texts)}`)
  assert.deepEqual(world.texts.slice(start, start + 3), [badge, label, `Source: ${source}`])
  return start
}

Given(
  'a step whose snapshot lists the verified fact {string} from {string} then the declared fact {string} from {string}',
  function (this: PanelWorld, verifiedLabel: string, verifiedSource: string, declaredLabel: string, declaredSource: string) {
    this.snapshotReply = snapshotWithFacts([
      { origin: 'verified', source: verifiedSource, label: verifiedLabel },
      { origin: 'declared', source: declaredSource, label: declaredLabel },
    ])
  },
)

Given('a step whose snapshot lists no fact', function (this: PanelWorld) {
  this.snapshotReply = snapshotWithFacts([])
})

When('I open the detail of that step', async function (this: PanelWorld) {
  await openPanelOnReply(this, this.snapshotReply)
  await selectStep(this, stepRow)
})

Then(
  'the step detail lists {string} with a Verified badge and the source {string}',
  function (this: PanelWorld, label: string, source: string) {
    factLines(this, 'Verified', label, source)
  },
)

Then(
  'the step detail lists {string} with a Declared badge and the source {string}, after the first',
  function (this: PanelWorld, label: string, source: string) {
    assert.ok(factLines(this, 'Declared', label, source) > this.texts.indexOf('Verified'), JSON.stringify(this.texts))
  },
)

Then(
  'the step detail shows the labels {string} and {string} unchanged, with no text added',
  function (this: PanelWorld, verifiedLabel: string, declaredLabel: string) {
    assert.deepEqual(
      this.texts.filter((text) => text.toLowerCase().includes(verifiedLabel.toLowerCase()) || text.toLowerCase().includes(declaredLabel.toLowerCase())),
      [verifiedLabel, declaredLabel],
    )
  },
)

Then(
  'the step detail shows no Verified badge, no Declared badge, no source line and no statement about facts',
  function (this: PanelWorld) {
    assert.deepEqual(
      this.texts.filter((text) => /^(Verified|Declared)$|^Source:|fact/i.test(text)),
      [],
    )
  },
)
