import assert from 'node:assert/strict'
import { Given, Then } from '@cucumber/cucumber'
import type { MutationReport, Snapshot, SnapshotFact, SnapshotStep, TestReport } from '@agent-flow/core/snapshot'

type ToolRunWorld = {
  testReports?: readonly TestReport[]
  mutationReports?: readonly MutationReport[]
  unattachedEntries?: readonly string[]
  snapshot: Snapshot
}

type ReportKind = 'test' | 'mutation'

const MAX_TEXT_LENGTH = 1_048_576

const validReportTexts: Readonly<Record<ReportKind, string>> = {
  test: JSON.stringify({ numTotalTests: 5, numPassedTests: 5, numFailedTestSuites: 0 }),
  mutation: JSON.stringify({
    schemaVersion: '1.0',
    files: { 'src/sample.ts': { language: 'typescript', mutants: [{ status: 'Killed' }, { status: 'Survived' }] } },
  }),
}

const reportKindOf = (kind: string): ReportKind => {
  assert.ok(kind === 'test' || kind === 'mutation', `unknown report kind ${kind}`)
  return kind
}

const withReport = (world: ToolRunWorld, kind: ReportKind, step: string, text: string): void => {
  if (kind === 'test') world.testReports = [...(world.testReports ?? []), { step, text }]
  else world.mutationReports = [...(world.mutationReports ?? []), { step, text }]
}

const unattachedEntryOf = (counts: Readonly<Record<string, unknown>>): string =>
  JSON.stringify({
    at: '2026-11-23T10:00:00.000Z',
    step: null,
    attachment: 'unattached',
    role: null,
    roleFrom: null,
    ...counts,
  })

const withEntry = (world: ToolRunWorld, entry: string): void => {
  world.unattachedEntries = [...(world.unattachedEntries ?? []), entry]
}

const stepNamed = (world: ToolRunWorld, id: string): SnapshotStep => {
  const found = world.snapshot.steps.find((candidate) => candidate.id === id)
  assert.ok(found !== undefined)
  return found
}

const vitestFact = (label: string): SnapshotFact => ({ origin: 'verified', source: 'vitest', label })

Given(
  'a {word} report for step {string} that is not valid JSON',
  function (this: ToolRunWorld, kind: string, step: string): void {
    withReport(this, reportKindOf(kind), step, '{not json')
  },
)

Given(
  'a {word} report for step {string} over the 1 MiB bound',
  function (this: ToolRunWorld, kind: string, step: string): void {
    const known = reportKindOf(kind)
    withReport(this, known, step, `${validReportTexts[known]}${' '.repeat(MAX_TEXT_LENGTH)}`)
  },
)

Given(
  'an unattached vitest run with {int} tests of which {int} passed',
  function (this: ToolRunWorld, total: number, passed: number): void {
    withEntry(this, unattachedEntryOf({ tool: 'vitest', passed, total, failedSuites: 0 }))
  },
)

Given(
  'an unattached Stryker run with {int} detected and {int} surviving mutants',
  function (this: ToolRunWorld, detected: number, surviving: number): void {
    withEntry(this, unattachedEntryOf({ tool: 'stryker', detected, surviving }))
  },
)

Given('{int} numbered unattached vitest runs', function (this: ToolRunWorld, runs: number): void {
  for (let run = 1; run <= runs; run += 1) {
    withEntry(this, unattachedEntryOf({ tool: 'vitest', passed: run, total: run, failedSuites: 0 }))
  }
})

Then('step {string} shows it ran a tool', function (this: ToolRunWorld, id: string): void {
  assert.strictEqual(stepNamed(this, id).ranTool, true)
})

Then('step {string} shows it ran no tool', function (this: ToolRunWorld, id: string): void {
  assert.strictEqual(stepNamed(this, id).ranTool, false)
})

Then('the snapshot carries one {word} report error', function (this: ToolRunWorld, kind: string): void {
  assert.deepEqual(
    this.snapshot.errors.map(({ file }) => file),
    [`${reportKindOf(kind)}-report`],
  )
})

Then(
  'the snapshot lists the unattached facts {string} from {string} then {string} from {string}',
  function (this: ToolRunWorld, firstLabel: string, firstSource: string, secondLabel: string, secondSource: string): void {
    assert.deepEqual(this.snapshot.unattachedFacts, [
      { origin: 'verified', source: firstSource, label: firstLabel },
      { origin: 'verified', source: secondSource, label: secondLabel },
    ])
  },
)

Then(
  'the snapshot lists the unattached facts of runs {int} to {int}, in input order',
  function (this: ToolRunWorld, first: number, last: number): void {
    const runs = Array.from({ length: last - first + 1 }, (_, index) => first + index)
    assert.deepEqual(
      this.snapshot.unattachedFacts,
      runs.map((run) => vitestFact(`${run} of ${run} passed`)),
    )
  },
)

Then('the snapshot lists no unattached fact', function (this: ToolRunWorld): void {
  assert.deepEqual(this.snapshot.unattachedFacts, [])
})

Then('the snapshot counts {int} omitted unattached facts', function (this: ToolRunWorld, omitted: number): void {
  assert.strictEqual(this.snapshot.omittedUnattachedFacts, omitted)
})
