import assert from 'node:assert/strict'
import { Given, Then, When } from '@cucumber/cucumber'
import { buildSnapshot } from '@agent-flow/core/snapshot'
import type { Snapshot, SnapshotStep } from '@agent-flow/core/snapshot'

type SnapshotWorld = {
  now: Date
  planText: string
  snapshot: Snapshot
}

const instantAt = (clock: string): string => `2026-10-22T${clock}:00Z`

const stepOf = (overlay: Record<string, unknown>): Record<string, unknown> => ({
  id: 's1',
  title: 'Implementation',
  role: 'dev-a',
  status: 'todo',
  origin: 'planned',
  startedAt: null,
  endedAt: null,
  ...overlay,
})

const planOf = (steps: readonly Record<string, unknown>[]): string =>
  JSON.stringify({ issue: '#38', title: 'Core snapshot', steps })

const stepNamed = (world: SnapshotWorld, stepId: string): SnapshotStep => {
  const step = world.snapshot.steps.find((candidate) => candidate.id === stepId)
  assert.ok(step !== undefined)
  return step
}

Given(
  'the time is {word} and the plan has a step {string} in progress that started at {word}',
  function (this: SnapshotWorld, clock: string, stepId: string, startedAt: string): void {
    this.now = new Date(instantAt(clock))
    this.planText = planOf([
      stepOf({ id: stepId, status: 'in_progress', startedAt: instantAt(startedAt) }),
    ])
  },
)

Given(
  'the time is {word} and the plan has a step {string} done that started at {word} and ended at {word}',
  function (
    this: SnapshotWorld,
    clock: string,
    stepId: string,
    startedAt: string,
    endedAt: string,
  ): void {
    this.now = new Date(instantAt(clock))
    this.planText = planOf([
      stepOf({
        id: stepId,
        status: 'done',
        startedAt: instantAt(startedAt),
        endedAt: instantAt(endedAt),
      }),
    ])
  },
)

Given(
  'the time is {word} and the plan has one step done and one step still to do',
  function (this: SnapshotWorld, clock: string): void {
    this.now = new Date(instantAt(clock))
    this.planText = planOf([
      stepOf({
        id: 's1',
        status: 'done',
        startedAt: instantAt('09:00'),
        endedAt: instantAt('10:15'),
      }),
      stepOf({ id: 's2' }),
    ])
  },
)

Given(
  'the time is {word} and the plan has a step {string} still to do',
  function (this: SnapshotWorld, clock: string, stepId: string): void {
    this.now = new Date(instantAt(clock))
    this.planText = planOf([stepOf({ id: stepId })])
  },
)

Given(
  'the time is {word} and the plan has a step {string} with status {string}',
  function (this: SnapshotWorld, clock: string, stepId: string, status: string): void {
    this.now = new Date(instantAt(clock))
    this.planText = planOf([stepOf({ id: stepId, status })])
  },
)

When('core builds the snapshot', function (this: SnapshotWorld): void {
  this.snapshot = buildSnapshot({ plan: this.planText }, this.now)
})

Then(
  'step {string} shows {string} spent and is the current step',
  function (this: SnapshotWorld, stepId: string, label: string): void {
    assert.equal(stepNamed(this, stepId).timeSpent?.label, label)
    assert.equal(this.snapshot.currentStepId, stepId)
  },
)

Then(
  'step {string} shows {string} spent',
  function (this: SnapshotWorld, stepId: string, label: string): void {
    assert.equal(stepNamed(this, stepId).timeSpent?.label, label)
  },
)

Then('the snapshot has no current step', function (this: SnapshotWorld): void {
  assert.equal(this.snapshot.currentStepId, null)
})

Then('step {string} shows no time spent', function (this: SnapshotWorld, stepId: string): void {
  assert.equal(stepNamed(this, stepId).timeSpent, null)
})

Then(
  'the snapshot has no steps and one error naming step {string} and field {string}',
  function (this: SnapshotWorld, stepId: string, field: string): void {
    assert.deepEqual(this.snapshot.steps, [])
    assert.equal(this.snapshot.errors.length, 1)
    const [error] = this.snapshot.errors
    assert.deepEqual(
      { file: error?.file, location: error?.location, field: error?.field },
      { file: 'plan.json', location: stepId, field },
    )
    assert.equal(typeof error?.message, 'string')
  },
)
