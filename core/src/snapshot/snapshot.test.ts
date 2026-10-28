import { describe, expect, expectTypeOf, it } from 'vitest'
import { buildSnapshot } from './index'
import type { Snapshot, SnapshotStep } from './index'

const now = new Date('2026-10-22T10:38:00Z')

const step = (overlay: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 's1',
  title: 'Design',
  role: 'architect',
  status: 'todo',
  origin: 'planned',
  startedAt: null,
  endedAt: null,
  ...overlay,
})

const planText = (...steps: Record<string, unknown>[]): string =>
  JSON.stringify({ issue: '#38', title: 'Core snapshot', steps })

describe('buildSnapshot', () => {
  it('projects a valid plan into its steps without time spent or current step', () => {
    const text = planText(step(), step({ id: 's2', title: 'Build', role: 'dev-a', origin: 'proposed' }))
    expect(buildSnapshot({ plan: text }, now)).toEqual({
      issue: '#38',
      title: 'Core snapshot',
      steps: [
        { id: 's1', title: 'Design', role: 'architect', status: 'todo', origin: 'planned', timeSpent: null },
        { id: 's2', title: 'Build', role: 'dev-a', status: 'todo', origin: 'proposed', timeSpent: null },
      ],
      currentStepId: null,
      errors: [],
    })
  })

  const refused = (message: string, location: string | null = null, field: string | null = null) => ({
    issue: null,
    title: null,
    steps: [],
    currentStepId: null,
    errors: [{ file: 'plan.json', location, field, message }],
  })

  it.each([
    ['a schema violation', planText(step({ id: 's4', status: 'paused' })), refused('must be one of todo, in_progress, done', 's4', 'status')],
    ['text that is not JSON', '{', refused('is not valid JSON')],
    ['an oversized document', 'x'.repeat(1_048_577), refused('exceeds 1048576 characters')],
  ])('gives the plan error and no steps for %s', (_, text, expected) => {
    expect(buildSnapshot({ plan: text }, now)).toEqual(expected)
  })

  it.each([
    ['missing', 'is missing'],
    ['unreadable', 'cannot be read'],
    ['too-large', 'exceeds 1048576 characters'],
  ] as const)('gives the %s plan file one error and no steps', (unavailable, message) => {
    expect(buildSnapshot({ plan: { unavailable } }, now)).toEqual(refused(message))
  })

  it('gives a step in progress the time since its start and makes it the current step', () => {
    const text = planText(step({ status: 'in_progress', startedAt: '2026-10-22T10:00:00Z' }))
    const snapshot = buildSnapshot({ plan: text }, now)
    expect(snapshot.steps[0]?.timeSpent).toEqual({ milliseconds: 2_280_000, label: '38 min' })
    expect(snapshot.currentStepId).toBe('s1')
  })

  it('gives a done step the time between its start and its end and no current step', () => {
    const text = planText(
      step({ status: 'done', startedAt: '2026-10-22T09:00:00Z', endedAt: '2026-10-22T10:15:00Z' }),
    )
    const snapshot = buildSnapshot({ plan: text }, now)
    expect(snapshot.steps[0]?.timeSpent).toEqual({ milliseconds: 4_500_000, label: '1 h 15 min' })
    expect(snapshot.currentStepId).toBeNull()
  })

  const doneAfter = (seconds: number): string =>
    planText(
      step({
        status: 'done',
        startedAt: '2026-10-22T09:00:00Z',
        endedAt: new Date(Date.parse('2026-10-22T09:00:00Z') + seconds * 1000).toISOString(),
      }),
    )

  it.each([
    [0, '< 1 min'],
    [59, '< 1 min'],
    [60, '1 min'],
    [38 * 60 + 59, '38 min'],
    [59 * 60, '59 min'],
    [3599, '59 min'],
    [3600, '1 h'],
    [3660, '1 h 1 min'],
    [4500, '1 h 15 min'],
    [7200, '2 h'],
    [26 * 3600 + 5 * 60, '26 h 5 min'],
  ])('labels %i seconds spent as %s', (seconds, label) => {
    const [first] = buildSnapshot({ plan: doneAfter(seconds) }, now).steps
    expect(first?.timeSpent).toEqual({ milliseconds: seconds * 1000, label })
  })

  const spentOf = (text: string, at: Date = now) => buildSnapshot({ plan: text }, at).steps[0]?.timeSpent

  const inProgress = (overlay: Record<string, unknown>): Record<string, unknown> =>
    step({ status: 'in_progress', startedAt: '2026-10-22T10:00:00Z', ...overlay })

  const finished = (overlay: Record<string, unknown>): Record<string, unknown> =>
    step({
      status: 'done',
      startedAt: '2026-10-22T09:00:00Z',
      endedAt: '2026-10-22T10:15:00Z',
      ...overlay,
    })

  it.each([
    ['Z', '2026-10-22T10:00:00Z'],
    ['a positive offset', '2026-10-22T12:00:00+02:00'],
    ['a negative offset', '2026-10-22T05:00:00-05:00'],
  ])('reads an instant written with %s', (_, startedAt) => {
    expect(spentOf(planText(inProgress({ startedAt })))?.label).toBe('38 min')
  })

  it.each([
    ['no start', null],
    ['an unparseable start', 'yesterday evening'],
    ['an offset-less start', '2026-10-22T10:00:00'],
    ['an impossible date', '2026-13-45T10:00:00Z'],
    ['an offset followed by more text', 'Thu Oct 22 2026 10:00:00 GMT+02:00 (CEST)'],
    ['a legacy date format ending in an offset', 'Thu Oct 22 2026 10:00:00 GMT+02:00'],
    ['a padded legacy date over 40 characters', `Thu Oct 22 2026 10:00:00${' '.repeat(40)}GMT+02:00`],
    ['text before an ISO instant', 'Thu Oct 22 2026 10:00:00 GMT (2026-10-22T10:00:00Z'],
    ['a start after now', '2026-10-22T10:39:00Z'],
  ])('gives a step in progress no time for %s', (_, startedAt) => {
    expect(spentOf(planText(inProgress({ startedAt })))).toBeNull()
  })

  it.each([
    ['minutes only', '2026-10-22T10:00Z'],
    ['nine fractional digits', '2026-10-22T10:00:00.000000000Z'],
  ])('reads an instant with %s', (_, startedAt) => {
    expect(spentOf(planText(inProgress({ startedAt })))?.label).toBe('38 min')
  })

  it('gives no time to an instant with more than nine fractional digits', () => {
    const startedAt = '2026-10-22T10:00:00.0000000000Z'
    expect(spentOf(planText(inProgress({ startedAt })))).toBeNull()
  })

  const manyStepsAfter = (bigStart: string): string =>
    planText(
      inProgress({ id: 'big', startedAt: bigStart }),
      ...Array.from({ length: 4000 }, (_, index) => inProgress({ id: `s${index}`, startedAt: null })),
    )

  const millisecondsToBuild = (text: string): number => {
    const began = performance.now()
    buildSnapshot({ plan: text }, now)
    return performance.now() - began
  }

  it('costs no more than a plan with a short start when an early start is huge and many steps follow', () => {
    const adversarial = manyStepsAfter(`${'a'.repeat(450_000)}Z`)
    const baseline = manyStepsAfter('2026-10-22T10:00:00Z')
    expect(adversarial.length).toBeLessThan(1_048_576)
    millisecondsToBuild(baseline)
    const reference = millisecondsToBuild(baseline)
    expect(millisecondsToBuild(adversarial)).toBeLessThan(reference * 5 + 50)
    const snapshot = buildSnapshot({ plan: adversarial }, now)
    expect(snapshot.errors).toEqual([])
    expect(snapshot.currentStepId).toBe('big')
  })

  it.each([
    ['no start', { startedAt: null }],
    ['no end', { endedAt: null }],
    ['no end and a start before 1970', { startedAt: '1969-12-31T23:00:00Z', endedAt: null }],
    ['an unparseable end', { endedAt: 'later' }],
    ['an offset-less end', { endedAt: '2026-10-22T10:15:00' }],
    ['an offset-less start', { startedAt: '2026-10-22T09:00:00' }],
    ['an end before its start', { startedAt: '2026-10-22T10:15:00Z', endedAt: '2026-10-22T09:00:00Z' }],
  ])('gives a done step no time for %s', (_, overlay) => {
    expect(spentOf(planText(finished(overlay)))).toBeNull()
  })

  it('gives a step still to do no time even when it carries instants', () => {
    const text = planText(
      step({ startedAt: '2026-10-22T09:00:00Z', endedAt: '2026-10-22T10:15:00Z' }),
    )
    expect(spentOf(text)).toBeNull()
  })

  it('gives a step in progress no time when the clock is invalid, yet keeps it current', () => {
    const snapshot = buildSnapshot({ plan: planText(inProgress({})) }, new Date(Number.NaN))
    expect(snapshot.steps[0]?.timeSpent).toBeNull()
    expect(snapshot.currentStepId).toBe('s1')
  })

  const currentOf = (...steps: Record<string, unknown>[]): string | null =>
    buildSnapshot({ plan: planText(...steps) }, now).currentStepId

  it('has no current step when none is in progress', () => {
    const text = planText(finished({ id: 'a' }), step({ id: 'b' }))
    const snapshot = buildSnapshot({ plan: text }, now)
    expect(snapshot.errors).toEqual([])
    expect(snapshot.steps.map(({ id }) => id)).toEqual(['a', 'b'])
    expect(snapshot.currentStepId).toBeNull()
  })

  it.each([
    ['after an earlier one', '2026-10-22T09:00:00Z', '2026-10-22T10:00:00Z', 'b'],
    ['before an earlier one', '2026-10-22T10:00:00Z', '2026-10-22T09:00:00Z', 'a'],
  ])('makes the in-progress step with the latest start current when it comes %s', (_, firstStart, secondStart, expected) => {
    const current = currentOf(
      inProgress({ id: 'a', startedAt: firstStart }),
      inProgress({ id: 'b', startedAt: secondStart }),
    )
    expect(current).toBe(expected)
  })

  it('makes the first of two in-progress steps starting together current', () => {
    expect(currentOf(inProgress({ id: 'a' }), inProgress({ id: 'b' }))).toBe('a')
  })

  it.each([
    ['after one without a start', [{ id: 'a', startedAt: null }, { id: 'b' }], 'b'],
    ['before one without a start', [{ id: 'a' }, { id: 'b', startedAt: null }], 'a'],
    ['two without a start', [{ id: 'a', startedAt: null }, { id: 'b', startedAt: null }], 'a'],
  ])('picks the right current step with %s', (_, overlays, expected) => {
    expect(currentOf(...overlays.map(inProgress))).toBe(expected)
  })

  it('carries no estimate or budget field', () => {
    expectTypeOf<keyof Snapshot>().toEqualTypeOf<
      'issue' | 'title' | 'steps' | 'currentStepId' | 'errors'
    >()
    expectTypeOf<keyof SnapshotStep>().toEqualTypeOf<
      'id' | 'title' | 'role' | 'status' | 'origin' | 'timeSpent'
    >()
  })

  it.each([
    ['text that is not JSONL', 'not json'],
    ['an unavailable file', { unavailable: 'unreadable' }],
  ] as const)('ignores a decisions file that is %s', (_, decisions) => {
    const plan = planText(step())
    expect(buildSnapshot({ plan, decisions }, now)).toEqual(buildSnapshot({ plan }, now))
  })
})
