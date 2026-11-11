import assert from 'node:assert/strict'
import { Given, Then } from '@cucumber/cucumber'
import type { Snapshot, SnapshotStep } from '@agent-flow/core/snapshot'

type FactsWorld = {
  planText: string
  decisionsText: string
  snapshot: Snapshot
  factsOfStep?: SnapshotStep['facts']
}

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
  JSON.stringify({ issue: '#109', title: 'Facts', steps: ids.map(stepOf) })

const lineOf = (step: string, title: string): string =>
  JSON.stringify({
    at: '2026-11-11T10:00:00Z',
    step,
    role: 'dev-a',
    kind: 'decision',
    title,
    why: `because ${title}`,
    rejected: [`not ${title}`],
    confidence: 'high',
  })

const stepNamed = (world: FactsWorld, id: string): SnapshotStep => {
  const found = world.snapshot.steps.find((candidate) => candidate.id === id)
  assert.ok(found !== undefined)
  return found
}

Given(
  'the plan has a step {string} and decisions are logged for {string}',
  function (this: FactsWorld, step: string, logged: string): void {
    assert.equal(logged, step)
    this.planText = planOf(step)
    this.decisionsText = [lineOf(step, 'one'), lineOf(step, 'two')].join('\n')
  },
)

Given(
  'the plan has a step {string} and decisions {string} and {string} are logged for {string}',
  function (this: FactsWorld, step: string, first: string, second: string, logged: string): void {
    assert.equal(logged, step)
    this.planText = planOf(step)
    this.decisionsText = [lineOf(step, first), lineOf(step, second)].join('\n')
  },
)

Then('step {string} carries one fact per decision', function (this: FactsWorld, id: string): void {
  const found = stepNamed(this, id)
  this.factsOfStep = found.facts
  assert.deepEqual(found.facts.map(({ label }) => label), found.decisions.map(({ title }) => title))
})

Then('each fact has origin {string}, a source and a label', function (this: FactsWorld, origin: string): void {
  const facts = this.factsOfStep
  assert.ok(facts !== undefined && facts.length > 0)
  for (const fact of facts) {
    assert.equal(fact.origin, origin)
    assert.notEqual(fact.source, '')
    assert.notEqual(fact.label, '')
  }
})

Then('step {string} carries an empty fact list', function (this: FactsWorld, id: string): void {
  assert.deepEqual(stepNamed(this, id).facts, [])
})

Then('the facts of step {string} are labeled {string} then {string}', function (this: FactsWorld, id: string, first: string, second: string): void {
  assert.deepEqual(stepNamed(this, id).facts.map(({ label }) => label), [first, second])
})

Then('the valid decisions are present as facts', function (this: FactsWorld): void {
  const facts = stepNamed(this, 's1').facts
  assert.deepEqual(facts.map(({ label }) => label), ['one', 'two', 'three'])
  for (const fact of facts) assert.equal(fact.origin, 'declared')
})

Then(
  'step {string} keeps its frozen fields id, title, role, status, origin and timeSpent',
  function (this: FactsWorld, id: string): void {
    const found = stepNamed(this, id)
    assert.deepEqual(
      {
        id: found.id,
        title: found.title,
        role: found.role,
        status: found.status,
        origin: found.origin,
        timeSpent: found.timeSpent,
      },
      { id, title: `Step ${id}`, role: 'dev-a', status: 'todo', origin: 'planned', timeSpent: null },
    )
  },
)
