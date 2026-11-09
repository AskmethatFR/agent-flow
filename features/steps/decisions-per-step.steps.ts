import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { Given, Then, When } from '@cucumber/cucumber'
import { MAX_DECISIONS_PER_STEP } from '@agent-flow/core/snapshot'
import { decisionOf, openPanel, selectStep, stepOf, writeDecisions, writePlan } from '../support/panel-host.ts'
import type { PanelWorld } from '../support/panel-host.ts'

const runner = 'Pick a test runner'
const decisionTitlesByStep: Record<string, readonly string[]> = {
  Planning: [runner],
  Architecture: ['Use hexagonal layers', 'Keep core pure'],
  Implementation: ['Ship behind a flag'],
}
const noDecisionCopy = 'No decision logged for this step.'

const writeFixture = (world: PanelWorld, steps: readonly [string, string][], decisions: Record<string, unknown>[]): void => {
  writePlan(world, {
    issue: '#20',
    title: 'Step detail',
    steps: steps.map(([id, title]) => stepOf(id, title)),
  })
  writeDecisions(world, decisions)
}

const selectExpectedStep = async (world: PanelWorld): Promise<void> => {
  await openPanel(world)
  await selectStep(world, `${world.expectedStep} (todo)`)
}

Given('decisions exist for several steps', function (this: PanelWorld) {
  const steps: [string, string][] = [
    ['s1', 'Planning'],
    ['s2', 'Architecture'],
    ['s3', 'Implementation'],
  ]
  writeFixture(
    this,
    steps,
    steps.flatMap(([id, title]) => (decisionTitlesByStep[title] ?? []).map((decisionTitle) => decisionOf(id, decisionTitle))),
  )
})

When('I select the step {string}', async function (this: PanelWorld, title: string) {
  this.expectedStep = title
  await selectExpectedStep(this)
})

Then('only decisions made during {string} are listed', function (this: PanelWorld, title: string) {
  const own = decisionTitlesByStep[title]
  assert.ok(own !== undefined, `no decisions fixture for "${title}"`)
  const foreignTitles = Object.entries(decisionTitlesByStep)
    .filter(([stepName]) => stepName !== title)
    .flatMap(([, titles]) => titles)
  for (const listed of own) {
    assert.ok(this.texts.includes(listed), `"${listed}" not in ${JSON.stringify(this.texts)}`)
  }
  for (const foreign of foreignTitles) {
    assert.ok(!this.texts.includes(foreign), `"${foreign}" leaked into ${JSON.stringify(this.texts)}`)
  }
  assert.ok(!this.texts.includes(noDecisionCopy), JSON.stringify(this.texts))
})

Given('a decision with title, why, rejected options and confidence', function (this: PanelWorld) {
  this.expectedStep = 'Design'
  writeFixture(this, [['s1', 'Design']], [decisionOf('s1', 'Use zod', 'one schema for both sides', ['io-ts', 'yup'], 'architect', 'medium')])
})

When('I select its step', async function (this: PanelWorld) {
  await selectExpectedStep(this)
})

Then('the decision shows its title, why, rejected options and confidence', function (this: PanelWorld) {
  assert.deepEqual(
    this.texts.slice(this.texts.indexOf(`${this.expectedStep} (todo)`) + 1),
    ['Use zod', 'Why: one schema for both sides', 'Rejected: io-ts · yup', 'Role: architect · Confidence: medium'],
  )
})

Given('a step with no decision', function (this: PanelWorld) {
  this.expectedStep = 'Open PR'
  writeFixture(
    this,
    [
      ['s1', 'Design'],
      ['s2', 'Open PR'],
    ],
    [decisionOf('s1', runner)],
  )
})

When('I select it', async function (this: PanelWorld) {
  await selectExpectedStep(this)
})

Then('the step detail states that no decision was logged', function (this: PanelWorld) {
  assert.ok(this.texts.includes(noDecisionCopy), JSON.stringify(this.texts))
  assert.ok(!this.texts.includes(runner), JSON.stringify(this.texts))
})

const omittedDecisions = 3
const busyTitles = Array.from({ length: MAX_DECISIONS_PER_STEP + omittedDecisions }, (_, index) => `Busy ${index}`)
const quietTitles = Array.from({ length: MAX_DECISIONS_PER_STEP - 1 }, (_, index) => `Quiet ${index}`)
const omittedMarker = (count: number): string => `Decisions not shown: ${count}`

const decisionsOfStep = (stepId: string, titles: readonly string[]): Record<string, unknown>[] =>
  titles.map((title) => decisionOf(stepId, title))

const rewriteFixture = (world: PanelWorld, steps: readonly [string, string][], decisions: Record<string, unknown>[]): void => {
  if (world.root) rmSync(world.root, { recursive: true, force: true })
  writeFixture(world, steps, decisions)
}

Given('a step with more decisions than the cap', function (this: PanelWorld) {
  this.expectedStep = 'Busy'
  writeFixture(this, [['s1', 'Busy']], decisionsOfStep('s1', busyTitles))
})

Given('another step with fewer decisions than the cap', function (this: PanelWorld) {
  rewriteFixture(
    this,
    [
      ['s1', 'Busy'],
      ['s2', 'Quiet'],
    ],
    [...decisionsOfStep('s1', busyTitles), ...decisionsOfStep('s2', quietTitles)],
  )
})

When('I select the other step', async function (this: PanelWorld) {
  this.expectedStep = 'Quiet'
  await selectExpectedStep(this)
})

Then('the step detail lists exactly the first decisions up to the cap, in file order', function (this: PanelWorld) {
  assert.deepEqual(
    this.texts.filter((text) => /^Busy \d+$/.test(text)),
    busyTitles.slice(0, MAX_DECISIONS_PER_STEP),
  )
})

Then('it shows one marker saying how many decisions were left out', function (this: PanelWorld) {
  assert.deepEqual(
    this.texts.filter((text) => text.startsWith('Decisions not shown')),
    [omittedMarker(busyTitles.length - MAX_DECISIONS_PER_STEP)],
  )
})

Then('all of its decisions are listed and no marker is shown', function (this: PanelWorld) {
  assert.deepEqual(
    this.texts.filter((text) => /^Quiet \d+$/.test(text)),
    quietTitles,
  )
  assert.deepEqual(
    this.texts.filter((text) => text.startsWith('Decisions not shown')),
    [],
  )
})
