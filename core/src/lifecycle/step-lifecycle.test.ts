import { describe, expect, it } from 'vitest'
import { validatePlan } from '../contracts/index'
import type { StepLifecycleResult } from './index'
import { addStep, createPlan, finishStep, startStep } from './index'
import { ROLE_IDS } from './roles'

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

describe('createPlan', () => {
  const seeded = (issue: string, title: string): string =>
    `${JSON.stringify({ issue, title, steps: [] }, null, 2)}\n`

  it('creates an empty plan whose issue is the number prefixed with a hash', () => {
    const result = createPlan('78', 'Seed plan.json on real runs')

    expect(result).toEqual({ accepted: true, plan: seeded('#78', 'Seed plan.json on real runs') })
    if (!result.accepted) throw new Error('expected an acceptance')
    expect(validatePlan(result.plan)).toEqual({ accepted: true })
  })

  it.each(['1', '9', '10', '1234567890'])('accepts the issue number %s', (issue) => {
    expect(createPlan(issue, 'T')).toEqual({ accepted: true, plan: seeded(`#${issue}`, 'T') })
  })

  it.each(['', '0', '01', '-1', '7a', 'a7', ' 78', '78 ', '78\n', '#78', '1.5', '12345678901', '٣'])(
    'refuses the issue %j',
    (issue) => {
      expect(createPlan(issue, 'T')).toEqual(
        refusal(null, 'issue', 'must be a number of 1 to 10 digits without leading zero'),
      )
    },
  )

  it('refuses an issue that is not text', () => {
    expect(createPlan(78 as unknown as string, 'T')).toEqual(
      refusal(null, 'issue', 'must be a number of 1 to 10 digits without leading zero'),
    )
  })

  it.each(['', ' ', '  \t\n '])('refuses the blank title %j', (title) => {
    expect(createPlan('78', title)).toEqual(refusal(null, 'title', 'must not be blank'))
  })

  it('refuses a title that is not text', () => {
    expect(createPlan('78', 7 as unknown as string)).toEqual(
      refusal(null, 'title', 'must not be blank'),
    )
  })

  it('keeps the title exactly as given, spaces included', () => {
    expect(createPlan('78', '  Seed  ')).toEqual({ accepted: true, plan: seeded('#78', '  Seed  ') })
  })
})

describe('addStep', () => {
  const fresh = (id: string, overlays: Record<string, unknown> = {}) => ({
    id,
    title: 'Implementation',
    role: 'dev-a',
    status: 'todo',
    origin: 'planned',
    startedAt: null,
    endedAt: null,
    ...overlays,
  })

  it('appends a todo step with the role and the title parsed from the item title', () => {
    expectAccepted(addStep(planText(), '1', 'dev-a: Implementation'), fresh('1'))
  })

  it('appends after the steps already in the plan and leaves them alone', () => {
    expectAccepted(addStep(planText(todo), 's2', 'qa: Check'), todo, fresh('s2', { title: 'Check', role: 'qa' }))
  })

  it.each(ROLE_IDS)('reads %s as a role when the item title starts with it', (role) => {
    expectAccepted(addStep(planText(), '1', `${role}: Work`), fresh('1', { role, title: 'Work' }))
  })

  it.each([
    ['no prefix', 'Implementation'],
    ['a prefix that is not a role', 'frontend: Implementation'],
    ['an upper-case role', 'DEV-A: Implementation'],
    ['no space after the colon', 'dev-a:Implementation'],
    ['a role in the middle', 'see dev-a: Implementation'],
    ['a role that is only the start of a longer word', 'dev-ab: Implementation'],
    ['nothing after the prefix', 'dev-a: '],
    ['a second line', 'dev-a: Implementation\nmore'],
    ['a first line break', 'dev-a: \nImplementation'],
  ])('keeps the whole item title and an empty role for %s', (_name, itemTitle) => {
    expectAccepted(addStep(planText(), '1', itemTitle), fresh('1', { role: '', title: itemTitle }))
  })

  it('keeps everything after the first role prefix as the title', () => {
    expectAccepted(addStep(planText(), '1', 'pm: Plan: phase 1'), fresh('1', { role: 'pm', title: 'Plan: phase 1' }))
  })

  it('plans a step while every step of the plan is still todo', () => {
    expectAccepted(addStep(planText(todo, other), 's3', 'qa: Check'), todo, other, fresh('s3', { title: 'Check', role: 'qa' }))
  })

  it.each([
    ['in progress', { status: 'in_progress', startedAt: at }],
    ['done', { status: 'done', startedAt: at, endedAt: at }],
  ])('proposes a step once a step of the plan is %s', (_name, overlay) => {
    const started = { ...todo, ...overlay }
    expectAccepted(
      addStep(planText(started, other), 's3', 'qa: Check'),
      started,
      other,
      fresh('s3', { title: 'Check', role: 'qa', origin: 'proposed' }),
    )
  })

  it('accepts a step id the plan already holds and returns the plan text untouched', () => {
    const compact = planText(todo)
    expect(addStep(compact, 's1', 'qa: Another title')).toEqual({ accepted: true, plan: compact })
  })

  it('accepts a known step id even when the plan is in progress', () => {
    const started = { ...todo, status: 'in_progress', startedAt: at }
    const text = planText(started)
    expect(addStep(text, 's1', 'dev-a: Implementation')).toEqual({ accepted: true, plan: text })
  })

  it.each(['{', 'not json'])('returns the validation errors of an invalid plan (%j)', (text) => {
    expect(addStep(text, '1', 'dev-a: Implementation')).toEqual(refusal(null, null, 'is not valid JSON'))
  })

  it.each([null, undefined, {}])('refuses a plan that is not text (%j)', (plan) => {
    expect(addStep(plan as unknown as string, '1', 'dev-a: Implementation')).toEqual(
      refusal(null, null, 'must be a string'),
    )
  })

  it.each([7, null, undefined, {}])('refuses a step id that is not text (%j)', (stepId) => {
    expect(addStep(planText(), stepId as unknown as string, 'dev-a: Implementation')).toEqual(
      refusal(null, 'id', 'must be text'),
    )
  })

  it.each([7, null, undefined, {}])('refuses an item title that is not text (%j)', (itemTitle) => {
    expect(addStep(planText(), '1', itemTitle as unknown as string)).toEqual(
      refusal('1', 'title', 'must be text'),
    )
  })

  it('refuses an empty step id through the contract', () => {
    const result = addStep(planText(), '', 'dev-a: Implementation')
    expect(result.accepted).toBe(false)
  })

  it('refuses a result that exceeds the size ceiling', () => {
    const big = { ...todo, title: 'x'.repeat(1_048_576 - planText(todo).length - 100) }
    expect(addStep(planText(big), 's2', 'y'.repeat(200))).toEqual(
      refusal(null, null, 'exceeds 1048576 characters'),
    )
  })
})
