import assert from 'node:assert/strict'
import { Given, Then, When } from '@cucumber/cucumber'
import { buildSnapshot } from '@agent-flow/core/snapshot'
import type { MutationReport, Snapshot, SnapshotStep, TestReport } from '@agent-flow/core/snapshot'

type DecisionsWorld = {
  planText: string
  decisionsText?: string
  testReports?: readonly TestReport[]
  mutationReports?: readonly MutationReport[]
  snapshot: Snapshot
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
  JSON.stringify({ issue: '#39', title: 'Decisions', steps: ids.map(stepOf) })

const lineOf = (step: string, title: string): string =>
  JSON.stringify({
    at: '2026-10-22T10:00:00Z',
    step,
    role: 'dev-a',
    kind: 'decision',
    title,
    why: `because ${title}`,
    rejected: [`not ${title}`],
    confidence: 'high',
  })

const stepNamed = (world: DecisionsWorld, id: string): SnapshotStep => {
  const found = world.snapshot.steps.find((candidate) => candidate.id === id)
  assert.ok(found !== undefined)
  return found
}

Given('decisions.jsonl contains a malformed line', function (this: DecisionsWorld): void {
  this.planText = planOf('s1')
  this.decisionsText = [lineOf('s1', 'one'), lineOf('s1', 'two'), '{not json', lineOf('s1', 'three')].join('\n')
})

Given(
  'the plan has steps {string} and {string} and decisions are logged for both',
  function (this: DecisionsWorld, first: string, second: string): void {
    this.planText = planOf(first, second)
    this.decisionsText = [lineOf(first, 'a'), lineOf(second, 'b'), lineOf(first, 'c')].join('\n')
  },
)

Given(
  'the plan has a step {string} and no decision is logged for {string}',
  function (this: DecisionsWorld, step: string, other: string): void {
    this.planText = planOf('s1', step)
    this.decisionsText = lineOf('s1', 'only')
    assert.notEqual(step, 's1')
    assert.equal(other, step)
  },
)

When('the snapshot is built', function (this: DecisionsWorld): void {
  this.snapshot = buildSnapshot(
    {
      plan: this.planText,
      decisions: this.decisionsText,
      testReports: this.testReports,
      mutationReports: this.mutationReports,
    },
    new Date('2026-10-22T10:38:00Z'),
  )
})

Then('the valid decisions are present', function (this: DecisionsWorld): void {
  assert.deepEqual(
    stepNamed(this, 's1').decisions.map((decision) => decision.title),
    ['one', 'two', 'three'],
  )
})

Then('the snapshot reports the malformed line', function (this: DecisionsWorld): void {
  assert.deepEqual(this.snapshot.errors, [
    { file: 'decisions.jsonl', location: 3, field: null, message: 'is not valid JSON' },
  ])
})

Then(
  'step {string} lists only the decisions logged for {string} with title, why, rejected options, role and confidence',
  function (this: DecisionsWorld, id: string, logged: string): void {
    assert.equal(id, logged)
    assert.deepEqual(stepNamed(this, id).decisions, [
      { title: 'a', why: 'because a', rejected: ['not a'], role: 'dev-a', confidence: 'high' },
      { title: 'c', why: 'because c', rejected: ['not c'], role: 'dev-a', confidence: 'high' },
    ])
  },
)

Then('step {string} lists no decision', function (this: DecisionsWorld, id: string): void {
  assert.deepEqual(stepNamed(this, id).decisions, [])
})
