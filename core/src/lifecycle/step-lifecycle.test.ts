import { describe, expect, it } from 'vitest'
import { validatePlan } from '../contracts/index'
import type { StepLifecycleResult } from './index'
import { finishStep, startStep } from './index'

const todo = {
  id: 's1',
  title: 'Implementation',
  role: 'dev-a',
  status: 'todo',
  origin: 'planned',
  startedAt: null,
  endedAt: null,
}

const other = { ...todo, id: 's2' }

const planOf = (...steps: Record<string, unknown>[]) => ({
  issue: '#33',
  title: 'Step lifecycle',
  steps,
})

const planText = (...steps: Record<string, unknown>[]): string => JSON.stringify(planOf(...steps))

const emitted = (...steps: Record<string, unknown>[]): string =>
  `${JSON.stringify(planOf(...steps), null, 2)}\n`

const refusal = (location: string | null, field: string | null, message: string) => ({
  accepted: false,
  errors: [{ file: 'plan.json', location, field, message }],
})

const expectAccepted = (result: StepLifecycleResult, ...steps: Record<string, unknown>[]): void => {
  expect(result).toEqual({ accepted: true, plan: emitted(...steps) })
  if (!result.accepted) throw new Error('expected an acceptance')
  expect(validatePlan(result.plan)).toEqual({ accepted: true })
}

const at = '2026-01-01T10:00:00.000Z'
const notInstant = 'must be an ISO-8601 UTC instant'
const earlierThanStart = 'must not be earlier than startedAt'

