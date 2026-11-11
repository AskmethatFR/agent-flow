import assert from 'node:assert/strict'
import { Given, Then } from '@cucumber/cucumber'
import type { MutationReport, Snapshot, SnapshotFact, SnapshotStep } from '@agent-flow/core/snapshot'

type MutationWorld = {
  mutationReports?: readonly MutationReport[]
  snapshot: Snapshot
}

type MutantCounts = Readonly<Partial<Record<string, number>>>

const MAX_TEXT_LENGTH = 1_048_576

const mutantsOf = (counts: MutantCounts): Record<string, unknown>[] =>
  Object.entries(counts).flatMap(([status, count]) => Array.from({ length: count ?? 0 }, () => ({ status })))

const strykerReportOf = (counts: MutantCounts, thresholds?: { readonly high: number; readonly low: number }): string =>
  JSON.stringify({
    schemaVersion: '1.0',
    ...(thresholds === undefined ? {} : { thresholds }),
    files: { 'src/sample.ts': { language: 'typescript', source: 'export const sample = 1', mutants: mutantsOf(counts) } },
  })

const withReport = (world: MutationWorld, step: string, text: string): void => {
  world.mutationReports = [...(world.mutationReports ?? []), { step, text }]
}

const stepNamed = (world: MutationWorld, id: string): SnapshotStep => {
  const found = world.snapshot.steps.find((candidate) => candidate.id === id)
  assert.ok(found !== undefined)
  return found
}

const mutationFactsOf = (step: SnapshotStep): readonly SnapshotFact[] =>
  step.facts.filter(({ source }) => source === 'stryker')

const reportIndexOf = (world: MutationWorld, step: string): number => {
  const index = (world.mutationReports ?? []).findIndex((report) => report.step === step)
  assert.notEqual(index, -1)
  return index + 1
}

const onlyMutationFact = (world: MutationWorld): SnapshotFact => {
  const facts = world.snapshot.steps.flatMap(mutationFactsOf)
  assert.equal(facts.length, 1)
  const [fact] = facts
  assert.ok(fact !== undefined)
  return fact
}

Given(
  'a Stryker mutation report for step {string} with {int} killed and {int} survived mutants',
  function (this: MutationWorld, step: string, killed: number, survived: number): void {
    withReport(this, step, strykerReportOf({ Killed: killed, Survived: survived }))
  },
)

Given(
  'a Stryker mutation report for step {string} with {int} killed, {int} timed out, {int} survived, {int} not covered and {int} ignored mutants',
  function (
    this: MutationWorld,
    step: string,
    killed: number,
    timedOut: number,
    survived: number,
    notCovered: number,
    ignored: number,
  ): void {
    withReport(
      this,
      step,
      strykerReportOf({ Killed: killed, Timeout: timedOut, Survived: survived, NoCoverage: notCovered, Ignored: ignored }),
    )
  },
)

Given(
  'a Stryker mutation report for step {string} with {int} killed and {int} survived mutants and the thresholds high {int} and low {int}',
  function (this: MutationWorld, step: string, killed: number, survived: number, high: number, low: number): void {
    withReport(this, step, strykerReportOf({ Killed: killed, Survived: survived }, { high, low }))
  },
)

Given(
  'a Stryker mutation report, the first and only mutation report, for step {string} with {int} killed and {int} survived mutants',
  function (this: MutationWorld, step: string, killed: number, survived: number): void {
    assert.equal(this.mutationReports, undefined)
    withReport(this, step, strykerReportOf({ Killed: killed, Survived: survived }))
  },
)

Given('a malformed mutation report for step {string}', function (this: MutationWorld, step: string): void {
  withReport(this, step, '{not json')
})

Given(
  'a Stryker mutation report for step {string} larger than 1 MiB',
  function (this: MutationWorld, step: string): void {
    withReport(this, step, `${strykerReportOf({ Killed: 4, Survived: 1 })}${' '.repeat(MAX_TEXT_LENGTH)}`)
  },
)

Given(
  'a Stryker mutation report for step {string} with only {int} ignored mutants',
  function (this: MutationWorld, step: string, ignored: number): void {
    withReport(this, step, strykerReportOf({ Ignored: ignored }))
  },
)

Then(
  'step {string} carries one mutation fact from source {string}',
  function (this: MutationWorld, id: string, source: string): void {
    const facts = mutationFactsOf(stepNamed(this, id))
    assert.equal(facts.length, 1)
    assert.equal(facts[0]?.source, source)
  },
)

Then('that mutation fact has the origin {string}', function (this: MutationWorld, origin: string): void {
  assert.equal(onlyMutationFact(this).origin, origin)
})

Then(
  'the mutation fact of step {string} is labeled {string}',
  function (this: MutationWorld, id: string, label: string): void {
    assert.deepEqual(mutationFactsOf(stepNamed(this, id)).map((fact) => fact.label), [label])
  },
)

Then('that mutation fact never reads {string}', function (this: MutationWorld, forbidden: string): void {
  assert.ok(!onlyMutationFact(this).label.includes(forbidden))
})

Then('that mutation fact carries neither a pass nor a fail word', function (this: MutationWorld): void {
  assert.doesNotMatch(onlyMutationFact(this).label, /pass|fail/i)
})

Then(
  'the snapshot reports mutation report {int} as not a step of plan.json',
  function (this: MutationWorld, position: number): void {
    assert.deepEqual(this.snapshot.errors, [
      { file: 'mutation-report', location: position, field: 'step', message: 'is not a step of plan.json' },
    ])
  },
)

Then('the snapshot errors never echo the step {string}', function (this: MutationWorld, id: string): void {
  assert.ok(!JSON.stringify(this.snapshot.errors).includes(id))
})

Then('no step carries a mutation fact', function (this: MutationWorld): void {
  assert.deepEqual(this.snapshot.steps.flatMap(mutationFactsOf), [])
})

Then('the snapshot carries an error for the malformed mutation report', function (this: MutationWorld): void {
  assert.deepEqual(this.snapshot.errors, [
    { file: 'mutation-report', location: reportIndexOf(this, 's1'), field: null, message: 'is not valid JSON' },
  ])
})

Then(
  'step {string} keeps its declared fact and carries no mutation fact',
  function (this: MutationWorld, id: string): void {
    assert.deepEqual(stepNamed(this, id).facts, [{ origin: 'declared', source: 'decisions.jsonl', label: 'declared' }])
  },
)

Then('step {string} keeps its mutation fact', function (this: MutationWorld, id: string): void {
  assert.deepEqual(mutationFactsOf(stepNamed(this, id)).map((fact) => fact.label), [
    '75.00% mutation score, 1 surviving',
  ])
})

Then('the snapshot carries a size error for the mutation report', function (this: MutationWorld): void {
  assert.deepEqual(this.snapshot.errors, [
    { file: 'mutation-report', location: 1, field: null, message: `exceeds ${MAX_TEXT_LENGTH} characters` },
  ])
})

Then('step {string} carries no mutation fact', function (this: MutationWorld, id: string): void {
  assert.deepEqual(mutationFactsOf(stepNamed(this, id)), [])
})

Then('the snapshot carries an error for the mutation report with no mutant to score', function (this: MutationWorld): void {
  assert.deepEqual(this.snapshot.errors, [
    { file: 'mutation-report', location: 1, field: null, message: 'has no mutant to score' },
  ])
})
