import assert from 'node:assert/strict'
import { Given, Then, When } from '@cucumber/cucumber'
import { finishStep, startStep } from '@agent-flow/core/lifecycle'
import type { StepLifecycleResult } from '@agent-flow/core/lifecycle'

type Step = {
  id: string
  title: string
  role: string
  status: string
  origin: string
  startedAt: string | null
  endedAt: string | null
}

type LifecycleWorld = {
  plan: string
  result: StepLifecycleResult
}

const stepOf = (id: string, overlays: Partial<Step>): Step => ({
  id,
  title: 'Implementation',
  role: 'dev-a',
  status: 'todo',
  origin: 'planned',
  startedAt: null,
  endedAt: null,
  ...overlays,
})

const planWith = (steps: readonly Step[]): string =>
  JSON.stringify({ issue: '#33', title: 'Step lifecycle', steps })

const stepsOf = (planText: string): Step[] => JSON.parse(planText).steps

const addStep = (world: LifecycleWorld, step: Step): void => {
  world.plan = planWith([...stepsOf(world.plan), step])
}

const resultingStep = (world: LifecycleWorld, id: string): Step => {
  assert.ok(world.result.accepted, 'expected the lifecycle change to be accepted')
  const step = stepsOf(world.result.plan).find((candidate) => candidate.id === id)
  assert.ok(step !== undefined, `step ${id} is missing from the resulting plan`)
  return step
}

Given(
  'a lifecycle plan where step {string} is todo',
  function (this: LifecycleWorld, id: string): void {
    this.plan = planWith([stepOf(id, {})])
  },
)

Given(
  'a lifecycle plan where step {string} is todo with endedAt {string}',
  function (this: LifecycleWorld, id: string, endedAt: string): void {
    this.plan = planWith([stepOf(id, { endedAt })])
  },
)

Given(
  'a lifecycle plan where step {string} is in progress since {string}',
  function (this: LifecycleWorld, id: string, startedAt: string): void {
    this.plan = planWith([stepOf(id, { status: 'in_progress', startedAt })])
  },
)

Given(
  'a lifecycle plan where step {string} is done',
  function (this: LifecycleWorld, id: string): void {
    const startedAt = '2026-01-01T09:00:00.000Z'
    const endedAt = '2026-01-01T09:30:00.000Z'
    this.plan = planWith([stepOf(id, { status: 'done', startedAt, endedAt })])
  },
)

Given('step {string} is todo', function (this: LifecycleWorld, id: string): void {
  addStep(this, stepOf(id, {}))
})

When(
  'step {string} is started at {string}',
  function (this: LifecycleWorld, id: string, at: string): void {
    this.result = startStep(this.plan, id, at)
  },
)

When(
  'step {string} is finished at {string}',
  function (this: LifecycleWorld, id: string, at: string): void {
    this.result = finishStep(this.plan, id, at)
  },
)

Then('step {string} is in progress', function (this: LifecycleWorld, id: string): void {
  assert.equal(resultingStep(this, id).status, 'in_progress')
})

Then('step {string} is done', function (this: LifecycleWorld, id: string): void {
  assert.equal(resultingStep(this, id).status, 'done')
})

Then(
  'step {string} has startedAt {string}',
  function (this: LifecycleWorld, id: string, startedAt: string): void {
    assert.equal(resultingStep(this, id).startedAt, startedAt)
  },
)

Then(
  'step {string} has endedAt {string}',
  function (this: LifecycleWorld, id: string, endedAt: string): void {
    assert.equal(resultingStep(this, id).endedAt, endedAt)
  },
)

Then('exactly {int} step is in progress', function (this: LifecycleWorld, count: number): void {
  assert.ok(this.result.accepted, 'expected the lifecycle change to be accepted')
  const inProgress = stepsOf(this.result.plan).filter((step) => step.status === 'in_progress')
  assert.equal(inProgress.length, count)
})

Then('the lifecycle change is refused', function (this: LifecycleWorld): void {
  assert.equal(this.result.accepted, false)
})

Then(
  'the lifecycle change is refused with an error naming step {string}',
  function (this: LifecycleWorld, id: string): void {
    assert.ok(!this.result.accepted, 'expected the lifecycle change to be refused')
    assert.ok(this.result.errors.some((error) => error.location === id))
  },
)

Then('the lifecycle plan is unchanged', function (this: LifecycleWorld): void {
  assert.equal(Object.hasOwn(this.result, 'plan'), false)
})
