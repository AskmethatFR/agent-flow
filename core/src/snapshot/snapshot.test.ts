import { describe, expect, expectTypeOf, it } from 'vitest'
import { MAX_DECISIONS_PER_STEP, buildSnapshot } from './index'
import type { AgentStatusUnavailable, Snapshot, SnapshotStep } from './index'

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
        { id: 's1', title: 'Design', role: 'architect', status: 'todo', origin: 'planned', timeSpent: null, decisions: [], omittedDecisions: 0 },
        { id: 's2', title: 'Build', role: 'dev-a', status: 'todo', origin: 'proposed', timeSpent: null, decisions: [], omittedDecisions: 0 },
      ],
      currentStepId: null,
      currentAgent: null,
      errors: [],
    })
  })

  const refused = (message: string, location: string | null = null, field: string | null = null) => ({
    issue: null,
    title: null,
    steps: [],
    currentStepId: null,
    currentAgent: null,
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

  const agentOf = (text: string, status?: string): Snapshot['currentAgent'] =>
    buildSnapshot({ plan: text }, now, status).currentAgent

  it.each([
    ['running', 'running'],
    ['idle', 'stopped'],
    ['paused', 'unknown'],
    ['', 'unknown'],
  ])('reports the role of the current step with the display state of the host status "%s"', (status, state) => {
    expect(agentOf(planText(inProgress({ role: 'dev-a' })), status)).toEqual({ role: 'dev-a', state })
  })

  it.each([
    ['after an earlier one', '2026-10-22T09:00:00Z', '2026-10-22T10:00:00Z', 'dev-a'],
    ['before an earlier one', '2026-10-22T10:00:00Z', '2026-10-22T09:00:00Z', 'architect'],
  ])('reports the role of the in-progress step with the latest start when it comes %s', (_, firstStart, secondStart, expectedRole) => {
    const text = planText(
      finished({ id: 'c', role: 'qa' }),
      inProgress({ id: 'a', role: 'architect', startedAt: firstStart }),
      inProgress({ id: 'b', role: 'dev-a', startedAt: secondStart }),
    )
    const snapshot = buildSnapshot({ plan: text }, now, 'running')
    const currentStep = snapshot.steps.find(({ id }) => id === snapshot.currentStepId)
    expect(snapshot.currentAgent).toEqual({ role: expectedRole, state: 'running' })
    expect(snapshot.currentAgent?.role).toBe(currentStep?.role)
  })

  it.each([
    ['no host status is given', planText(inProgress({})), undefined],
    ['no step is in progress', planText(step(), finished({ id: 'b' })), 'running'],
    ['the plan is unusable', '{', 'running'],
  ])('has no current agent when %s', (_, text, status) => {
    expect(agentOf(text, status)).toBeNull()
  })

  it('has no current agent when the plan file is unavailable', () => {
    expect(buildSnapshot({ plan: { unavailable: 'missing' } }, now, 'running').currentAgent).toBeNull()
  })

  it('never carries the raw host status', () => {
    const snapshot = buildSnapshot({ plan: planText(inProgress({})) }, now, 'sentinel-raw-status')
    expect(JSON.stringify(snapshot)).not.toContain('sentinel-raw-status')
  })

  describe('when the host agent status cannot be read', () => {
    const hostError = { file: 'agent-state', location: null, field: null, message: 'cannot be read from the host' }
    const unavailable: AgentStatusUnavailable = { unavailable: 'host-error' }

    it('keeps the steps, drops the current agent and adds the one error last', () => {
      const text = planText(inProgress({ role: 'dev-a' }))
      const withoutAgent = buildSnapshot({ plan: text }, now)
      const snapshot = buildSnapshot({ plan: text }, now, unavailable)
      expect(snapshot).toEqual({ ...withoutAgent, currentAgent: null, errors: [hostError] })
      expect(snapshot.currentStepId).toBe('s1')
    })

    it('puts the error after the decisions errors', () => {
      const snapshot = buildSnapshot(
        { plan: planText(inProgress({})), decisions: { unavailable: 'unreadable' } },
        now,
        unavailable,
      )
      expect(snapshot.errors).toEqual([
        { file: 'decisions.jsonl', location: null, field: null, message: 'cannot be read' },
        hostError,
      ])
    })

    it('puts the error after the plan error when the plan is unusable', () => {
      const snapshot = buildSnapshot({ plan: '{' }, now, unavailable)
      expect(snapshot.errors).toEqual([
        { file: 'plan.json', location: null, field: null, message: 'is not valid JSON' },
        hostError,
      ])
      expect(snapshot.currentAgent).toBeNull()
      expect(snapshot.steps).toEqual([])
    })

    it('puts the error after the error of an unavailable plan file', () => {
      const snapshot = buildSnapshot({ plan: { unavailable: 'missing' } }, now, unavailable)
      expect(snapshot.errors).toEqual([
        { file: 'plan.json', location: null, field: null, message: 'is missing' },
        hostError,
      ])
    })

    it.each([
      ['an empty object', {}],
      ['an object with another code', { unavailable: 'x' }],
      ['an object with an inherited member name', { unavailable: 'toString' }],
    ])('maps %s as an unknown host status, with no error', (_, status) => {
      const snapshot = buildSnapshot({ plan: planText(inProgress({})) }, now, status as unknown as string)
      expect(snapshot.currentAgent).toEqual({ role: 'architect', state: 'unknown' })
      expect(snapshot.errors).toEqual([])
    })

    it('still maps a runtime null as an unknown host status', () => {
      const snapshot = buildSnapshot({ plan: planText(inProgress({})) }, now, null as unknown as string)
      expect(snapshot.currentAgent).toEqual({ role: 'architect', state: 'unknown' })
      expect(snapshot.errors).toEqual([])
    })
  })

  it.each([
    ['__proto__', '__proto__'],
    ['constructor', 'constructor'],
    ['toString', 'toString'],
    ['a NUL character', '\u0000'],
    ['100000 characters', 'x'.repeat(100_000)],
  ])(
    'builds a snapshot for the host status of %s without throwing',
    (_, status) => {
      expect(agentOf(planText(inProgress({})), status)).toEqual({ role: 'architect', state: 'unknown' })
    },
  )

  it('carries no estimate or budget field', () => {
    expectTypeOf<keyof Snapshot>().toEqualTypeOf<
      'issue' | 'title' | 'steps' | 'currentStepId' | 'currentAgent' | 'errors'
    >()
    expectTypeOf<keyof SnapshotStep>().toEqualTypeOf<
      'id' | 'title' | 'role' | 'status' | 'origin' | 'timeSpent' | 'decisions' | 'omittedDecisions'
    >()
  })

  const line = (overlay: Record<string, unknown> = {}): string =>
    JSON.stringify({
      at: '2026-10-22T10:00:00Z',
      step: 's1',
      role: 'dev-a',
      model: 'm',
      kind: 'decision',
      title: 'Use a Map',
      why: 'safe keys',
      rejected: ['object'],
      confidence: 'high',
      ...overlay,
    })

  const decisionsOf = (text: string, ...steps: Record<string, unknown>[]) =>
    buildSnapshot({ plan: planText(...(steps.length === 0 ? [step()] : steps)), decisions: text }, now)

  const mapDecision = {
    title: 'Use a Map',
    why: 'safe keys',
    rejected: ['object'],
    role: 'dev-a',
    confidence: 'high',
  }

  it('gives each step its own decisions with exactly the five fields', () => {
    const text = [line(), line({ step: 's2', title: 'Other', why: 'w', rejected: [], role: 'dev-b', confidence: 'low' })].join('\n')
    const snapshot = decisionsOf(text, step(), step({ id: 's2' }))
    expect(snapshot.errors).toEqual([])
    expect(snapshot.steps[0]?.decisions).toEqual([mapDecision])
    expect(snapshot.steps[1]?.decisions).toEqual([
      { title: 'Other', why: 'w', rejected: [], role: 'dev-b', confidence: 'low' },
    ])
  })

  it('keeps file order and only the decisions of the step, whatever interleaving', () => {
    const text = [
      line({ title: 'a' }),
      line({ step: 's2', title: 'x' }),
      line({ title: 'b' }),
      line({ step: 's2', title: 'y' }),
    ].join('\n')
    const snapshot = decisionsOf(text, step(), step({ id: 's2' }))
    expect(snapshot.steps[0]?.decisions.map(({ title }) => title)).toEqual(['a', 'b'])
    expect(snapshot.steps[1]?.decisions.map(({ title }) => title)).toEqual(['x', 'y'])
  })

  it('gives a step without any decision an empty list', () => {
    const snapshot = decisionsOf(line(), step(), step({ id: 's2' }))
    expect(snapshot.steps[1]?.decisions).toEqual([])
  })

  const manyLines = (count: number, overlay: Record<string, unknown> = {}): string[] =>
    Array.from({ length: count }, (_, index) => line({ title: `d${index}`, ...overlay }))

  const titlesOf = (snapshot: Snapshot, index = 0): string[] =>
    snapshot.steps[index]?.decisions.map(({ title }) => title) ?? []

  it.each([0, 1, MAX_DECISIONS_PER_STEP - 1, MAX_DECISIONS_PER_STEP])(
    'lists all %i decisions of a step at or under the cap and omits none',
    (count) => {
      const snapshot = decisionsOf(manyLines(count).join('\n'))
      expect(titlesOf(snapshot)).toEqual(manyLines(count).map((_, index) => `d${index}`))
      expect(snapshot.steps[0]?.omittedDecisions).toBe(0)
      expect(snapshot.errors).toEqual([])
    },
  )

  it.each([1, 2, MAX_DECISIONS_PER_STEP])(
    'keeps the first decisions up to the cap in file order and counts the %i left out',
    (extra) => {
      const snapshot = decisionsOf(manyLines(MAX_DECISIONS_PER_STEP + extra).join('\n'))
      expect(titlesOf(snapshot)).toEqual(Array.from({ length: MAX_DECISIONS_PER_STEP }, (_, index) => `d${index}`))
      expect(snapshot.steps[0]?.omittedDecisions).toBe(extra)
      expect(snapshot.errors).toEqual([])
    },
  )

  it('applies the cap to each step on its own, whatever interleaving', () => {
    const over = manyLines(MAX_DECISIONS_PER_STEP + 2)
    const other = manyLines(3, { step: 's2' })
    const text = [...over.slice(0, 10), ...other.slice(0, 1), ...over.slice(10), ...other.slice(1)].join('\n')
    const snapshot = decisionsOf(text, step(), step({ id: 's2' }))
    expect(snapshot.steps[0]?.decisions).toHaveLength(MAX_DECISIONS_PER_STEP)
    expect(snapshot.steps[0]?.omittedDecisions).toBe(2)
    expect(titlesOf(snapshot, 1)).toEqual(['d0', 'd1', 'd2'])
    expect(snapshot.steps[1]?.omittedDecisions).toBe(0)
  })

  it('counts omitted decisions per step when several steps overflow', () => {
    const text = [...manyLines(MAX_DECISIONS_PER_STEP + 1), ...manyLines(MAX_DECISIONS_PER_STEP + 4, { step: 's2' })].join('\n')
    const snapshot = decisionsOf(text, step(), step({ id: 's2' }))
    expect(snapshot.steps.map(({ omittedDecisions }) => omittedDecisions)).toEqual([1, 4])
  })

  it('reports no omitted decisions when the decisions file is unavailable', () => {
    const snapshot = buildSnapshot({ plan: planText(step()), decisions: { unavailable: 'unreadable' } }, now)
    expect(snapshot.steps[0]?.omittedDecisions).toBe(0)
  })

  it('groups the valid lines and reports the malformed one with its line number', () => {
    const text = [line({ title: 'a' }), line({ title: 'b' }), '{oops', line({ title: 'c' })].join('\n')
    const snapshot = decisionsOf(text)
    expect(snapshot.steps[0]?.decisions.map(({ title }) => title)).toEqual(['a', 'b', 'c'])
    expect(snapshot.errors).toEqual([
      { file: 'decisions.jsonl', location: 3, field: null, message: 'is not valid JSON' },
    ])
  })

  it('names the field of a schema-invalid line and still builds', () => {
    const snapshot = decisionsOf([line(), line({ confidence: 'certain' })].join('\n'))
    expect(snapshot.steps[0]?.decisions).toHaveLength(1)
    expect(snapshot.errors).toEqual([
      { file: 'decisions.jsonl', location: 2, field: 'confidence', message: 'must be one of high, medium, low' },
    ])
  })

  it('copies rejected, defaults an absent one to empty and hides at, kind, model and step', () => {
    const { rejected: _, ...withoutRejected } = JSON.parse(line()) as Record<string, unknown>
    const snapshot = decisionsOf([JSON.stringify(withoutRejected), line()].join('\n'))
    const [first, second] = snapshot.steps[0]?.decisions ?? []
    expect(first).toEqual({ ...mapDecision, rejected: [] })
    expect(second).toEqual(mapDecision)
    expect(Object.keys(second ?? {}).sort()).toEqual(['confidence', 'rejected', 'role', 'title', 'why'])
  })

  it.each(['decision', 'step_event', 'question', 'deviation'])('counts a %s line as a decision', (kind) => {
    expect(decisionsOf(line({ kind })).steps[0]?.decisions).toHaveLength(1)
  })

  it('excludes an orphan decision from every step and reports its line', () => {
    const snapshot = decisionsOf([line(), line({ step: 'ghost' })].join('\n'))
    expect(snapshot.steps[0]?.decisions).toHaveLength(1)
    expect(snapshot.errors).toEqual([
      { file: 'decisions.jsonl', location: 2, field: 'step', message: 'is not a step of plan.json' },
    ])
  })

  it('caps the orphan errors on their own with a marker', () => {
    const text = Array.from({ length: 101 }, () => line({ step: 'ghost' })).join('\n')
    const { errors } = decisionsOf(text)
    expect(errors).toHaveLength(101)
    expect(errors[99]).toEqual({ file: 'decisions.jsonl', location: 100, field: 'step', message: 'is not a step of plan.json' })
    expect(errors[100]).toEqual({
      file: 'decisions.jsonl',
      location: null,
      field: null,
      message: 'too many errors, only the first 100 are shown',
    })
  })

  it('caps the orphan errors apart from the read errors', () => {
    const orphans = Array.from({ length: 101 }, () => line({ step: 'ghost' }))
    const { errors } = decisionsOf(['{oops', ...orphans].join('\n'))
    expect(errors).toHaveLength(102)
    expect(errors[0]).toEqual({ file: 'decisions.jsonl', location: 1, field: null, message: 'is not valid JSON' })
    expect(errors[100]).toEqual({ file: 'decisions.jsonl', location: 101, field: 'step', message: 'is not a step of plan.json' })
    expect(errors[101]).toEqual({
      file: 'decisions.jsonl',
      location: null,
      field: null,
      message: 'too many errors, only the first 100 are shown',
    })
  })

  it('lists read errors before orphan errors', () => {
    const { errors } = decisionsOf([line({ step: 'ghost' }), '{'].join('\n'))
    expect(errors.map(({ location }) => location)).toEqual([2, 1])
  })

  it.each([
    ['absent', undefined],
    ['missing', { unavailable: 'missing' }],
  ] as const)('reports nothing when the decisions file is %s', (_, decisions) => {
    const snapshot = buildSnapshot({ plan: planText(step()), decisions }, now)
    expect(snapshot.errors).toEqual([])
    expect(snapshot.steps[0]?.decisions).toEqual([])
  })

  it.each([
    ['unreadable', 'cannot be read'],
    ['too-large', 'exceeds 1048576 characters'],
  ] as const)('keeps the steps and reports one error when the decisions file is %s', (unavailable, message) => {
    const snapshot = buildSnapshot({ plan: planText(step()), decisions: { unavailable } }, now)
    expect(snapshot.steps).toHaveLength(1)
    expect(snapshot.steps[0]?.decisions).toEqual([])
    expect(snapshot.errors).toEqual([{ file: 'decisions.jsonl', location: null, field: null, message }])
  })

  it('reads no decisions when the plan is unusable', () => {
    const snapshot = buildSnapshot({ plan: '{', decisions: '{' }, now)
    expect(snapshot.steps).toEqual([])
    expect(snapshot.errors).toEqual([
      { file: 'plan.json', location: null, field: null, message: 'is not valid JSON' },
    ])
  })

  it('groups under step ids that are Object.prototype names', () => {
    const text = [line({ step: '__proto__', title: 'p' }), line({ step: 'constructor', title: 'c' })].join('\n')
    const snapshot = decisionsOf(text, step({ id: '__proto__' }), step({ id: 'constructor' }))
    expect(snapshot.errors).toEqual([])
    expect(snapshot.steps[0]?.decisions.map(({ title }) => title)).toEqual(['p'])
    expect(snapshot.steps[1]?.decisions.map(({ title }) => title)).toEqual(['c'])
  })

  it('reports an orphan line whose step is an Object.prototype name instead of throwing', () => {
    const text = [line(), line({ step: 'toString' }), line({ step: '__proto__' })].join('\n')
    const snapshot = decisionsOf(text)
    expect(snapshot.steps[0]?.decisions).toEqual([mapDecision])
    expect(snapshot.errors).toEqual([
      { file: 'decisions.jsonl', location: 2, field: 'step', message: 'is not a step of plan.json' },
      { file: 'decisions.jsonl', location: 3, field: 'step', message: 'is not a step of plan.json' },
    ])
  })
})
