import assert from 'node:assert/strict'
import { Given, Then } from '@cucumber/cucumber'
import { buildSnapshot } from '@agent-flow/core/snapshot'
import type { CiFact, Snapshot } from '@agent-flow/core/snapshot'

type CiWorld = {
  planText?: string
  decisionsText?: string
  ciStatus?: string
  snapshot: Snapshot
}

const MAX_TEXT_LENGTH = 1_048_576

const builtAt = new Date('2026-10-22T10:38:00Z')

const stepOf = (id: string): Record<string, unknown> => ({
  id,
  title: `Step ${id}`,
  role: 'dev-a',
  status: 'todo',
  origin: 'planned',
  startedAt: null,
  endedAt: null,
})

const planOf = (...ids: readonly string[]): string =>
  JSON.stringify({ issue: '#114', title: 'CI fact', steps: ids.map(stepOf) })

const checkRunOf = (overlay: Record<string, unknown> = {}): Record<string, unknown> => ({
  __typename: 'CheckRun',
  name: 'test',
  status: 'COMPLETED',
  conclusion: 'SUCCESS',
  ...overlay,
})

const rollupOf = (headCommit: string, ...checks: readonly Record<string, unknown>[]): string =>
  JSON.stringify({ headRefOid: headCommit, statusCheckRollup: checks })

const withCiStatus = (world: CiWorld, text: string): void => {
  world.planText ??= planOf('s1')
  world.ciStatus = text
}

const onlyCiFact = (world: CiWorld): CiFact => {
  const { ci } = world.snapshot
  assert.ok(ci !== null)
  return ci
}

Given('a CI status for head commit {string} whose checks all passed', function (this: CiWorld, commit: string): void {
  withCiStatus(this, rollupOf(commit, checkRunOf(), checkRunOf({ name: 'bdd', conclusion: 'NEUTRAL' })))
})

Given(
  'a CI status for head commit {string} with a check that concluded with failure',
  function (this: CiWorld, commit: string): void {
    withCiStatus(this, rollupOf(commit, checkRunOf(), checkRunOf({ name: 'bdd', conclusion: 'FAILURE' })))
  },
)

Given(
  'a CI status for head commit {string} with a check that is still running',
  function (this: CiWorld, commit: string): void {
    withCiStatus(this, rollupOf(commit, checkRunOf(), checkRunOf({ name: 'bdd', status: 'IN_PROGRESS', conclusion: '' })))
  },
)

Given('no CI status is given', function (this: CiWorld): void {
  assert.equal(this.ciStatus, undefined)
})

Given('a CI status that is not valid JSON', function (this: CiWorld): void {
  withCiStatus(this, '{not json')
})

Given('a CI status larger than 1 MiB', function (this: CiWorld): void {
  withCiStatus(this, `${rollupOf('abc123', checkRunOf())}${' '.repeat(MAX_TEXT_LENGTH)}`)
})

Then(
  'the snapshot carries a verified CI fact from source {string} for head commit {string} in state {string}',
  function (this: CiWorld, source: string, commit: string, state: string): void {
    assert.deepEqual(this.snapshot.ci, { origin: 'verified', source, headCommit: commit, state })
  },
)

Then(
  'the verified CI fact for head commit {string} is in state {string}',
  function (this: CiWorld, commit: string, state: string): void {
    assert.deepEqual(this.snapshot.ci, { origin: 'verified', source: 'gh', headCommit: commit, state })
  },
)

Then(
  'step {string} carries the same facts as in a snapshot built without the CI status',
  function (this: CiWorld, id: string): void {
    assert.ok(this.planText !== undefined)
    const withoutCi = buildSnapshot({ plan: this.planText, decisions: this.decisionsText }, builtAt)
    const facts = (snapshot: Snapshot) => snapshot.steps.find((candidate) => candidate.id === id)?.facts
    assert.notEqual(facts(this.snapshot), undefined)
    assert.deepEqual(facts(this.snapshot), facts(withoutCi))
  },
)

Then('the verified CI fact belongs to no step', function (this: CiWorld): void {
  const fact = onlyCiFact(this)
  assert.deepEqual(Object.keys(fact).sort(), ['headCommit', 'origin', 'source', 'state'])
  assert.deepEqual(
    this.snapshot.steps.flatMap(({ facts }) => facts.filter(({ source }) => source === fact.source)),
    [],
  )
})

Then('the snapshot carries no CI fact', function (this: CiWorld): void {
  assert.equal(this.snapshot.ci, null)
})

Then('the snapshot carries no error', function (this: CiWorld): void {
  assert.deepEqual(this.snapshot.errors, [])
})

Then('the snapshot carries one error for the CI status', function (this: CiWorld): void {
  assert.deepEqual(this.snapshot.errors, [
    { file: 'ci-status', location: null, field: null, message: 'is not valid JSON' },
  ])
})

Then('step {string} keeps its declared fact', function (this: CiWorld, id: string): void {
  const step = this.snapshot.steps.find((candidate) => candidate.id === id)
  assert.deepEqual(step?.facts, [{ origin: 'declared', source: 'decisions.jsonl', label: 'declared' }])
})

Then('the snapshot carries a size error for the CI status', function (this: CiWorld): void {
  assert.deepEqual(this.snapshot.errors, [
    { file: 'ci-status', location: null, field: null, message: `exceeds ${MAX_TEXT_LENGTH} characters` },
  ])
})
