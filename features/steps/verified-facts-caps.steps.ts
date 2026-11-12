import assert from 'node:assert/strict'
import { Given, Then } from '@cucumber/cucumber'
import type { MutationReport, Snapshot, SnapshotStep, TestReport } from '@agent-flow/core/snapshot'

type CapsWorld = {
  testReports?: readonly TestReport[]
  mutationReports?: readonly MutationReport[]
  snapshot: Snapshot
}

type ReportKind = 'test' | 'mutation'

const MALFORMED_REPORT = '{not json'
const BOUND_MESSAGE = 'too many reports, only the last 200 are read'

const fileOf = (kind: string): string => {
  assert.ok(kind === 'test' || kind === 'mutation', `unknown report kind "${kind}"`)
  return `${kind}-report`
}

const numberedFactLabel = (number: number): string => `${number} of ${number} passed`

const numberedVitestReportOf = (number: number): string =>
  JSON.stringify({ numTotalTests: number, numPassedTests: number, numFailedTestSuites: 0 })

const STRYKER_REPORT = JSON.stringify({
  schemaVersion: '1.0',
  files: {
    'src/sample.ts': { language: 'typescript', source: 'export const sample = 1', mutants: [{ status: 'Killed' }] },
  },
})

const withReports = (world: CapsWorld, kind: ReportKind, reports: readonly TestReport[]): void => {
  if (kind === 'test') world.testReports = [...(world.testReports ?? []), ...reports]
  else world.mutationReports = [...(world.mutationReports ?? []), ...reports]
}

const stepNamed = (world: CapsWorld, id: string): SnapshotStep => {
  const found = world.snapshot.steps.find((candidate) => candidate.id === id)
  assert.ok(found !== undefined)
  return found
}

const verifiedLabelsOf = (step: SnapshotStep): readonly string[] =>
  step.facts.filter(({ origin }) => origin === 'verified').map(({ label }) => label)

const labelsOfReports = (from: number, to: number): readonly string[] =>
  Array.from({ length: to - from + 1 }, (_, index) => numberedFactLabel(from + index))

const errorsOf = (world: CapsWorld, file: string, message: string) =>
  world.snapshot.errors.filter((error) => error.file === file && error.message === message)

Given(
  '{int} numbered vitest reports for step {string}',
  function (this: CapsWorld, count: number, step: string): void {
    withReports(
      this,
      'test',
      Array.from({ length: count }, (_, index) => ({ step, text: numberedVitestReportOf(index + 1) })),
    )
  },
)

Given(
  'the first of {int} {word} reports for step {string} is malformed and the others are numbered',
  function (this: CapsWorld, total: number, kind: string, step: string): void {
    const validTextOf = (number: number): string =>
      fileOf(kind) === 'test-report' ? numberedVitestReportOf(number) : STRYKER_REPORT
    const reports = Array.from({ length: total }, (_, index) => ({
      step,
      text: index === 0 ? MALFORMED_REPORT : validTextOf(index + 1),
    }))
    withReports(this, kind as ReportKind, reports)
  },
)

Then(
  'step {string} carries the verified facts of reports {int} to {int}, in input order',
  function (this: CapsWorld, id: string, from: number, to: number): void {
    assert.deepEqual(verifiedLabelsOf(stepNamed(this, id)), labelsOfReports(from, to))
  },
)

Then('the verified facts of step {string} come after its declared fact', function (this: CapsWorld, id: string): void {
  const { facts } = stepNamed(this, id)
  assert.equal(facts[0]?.origin, 'declared')
  assert.ok(facts.slice(1).every(({ origin }) => origin === 'verified'))
})

Then('step {string} counts {int} omitted facts', function (this: CapsWorld, id: string, omitted: number): void {
  assert.equal(stepNamed(this, id).omittedFacts, omitted)
})

Then(
  'step {string} carries {int} verified facts, those of the last {int} reports',
  function (this: CapsWorld, id: string, carried: number, last: number): void {
    const labels = verifiedLabelsOf(stepNamed(this, id))
    const reported = (this.testReports ?? []).filter((report) => report.step === id).length
    assert.equal(labels.length, carried)
    assert.deepEqual(labels, labelsOfReports(reported - last + 1, reported))
  },
)

Then(
  'the snapshot carries {int} errors "too many reports, only the last 200 are read" for the {word} reports',
  function (this: CapsWorld, count: number, kind: string): void {
    assert.deepEqual(
      errorsOf(this, fileOf(kind), BOUND_MESSAGE),
      Array.from({ length: count }, () => ({ file: fileOf(kind), location: null, field: null, message: BOUND_MESSAGE })),
    )
  },
)

Then(
  'the snapshot carries {int} errors for a malformed {word} report',
  function (this: CapsWorld, count: number, kind: string): void {
    assert.equal(errorsOf(this, fileOf(kind), 'is not valid JSON').length, count)
  },
)

Then('no bound error echoes a step or a report text', function (this: CapsWorld): void {
  const bound = this.snapshot.errors.filter(({ message }) => message === BOUND_MESSAGE)
  const echoed = JSON.stringify(bound)
  assert.ok(!echoed.includes('s1'))
  assert.ok(!echoed.includes(MALFORMED_REPORT))
})
