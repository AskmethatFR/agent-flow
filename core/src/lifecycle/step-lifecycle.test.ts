import { describe, expect, it } from 'vitest'
import { validatePlan } from '../contracts/index'
import type { StepLifecycleResult } from './index'
import { addStep, createPlan, finishStep, planNamesIssue, startStep } from './index'
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

  it('refuses to start a step that is in progress', () => {
    const step = { ...todo, status: 'in_progress', startedAt: at }
    expect(startStep(planText(step), 's1', '2026-01-01T11:00:00.000Z')).toEqual(
      refusal('s1', 'status', 'must be todo to start'),
    )
  })

  describe('a done step', () => {
    const done = { ...todo, status: 'done', startedAt: at, endedAt: at }
    const reworkAt = '2026-01-01T11:00:00.000Z'
    const reworkOf = (n: number, overlays: Record<string, unknown> = {}) => ({
      ...done,
      id: `s1.rework-${n}`,
      title: `Implementation (rework ${n})`,
      origin: 'proposed',
      ...overlays,
    })
    const reworkRunning = (n: number) =>
      reworkOf(n, { status: 'in_progress', startedAt: reworkAt, endedAt: null })

    it('opens a rework step in progress after the other steps and leaves the others alone', () => {
      expectAccepted(
        startStep(planText(done, other), 's1', reworkAt),
        done,
        other,
        reworkRunning(1),
      )
    })

    it('gives the rework the role of the step it reworks', () => {
      const reviewed = { ...done, role: 'qa', title: 'Check' }
      expectAccepted(
        startStep(planText(reviewed), 's1', reworkAt),
        reviewed,
        { ...reworkRunning(1), role: 'qa', title: 'Check (rework 1)' },
      )
    })

    it.each([
      ['one finished rework', [1], 2],
      ['finished reworks 1 and 3', [1, 3], 4],
      ['finished reworks 3 and 1', [3, 1], 4],
      ['finished reworks 9 and 10', [9, 10], 11],
    ])('numbers the next rework after the highest, given %s', (_name, numbers, next) => {
      const finished = numbers.map((n) => reworkOf(n))
      expectAccepted(
        startStep(planText(done, ...finished), 's1', reworkAt),
        done,
        ...finished,
        reworkRunning(next),
      )
    })

    it.each([
      's2.rework-5',
      's1x.rework-5',
      's1.rework-0',
      's1.rework-05',
      's1.rework-a',
      's1.rework-5x',
      's1.rework-',
      's1.rework-5.rework-1',
      'rework-5',
    ])('ignores the step %j when numbering the rework', (id) => {
      const unrelated = { ...todo, id }
      expectAccepted(
        startStep(planText(done, unrelated), 's1', reworkAt),
        done,
        unrelated,
        reworkRunning(1),
      )
    })

    it.each([[1], [2]])('refuses to restart a step whose rework %i is in progress', (n) => {
      const text = planText(done, ...(n === 2 ? [reworkOf(1)] : []), reworkRunning(n))
      const result = startStep(text, 's1', '2026-01-01T12:00:00.000Z')
      expect(result).toEqual(refusal('s1', 'status', 'is already being reworked'))
      expect(Object.hasOwn(result, 'plan')).toBe(false)
    })

    it('refuses to restart a step whose rework in progress comes first in the plan', () => {
      expect(startStep(planText(reworkRunning(1), done), 's1', '2026-01-01T12:00:00.000Z')).toEqual(
        refusal('s1', 'status', 'is already being reworked'),
      )
    })

    it.each(['s1.rework-0', 's1.rework-a'])(
      'does not count the in-progress step %j as a rework in progress',
      (id) => {
        const running = { ...reworkRunning(0), id }
        expectAccepted(startStep(planText(done, running), 's1', reworkAt), done, running, reworkRunning(1))
      },
    )

    it('does not count the rework in progress of another step', () => {
      const sibling = { ...other, status: 'done', startedAt: at, endedAt: at }
      const siblingRework = { ...sibling, id: 's2.rework-1', status: 'in_progress', endedAt: null }
      expectAccepted(
        startStep(planText(done, sibling, siblingRework), 's1', reworkAt),
        done,
        sibling,
        siblingRework,
        reworkRunning(1),
      )
    })

    it.each([
      ['another role', { role: 'qa' }],
      ['an origin that is not proposed', { origin: 'planned' }],
      ['another title', { title: 'qa: verify' }],
    ])('does not count an in-progress step named like the rework but with %s', (_name, overlay) => {
      const lookalike = { ...reworkRunning(1), ...overlay }
      expectAccepted(
        startStep(planText(done, lookalike), 's1', reworkAt),
        done,
        lookalike,
        reworkRunning(2),
      )
    })

    it.each([
      ['a step id with a ten digit suffix', 's1.rework-1000000000'],
      ['a step id past the safe integer range', 's1.rework-9007199254740993'],
      ['a step id with a 22 digit suffix', 's1.rework-1000000000000000000000'],
    ])('ignores %s when numbering and when looking for a rework in progress', (_name, id) => {
      const huge = { ...reworkRunning(1), id }
      expectAccepted(
        startStep(planText(done, huge), 's1', reworkAt),
        done,
        huge,
        reworkRunning(1),
      )
    })

    it('counts a rework in progress numbered 999999999', () => {
      expect(startStep(planText(done, reworkRunning(999999999)), 's1', reworkAt)).toEqual(
        refusal('s1', 'status', 'is already being reworked'),
      )
    })

    it('opens a rework of a rework with its own times', () => {
      const firstRework = reworkOf(1)
      expectAccepted(
        startStep(planText(done, firstRework), 's1.rework-1', reworkAt),
        done,
        firstRework,
        {
          ...firstRework,
          id: 's1.rework-1.rework-1',
          title: 'Implementation (rework 1) (rework 1)',
          status: 'in_progress',
          startedAt: reworkAt,
          endedAt: null,
        },
      )
    })

    it('refuses an instant that is not an instant before opening the rework', () => {
      expect(startStep(planText(done), 's1', 'now')).toEqual(refusal('s1', 'startedAt', notInstant))
    })
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

  it('leaves the step in progress and the finished step alone and starts the todo step', () => {
    expectAccepted(
      startStep(planText(running, todo, finished), 's1', later),
      running,
      { ...todo, status: 'in_progress', startedAt: later },
      finished,
    )
  })

  it('leaves every step in progress running', () => {
    const second = { ...running, id: 's4', startedAt: '2026-01-01T10:10:00.000Z' }
    expectAccepted(
      startStep(planText(running, todo, second), 's1', later),
      running,
      { ...todo, status: 'in_progress', startedAt: later },
      second,
    )
  })

  it.each([
    ['an instant earlier than its start', running, '2026-01-01T09:59:59.999Z'],
    ['no start instant', { ...running, startedAt: null }, later],
  ])('leaves a step in progress with %s running', (_name, runningStep, instant) => {
    expectAccepted(
      startStep(planText(todo, runningStep), 's1', instant),
      { ...todo, status: 'in_progress', startedAt: instant },
      runningStep,
    )
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

  describe('a done step', () => {
    const done = { ...open, status: 'done', endedAt: '2026-01-01T10:30:00.000Z' }
    const rework = (overlays: Record<string, unknown> = {}) => ({
      ...done,
      id: 's1.rework-1',
      title: 'Implementation (rework 1)',
      origin: 'proposed',
      status: 'in_progress',
      startedAt: '2026-01-01T10:45:00.000Z',
      endedAt: null,
      ...overlays,
    })

    it('finishes its rework in progress and leaves the done step and the others alone', () => {
      expectAccepted(
        finishStep(planText(done, other, rework()), 's1', end),
        done,
        other,
        { ...rework(), status: 'done', endedAt: end },
      )
    })

    it('finishes the rework in progress after finished reworks of the same step', () => {
      const first = rework({ id: 's1.rework-1', status: 'done', endedAt: at })
      const second = rework({ id: 's1.rework-2', title: 'Implementation (rework 2)' })
      expectAccepted(
        finishStep(planText(done, first, second), 's1', end),
        done,
        first,
        { ...second, status: 'done', endedAt: end },
      )
    })

    it('accepts finishing the rework at its own start instant', () => {
      const at45 = '2026-01-01T10:45:00.000Z'
      expectAccepted(finishStep(planText(done, rework()), 's1', at45), done, {
        ...rework(),
        status: 'done',
        endedAt: at45,
      })
    })

    it('refuses finishing the rework earlier than its start and names the rework', () => {
      expect(finishStep(planText(done, rework()), 's1', '2026-01-01T10:44:59.999Z')).toEqual(
        refusal('s1.rework-1', 'endedAt', earlierThanStart),
      )
    })

    it('refuses finishing a rework that has no start instant and names the rework', () => {
      expect(finishStep(planText(done, rework({ startedAt: null })), 's1', end)).toEqual(
        refusal('s1.rework-1', 'startedAt', notInstant),
      )
    })

    it('refuses an instant that is not an instant and names the step', () => {
      expect(finishStep(planText(done, rework()), 's1', 'now')).toEqual(
        refusal('s1', 'endedAt', notInstant),
      )
    })

    it.each([
      ['no rework', []],
      ['only a finished rework', [rework({ status: 'done', endedAt: at })]],
      ['the rework in progress of another step', [rework({ id: 's2.rework-1' })]],
      ['an in-progress step that is not a rework', [rework({ id: 's1.rework-0' })]],
      ['an in-progress step that is not a rework either', [rework({ id: 's1.rework-a' })]],
      ['an in-progress step with a suffix of ten digits', [rework({ id: 's1.rework-1000000000' })]],
      ['an in-progress step named like the rework of another role', [rework({ role: 'qa' })]],
      ['an in-progress step named like the rework but planned', [rework({ origin: 'planned' })]],
      ['an in-progress step named like the rework but retitled', [rework({ title: 'qa: verify' })]],
    ])('refuses to finish a done step with %s', (_name, steps) => {
      expect(finishStep(planText(done, ...steps), 's1', end)).toEqual(
        refusal('s1', 'status', 'must be in_progress to finish'),
      )
    })

    it('finishes a rework numbered 999999999', () => {
      const last = rework({ id: 's1.rework-999999999', title: 'Implementation (rework 999999999)' })
      expectAccepted(finishStep(planText(done, last), 's1', end), done, {
        ...last,
        status: 'done',
        endedAt: end,
      })
    })
  })

  it('finishes an in-progress step itself even when a step named like its rework is in progress', () => {
    const lookalike = {
      ...open,
      id: 's1.rework-1',
      title: 'Implementation (rework 1)',
      origin: 'proposed',
    }
    expectAccepted(
      finishStep(planText(open, lookalike), 's1', end),
      { ...open, status: 'done', endedAt: end },
      lookalike,
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

describe('planNamesIssue', () => {
  const planOf = (issue: string): string => {
    const created = createPlan(issue, 'T')
    if (!created.accepted) throw new Error('expected an acceptance')
    return created.plan
  }
  const planWithIssue = (issue: string): string => JSON.stringify({ issue, title: 'T', steps: [] })

  it.each(['1', '9', '10', '78', '1234567890'])('is true for a plan created for the issue %s', (issue) => {
    expect(planNamesIssue(planOf(issue), issue)).toBe(true)
  })

  it('stays true after a step was added', () => {
    const added = addStep(planOf('78'), 's1', 'dev-a: Implementation')
    if (!added.accepted) throw new Error('expected an acceptance')

    expect(planNamesIssue(added.plan, '78')).toBe(true)
  })

  it.each<[string, string]>([
    ['78', '7'],
    ['7', '78'],
    ['78', '780'],
    ['78', '34'],
  ])('is false for a plan of the issue %s asked about the issue %s', (planned, asked) => {
    expect(planNamesIssue(planOf(planned), asked)).toBe(false)
  })

  it.each(['#78', '078', '', '78\n'])('is false for the malformed issue %j even when the plan carries it', (issue) => {
    expect(planNamesIssue(planWithIssue(`#${issue}`), issue)).toBe(false)
  })

  it.each<[string, string]>([
    ['an issue without the hash', planWithIssue('78')],
    ['a plan without steps', JSON.stringify({ issue: '#78', title: 'T' })],
    ['text that is not JSON', '{'],
  ])('is false for %s', (_name, plan) => {
    expect(planNamesIssue(plan, '78')).toBe(false)
  })

  it.each<[string, unknown]>([
    ['null', null],
    ['a number', 78],
    ['an object', { issue: '#78', title: 'T', steps: [] }],
  ])('is false for a plan that is %s instead of text', (_name, plan) => {
    expect(planNamesIssue(plan as string, '78')).toBe(false)
  })
})

describe('addStep', () => {
  const fresh =(id: string, overlays: Record<string, unknown> = {}) => ({
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
