import assert from 'node:assert/strict'
import { Given, Then } from '@cucumber/cucumber'
import type { Snapshot, SnapshotFact, SnapshotStep, TestReport } from '@agent-flow/core/snapshot'

type ReportWorld = {
  planText: string
  decisionsText?: string
  testReports?: readonly TestReport[]
  expectedCounts?: { readonly passed: number; readonly total: number }
  snapshot: Snapshot
}

const MAX_TEXT_LENGTH = 1_048_576

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
  JSON.stringify({ issue: '#110', title: 'Test reports', steps: ids.map(stepOf) })

const decisionLineOf = (step: string): string =>
  JSON.stringify({
    at: '2026-11-11T10:00:00Z',
    step,
    role: 'dev-a',
    kind: 'decision',
    title: 'declared',
    why: 'because declared',
    rejected: ['not declared'],
    confidence: 'high',
  })

const vitestReportOf = (total: number, passed: number): string =>
  JSON.stringify({
    numTotalTests: total,
    numPassedTests: passed,
    numFailedTests: total - passed,
    numFailedTestSuites: 0,
    success: passed === total,
    testResults: [],
  })

const cucumberReportOf = (total: number, passed: number): string =>
  JSON.stringify([
    {
      keyword: 'Feature',
      elements: Array.from({ length: total }, (_, index) => ({
        type: 'scenario',
        steps: [{ result: { status: index < passed ? 'passed' : 'failed' } }],
      })),
    },
  ])

const withReport = (world: ReportWorld, step: string, text: string): void => {
  world.testReports = [...(world.testReports ?? []), { step, text }]
}

const stepNamed = (world: ReportWorld, id: string): SnapshotStep => {
  const found = world.snapshot.steps.find((candidate) => candidate.id === id)
  assert.ok(found !== undefined)
  return found
}

const verifiedFactsOf = (step: SnapshotStep): readonly SnapshotFact[] =>
  step.facts.filter(({ origin }) => origin === 'verified')

const reportIndexOf = (world: ReportWorld, step: string): number => {
  const index = (world.testReports ?? []).findIndex((report) => report.step === step)
  assert.notEqual(index, -1)
  return index + 1
}

Given('the plan has a step {string}', function (this: ReportWorld, step: string): void {
  this.planText = planOf(step)
})

Given('the plan has steps {string} and {string}', function (this: ReportWorld, first: string, second: string): void {
  this.planText = planOf(first, second)
})

Given('a decision is declared for step {string}', function (this: ReportWorld, step: string): void {
  this.decisionsText = decisionLineOf(step)
})

Given(
  'a vitest report for step {string} with {int} tests of which {int} passed',
  function (this: ReportWorld, step: string, total: number, passed: number): void {
    this.expectedCounts = { passed, total }
    withReport(this, step, vitestReportOf(total, passed))
  },
)

Given(
  'a vitest report, the first and only test report, for step {string} with {int} tests of which {int} passed',
  function (this: ReportWorld, step: string, total: number, passed: number): void {
    assert.equal(this.testReports, undefined)
    this.expectedCounts = { passed, total }
    withReport(this, step, vitestReportOf(total, passed))
  },
)

Given(
  'a cucumber-js JSON report for step {string} with {int} scenarios of which {int} passed',
  function (this: ReportWorld, step: string, total: number, passed: number): void {
    this.expectedCounts = { passed, total }
    withReport(this, step, cucumberReportOf(total, passed))
  },
)

Given('a malformed test report for step {string}', function (this: ReportWorld, step: string): void {
  withReport(this, step, '{not json')
})

Given('a vitest report for step {string} larger than 1 MiB', function (this: ReportWorld, step: string): void {
  withReport(this, step, `${vitestReportOf(5, 5)}${' '.repeat(MAX_TEXT_LENGTH)}`)
})

Then(
  'step {string} carries a verified fact from source {string}',
  function (this: ReportWorld, id: string, source: string): void {
    const facts = verifiedFactsOf(stepNamed(this, id))
    assert.equal(facts.length, 1)
    assert.equal(facts[0]?.source, source)
  },
)

Then('that verified fact reports the passed and total counts', function (this: ReportWorld): void {
  assert.ok(this.expectedCounts !== undefined)
  const [fact] = this.snapshot.steps.flatMap(verifiedFactsOf)
  assert.equal(fact?.label, `${this.expectedCounts.passed} of ${this.expectedCounts.total} passed`)
})

Then(
  'the verified fact of step {string} is labeled {string}',
  function (this: ReportWorld, id: string, label: string): void {
    assert.deepEqual(verifiedFactsOf(stepNamed(this, id)).map((fact) => fact.label), [label])
  },
)

Then(
  'the snapshot reports test report {int} as not a step of plan.json',
  function (this: ReportWorld, position: number): void {
    assert.deepEqual(this.snapshot.errors, [
      { file: 'test-report', location: position, field: 'step', message: 'is not a step of plan.json' },
    ])
  },
)

Then('no step carries a verified fact', function (this: ReportWorld): void {
  assert.deepEqual(this.snapshot.steps.flatMap(verifiedFactsOf), [])
})

Then('the snapshot carries an error for the malformed report', function (this: ReportWorld): void {
  assert.deepEqual(this.snapshot.errors, [
    { file: 'test-report', location: reportIndexOf(this, 's1'), field: null, message: 'is not valid JSON' },
  ])
})

Then(
  'step {string} keeps its declared fact and carries no verified fact',
  function (this: ReportWorld, id: string): void {
    const step = stepNamed(this, id)
    assert.deepEqual(step.facts, [{ origin: 'declared', source: 'decisions.jsonl', label: 'declared' }])
    assert.deepEqual(verifiedFactsOf(step), [])
  },
)

Then('step {string} keeps its verified fact', function (this: ReportWorld, id: string): void {
  assert.deepEqual(verifiedFactsOf(stepNamed(this, id)).map((fact) => fact.label), ['5 of 5 passed'])
})

Then('the snapshot carries a size error for the report', function (this: ReportWorld): void {
  assert.deepEqual(this.snapshot.errors, [
    { file: 'test-report', location: 1, field: null, message: `exceeds ${MAX_TEXT_LENGTH} characters` },
  ])
})

Then('step {string} carries no verified fact', function (this: ReportWorld, id: string): void {
  assert.deepEqual(verifiedFactsOf(stepNamed(this, id)), [])
})