describe('startStep', () => {
  it('puts a todo step in progress at the given instant and leaves the others alone', () => {
    expectAccepted(
      startStep(planText(todo, other), 's1', at),
      { ...todo, status: 'in_progress', startedAt: at },
      other,
    )
  })

  it.each(['2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00Z'])(
    'accepts the instant %s and stores it verbatim',
    (instant) => {
      expectAccepted(startStep(planText(todo), 's1', instant), {
        ...todo,
        status: 'in_progress',
        startedAt: instant,
      })
    },
  )

  it.each([
    ['s9', 's9'],
    ['a b', null],
  ])('refuses the unknown step %j and names it when it can be shown', (stepId, location) => {
    expect(startStep(planText(todo), stepId, at)).toEqual(
      refusal(location, 'id', 'is not a step of this plan'),
    )
  })

  it.each([
    '',
    'now',
    '2026-01-01',
    '2026-01-01T10:00:00+01:00',
    '2026-01-01T10:00:00.5Z',
    '2026-01-01T10:00:00.0000Z',
    '2026-02-30T10:00:00.000Z',
  ])('refuses the instant %j', (instant) => {
    expect(startStep(planText(todo), 's1', instant)).toEqual(
      refusal('s1', 'startedAt', notInstant),
    )
  })

  it('locates a refusal on a step with an unsafe id by position', () => {
    expect(startStep(planText(todo, { ...todo, id: 'a b' }), 'a b', 'now')).toEqual(
      refusal('steps[1]', 'startedAt', notInstant),
    )
  })

  it.each(['in_progress', 'done'])('refuses to start a step that is %s', (status) => {
    const step = { ...todo, status, startedAt: at, endedAt: status === 'done' ? at : null }
    expect(startStep(planText(step), 's1', '2026-01-01T11:00:00.000Z')).toEqual(
      refusal('s1', 'status', 'must be todo to start'),
    )
  })

  it('refuses to start a todo step that already has an end time', () => {
    const stale = { ...todo, endedAt: '2026-01-01T09:00:00.000Z' }
    const result = startStep(planText(stale), 's1', at)
    expect(result).toEqual(refusal('s1', 'endedAt', 'must be null to start'))
    expect(Object.hasOwn(result, 'plan')).toBe(false)
  })

  it.each(['{', 'not json'])('returns the validation errors of an invalid plan (%j)', (text) => {
    expect(startStep(text, 's1', at)).toEqual(refusal(null, null, 'is not valid JSON'))
  })

  const running = { ...other, status: 'in_progress', startedAt: at }
  const finished = { ...other, id: 's3', status: 'done', startedAt: at, endedAt: at }
  const later = '2026-01-01T10:30:00.000Z'

  it('closes the step in progress at the new start instant', () => {
    expectAccepted(
      startStep(planText(running, todo, finished), 's1', later),
      { ...running, status: 'done', endedAt: later },
      { ...todo, status: 'in_progress', startedAt: later },
      finished,
    )
  })

  it('closes every step in progress so that exactly one remains', () => {
    const second = { ...running, id: 's4', startedAt: '2026-01-01T10:10:00.000Z' }
    expectAccepted(
      startStep(planText(running, todo, second), 's1', later),
      { ...running, status: 'done', endedAt: later },
      { ...todo, status: 'in_progress', startedAt: later },
      { ...second, status: 'done', endedAt: later },
    )
  })

  it('allows a start instant equal to the open step start', () => {
    expectAccepted(
      startStep(planText(running, todo), 's1', at),
      { ...running, status: 'done', endedAt: at },
      { ...todo, status: 'in_progress', startedAt: at },
    )
  })

  it('refuses to close an open step at an instant earlier than its start and names it', () => {
    expect(startStep(planText(todo, running), 's1', '2026-01-01T09:59:59.999Z')).toEqual(
      refusal('s2', 'endedAt', earlierThanStart),
    )
  })

  it('refuses to close an open step that has no start instant and names it', () => {
    expect(startStep(planText(todo, { ...running, startedAt: null }), 's1', later)).toEqual(
      refusal('s2', 'startedAt', notInstant),
    )
  })

  it('reports every open step that cannot be closed, in document order, by position when unsafe', () => {
    const unsafe = { ...running, id: 'a b' }
    const second = { ...running, id: 's4' }
    expect(startStep(planText(unsafe, todo, second), 's1', '2026-01-01T09:00:00.000Z')).toEqual({
      accepted: false,
      errors: [
        { file: 'plan.json', location: 'steps[0]', field: 'endedAt', message: earlierThanStart },
        { file: 'plan.json', location: 's4', field: 'endedAt', message: earlierThanStart },
      ],
    })
  })

  const tooLateToClose = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      ...running,
      id: `r${index}`,
      startedAt: '2026-01-01T12:00:00.000Z',
    }))

  const tooMany = {
    file: 'plan.json',
    location: null,
    field: null,
    message: 'too many errors, only the first 100 are shown',
  }

  it('lists all 100 closing errors without a marker', () => {
    const result = startStep(planText(todo, ...tooLateToClose(100)), 's1', at)
    if (result.accepted) throw new Error('expected a refusal')
    expect(result.errors).toHaveLength(100)
    expect(result.errors).not.toContainEqual(tooMany)
  })

  it('keeps the first 100 closing errors of 150 and appends one marker', () => {
    const result = startStep(planText(todo, ...tooLateToClose(150)), 's1', at)
    if (result.accepted) throw new Error('expected a refusal')
    expect(result.errors).toHaveLength(101)
    expect(result.errors[0]?.location).toBe('r0')
    expect(result.errors[99]?.location).toBe('r99')
    expect(result.errors[100]).toEqual(tooMany)
  })

  it.each([null, undefined, {}])('refuses a plan that is not text (%j)', (plan) => {
    expect(startStep(plan as unknown as string, 's1', at)).toEqual(
      refusal(null, null, 'must be a string'),
    )
  })

  it.each([7, null, undefined, {}, Symbol('at')])('refuses an instant that is not text', (instant) => {
    expect(startStep(planText(todo), 's1', instant as unknown as string)).toEqual(
      refusal('s1', 'startedAt', notInstant),
    )
  })

  it('refuses a result that exceeds the size ceiling', () => {
    const compactLength = 1_048_576 - 10
    const base = planText(todo).length
    const big = { ...todo, title: 'x'.repeat(compactLength - base + todo.title.length) }
    expect(planText(big)).toHaveLength(compactLength)
    expect(startStep(planText(big), 's1', at)).toEqual(
      refusal(null, null, 'exceeds 1048576 characters'),
    )
  })
})

const open = { ...todo, status: 'in_progress', startedAt: at }
const end = '2026-01-01T11:00:00.000Z'

describe('finishStep', () => {
  it('marks an in-progress step done at the given instant and leaves the others alone', () => {
    expectAccepted(
      finishStep(planText(open, other), 's1', end),
      { ...open, status: 'done', endedAt: end },
      other,
    )
  })

  it('leaves another in-progress step and a done step byte-identical', () => {
    const running = { ...other, status: 'in_progress', startedAt: '2026-01-01T10:05:00.000Z' }
    const done = { ...other, id: 's3', status: 'done', startedAt: at, endedAt: at }
    expectAccepted(
      finishStep(planText(open, running, done), 's1', end),
      { ...open, status: 'done', endedAt: end },
      running,
      done,
    )
  })

  it.each([
    [at, at],
    ['2026-01-01T10:00:00Z', '2026-01-01T10:00:00.000Z'],
    ['2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00Z'],
    ['2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.001Z'],
  ])('accepts finishing a step started at %s at %s', (startedAt, endedAt) => {
    expectAccepted(finishStep(planText({ ...open, startedAt }), 's1', endedAt), {
      ...open,
      startedAt,
      status: 'done',
      endedAt,
    })
  })

  it.each(['2026-01-01T09:59:59.000Z', '2026-01-01T09:59:59.999Z', '2025-12-31T10:00:00Z'])(
    'refuses finishing at %s, earlier than the start',
    (instant) => {
      expect(finishStep(planText(open), 's1', instant)).toEqual(
        refusal('s1', 'endedAt', earlierThanStart),
      )
    },
  )

  it.each(['todo', 'done'])('refuses to finish a step that is %s', (status) => {
    const step = { ...todo, status, startedAt: at, endedAt: status === 'done' ? at : null }
    expect(finishStep(planText(step), 's1', end)).toEqual(
      refusal('s1', 'status', 'must be in_progress to finish'),
    )
  })

  it('refuses an unknown step and names it', () => {
    expect(finishStep(planText(open), 's9', end)).toEqual(
      refusal('s9', 'id', 'is not a step of this plan'),
    )
  })

  it.each(['', 'now', '2026-01-01T11:00:00.5Z'])('refuses the instant %j', (instant) => {
    expect(finishStep(planText(open), 's1', instant)).toEqual(
      refusal('s1', 'endedAt', notInstant),
    )
  })

  it('reports the instant before the status when both are wrong', () => {
    expect(finishStep(planText(todo), 's1', 'now')).toEqual(refusal('s1', 'endedAt', notInstant))
  })

  it.each([null, 'garbage', '2026-01-01T10:00:00.5Z'])(
    'refuses to finish a step whose startedAt is %j',
    (startedAt) => {
      expect(finishStep(planText({ ...open, startedAt }), 's1', end)).toEqual(
        refusal('s1', 'startedAt', notInstant),
      )
    },
  )

  it('refuses a plan that is not text', () => {
    expect(finishStep(null as unknown as string, 's1', end)).toEqual(
      refusal(null, null, 'must be a string'),
    )
  })

  it('refuses an instant that is not text', () => {
    expect(finishStep(planText(open), 's1', Symbol('at') as unknown as string)).toEqual(
      refusal('s1', 'endedAt', notInstant),
    )
  })

  it('returns the validation errors of an invalid plan', () => {
    expect(finishStep('{', 's1', end)).toEqual(refusal(null, null, 'is not valid JSON'))
  })
})
