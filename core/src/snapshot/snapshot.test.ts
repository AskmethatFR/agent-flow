import { describe, expect, expectTypeOf, it } from 'vitest'
import { MAX_DECISIONS_PER_STEP, buildSnapshot } from './index'
import type { AgentStatusUnavailable, Snapshot, SnapshotStep } from './index'

const now = new Date('2026-10-22T10:38:00Z')
const saturatedWorkerGuardMs = 20_000

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

const planOf = (...ids: string[]): string => planText(...ids.map((id) => step({ id })))

const decisionLine = (stepId: string, title: string): string =>
  JSON.stringify({
    at: '2026-10-22T10:00:00Z',
    step: stepId,
    role: 'dev-a',
    kind: 'decision',
    title,
    why: 'because',
    rejected: [],
    confidence: 'high',
  })

const unknownStepError = (file: string, location: number) => ({
  file,
  location,
  field: 'step',
  message: 'is not a step of plan.json',
})

describe('buildSnapshot', () => {
  it('projects a valid plan into its steps without time spent or current step', () => {
    const text = planText(step(), step({ id: 's2', title: 'Build', role: 'dev-a', origin: 'proposed' }))
    expect(buildSnapshot({ plan: text }, now)).toEqual({
      issue: '#38',
      title: 'Core snapshot',
      steps: [
        { id: 's1', title: 'Design', role: 'architect', status: 'todo', origin: 'planned', timeSpent: null, decisions: [], omittedDecisions: 0, facts: [] },
        { id: 's2', title: 'Build', role: 'dev-a', status: 'todo', origin: 'proposed', timeSpent: null, decisions: [], omittedDecisions: 0, facts: [] },
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

  const shortStart = '2026-10-22T10:00:00Z'
  const adversarialStart = `${'a'.repeat(450_000)}Z`

  const manyStepsAfter = (bigStart: string, titlePadding: string): string =>
    JSON.stringify({
      issue: '#38',
      title: `Core snapshot${titlePadding}`,
      steps: [
        inProgress({ id: 'big', startedAt: bigStart }),
        ...Array.from({ length: 4000 }, (_, index) => inProgress({ id: `s${index}`, startedAt: null })),
      ],
    })

  const millisecondsToBuild = (text: string): number => {
    const began = performance.now()
    buildSnapshot({ plan: text }, now)
    return performance.now() - began
  }

  const interleavedMinimums = (adversarial: string, baseline: string) => {
    millisecondsToBuild(baseline)
    millisecondsToBuild(adversarial)
    let quickestAdversarial = Infinity
    let quickestBaseline = Infinity
    for (let round = 0; round < 3; round += 1) {
      quickestAdversarial = Math.min(quickestAdversarial, millisecondsToBuild(adversarial))
      quickestBaseline = Math.min(quickestBaseline, millisecondsToBuild(baseline))
    }
    return { adversarial: quickestAdversarial, baseline: quickestBaseline }
  }

  it(
    'costs no more than a same-size plan with a short start when an early start is huge and many steps follow',
    { timeout: saturatedWorkerGuardMs },
    () => {
      const adversarial = manyStepsAfter(adversarialStart, '')
      const baseline = manyStepsAfter(shortStart, 'a'.repeat(adversarialStart.length - shortStart.length))
      expect(adversarial.length).toBe(baseline.length)
      expect(adversarial.length).toBeLessThan(1_048_576)
      const quickest = interleavedMinimums(adversarial, baseline)
      expect(quickest.adversarial).toBeLessThan(quickest.baseline * 5)
      const snapshot = buildSnapshot({ plan: adversarial }, now)
      expect(snapshot.errors).toEqual([])
      expect(snapshot.currentStepId).toBe('big')
    },
  )

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
      'id' | 'title' | 'role' | 'status' | 'origin' | 'timeSpent' | 'decisions' | 'omittedDecisions' | 'facts'
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

  it('caps a step at 50 decisions and counts the one left out', () => {
    const snapshot = decisionsOf(manyLines(51).join('\n'))
    expect(snapshot.steps[0]?.decisions).toHaveLength(50)
    expect(snapshot.steps[0]?.omittedDecisions).toBe(1)
  })

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

  it('declares a fact for every kept decision with the decisions file as its source', () => {
    const snapshot = decisionsOf(line(), step(), step({ id: 's2' }))
    expect(snapshot.steps[0]?.facts).toEqual([
      { origin: 'declared', source: 'decisions.jsonl', label: 'Use a Map' },
    ])
    expect(snapshot.steps[1]?.facts).toEqual([])
  })

  it('keeps the declared facts mirroring the capped decisions of a step', () => {
    const snapshot = decisionsOf(manyLines(MAX_DECISIONS_PER_STEP + 1).join('\n'))
    expect(snapshot.steps[0]?.decisions).toHaveLength(MAX_DECISIONS_PER_STEP)
    expect(snapshot.steps[0]?.facts).toEqual(
      manyLines(MAX_DECISIONS_PER_STEP).map((_, index) => ({ origin: 'declared', source: 'decisions.jsonl', label: `d${index}` })),
    )
  })

  it('declares a fact for every line around a malformed one', () => {
    const snapshot = decisionsOf([line({ title: 'a' }), '{oops', line({ title: 'b' })].join('\n'))
    expect(snapshot.steps[0]?.facts).toEqual([
      { origin: 'declared', source: 'decisions.jsonl', label: 'a' },
      { origin: 'declared', source: 'decisions.jsonl', label: 'b' },
    ])
    expect(snapshot.errors).toEqual([
      { file: 'decisions.jsonl', location: 2, field: null, message: 'is not valid JSON' },
    ])
  })

  it.each(['decision', 'step_event', 'question', 'deviation'])('counts a %s line as a declared fact', (kind) => {
    expect(decisionsOf(line({ kind })).steps[0]?.facts).toEqual([
      { origin: 'declared', source: 'decisions.jsonl', label: 'Use a Map' },
    ])
  })

  it.each([
    ['absent', undefined],
    ['missing', { unavailable: 'missing' }],
    ['unreadable', { unavailable: 'unreadable' }],
  ] as const)('declares no fact when the decisions file is %s', (_, decisions) => {
    expect(buildSnapshot({ plan: planText(step()), decisions }, now).steps[0]?.facts).toEqual([])
  })

  it('builds no step when the plan is unusable', () => {
    expect(buildSnapshot({ plan: '{', decisions: line() }, now).steps).toEqual([])
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

describe('buildSnapshot with test reports', () => {
  const vitestReport = (stepId: string, total: number, passed: number) => ({
    step: stepId,
    text: JSON.stringify({ numTotalTests: total, numPassedTests: passed, numFailedTestSuites: passed === total ? 0 : 1 }),
  })

  const cucumberReport = (stepId: string, ...statuses: string[]) => ({
    step: stepId,
    text: JSON.stringify([{ elements: statuses.map((status) => ({ steps: [{ result: { status } }] })) }]),
  })

  const stepNotInPlan = (location: number) => unknownStepError('test-report', location)

  it('attaches a verified fact labeled with the passed and total counts to its step only', () => {
    const snapshot = buildSnapshot({ plan: planOf('s1', 's2'), testReports: [vitestReport('s2', 5, 3)] }, now)
    expect(snapshot.steps[0]?.facts).toEqual([])
    expect(snapshot.steps[1]?.facts).toEqual([{ origin: 'verified', source: 'vitest', label: '3 of 5 passed' }])
    expect(snapshot.errors).toEqual([])
  })

  it('labels a cucumber-js report with its source and scenario counts', () => {
    const snapshot = buildSnapshot({ plan: planOf('s1'), testReports: [cucumberReport('s1', 'passed', 'failed', 'passed')] }, now)
    expect(snapshot.steps[0]?.facts).toEqual([{ origin: 'verified', source: 'cucumber-js', label: '2 of 3 passed' }])
  })

  it('lists the declared facts of a step first, then its verified facts in input order', () => {
    const snapshot = buildSnapshot(
      {
        plan: planOf('s1'),
        decisions: [decisionLine('s1', 'a'), decisionLine('s1', 'b')].join('\n'),
        testReports: [cucumberReport('s1', 'passed'), vitestReport('s1', 2, 1)],
      },
      now,
    )
    expect(snapshot.steps[0]?.facts).toEqual([
      { origin: 'declared', source: 'decisions.jsonl', label: 'a' },
      { origin: 'declared', source: 'decisions.jsonl', label: 'b' },
      { origin: 'verified', source: 'cucumber-js', label: '1 of 1 passed' },
      { origin: 'verified', source: 'vitest', label: '1 of 2 passed' },
    ])
  })

  it('builds the same snapshot whether the reports are absent or empty', () => {
    const files = { plan: planOf('s1'), decisions: decisionLine('s1', 'a') }
    expect(buildSnapshot({ ...files, testReports: [] }, now)).toEqual(buildSnapshot(files, now))
  })

  it('adds an error at the report position and no fact when its step is not in the plan', () => {
    const snapshot = buildSnapshot({ plan: planOf('s1'), testReports: [vitestReport('s1', 1, 1), vitestReport('s9', 5, 5)] }, now)
    expect(snapshot.steps[0]?.facts).toHaveLength(1)
    expect(snapshot.errors).toEqual([stepNotInPlan(2)])
  })

  it('reports an unmatched malformed report as an unmatched step only', () => {
    const snapshot = buildSnapshot({ plan: planOf('s1'), testReports: [{ step: 's9', text: '{' }] }, now)
    expect(snapshot.errors).toEqual([stepNotInPlan(1)])
  })

  it('reports a report whose step is an Object.prototype name instead of throwing', () => {
    const reports = [vitestReport('toString', 1, 1), vitestReport('__proto__', 1, 1)]
    const snapshot = buildSnapshot({ plan: planOf('s1'), testReports: reports }, now)
    expect(snapshot.errors).toEqual([stepNotInPlan(1), stepNotInPlan(2)])
  })

  it('attaches a report to a step whose id is an Object.prototype name', () => {
    const snapshot = buildSnapshot({ plan: planOf('__proto__'), testReports: [vitestReport('__proto__', 1, 1)] }, now)
    expect(snapshot.steps[0]?.facts).toEqual([{ origin: 'verified', source: 'vitest', label: '1 of 1 passed' }])
    expect(snapshot.errors).toEqual([])
  })

  it.each([
    ['text that is not JSON', '{', 'is not valid JSON'],
    ['a document of an unknown shape', '[null]', 'is not a vitest or cucumber-js JSON report'],
    ['an oversized text', ' '.repeat(1_048_577), 'exceeds 1048576 characters'],
  ])('adds one error and keeps every other fact for %s', (_, text, message) => {
    const snapshot = buildSnapshot(
      {
        plan: planOf('s1', 's2'),
        decisions: decisionLine('s1', 'a'),
        testReports: [vitestReport('s2', 1, 1), { step: 's1', text }],
      },
      now,
    )
    expect(snapshot.steps[0]?.facts).toEqual([{ origin: 'declared', source: 'decisions.jsonl', label: 'a' }])
    expect(snapshot.steps[1]?.facts).toEqual([{ origin: 'verified', source: 'vitest', label: '1 of 1 passed' }])
    expect(snapshot.errors).toEqual([{ file: 'test-report', location: 2, field: null, message }])
  })

  it('caps the report errors and says so', () => {
    const reports = Array.from({ length: 101 }, () => vitestReport('ghost', 1, 1))
    const { errors } = buildSnapshot({ plan: planOf('s1'), testReports: reports }, now)
    expect(errors).toHaveLength(101)
    expect(errors[99]).toEqual(stepNotInPlan(100))
    expect(errors[100]).toEqual({
      file: 'test-report',
      location: null,
      field: null,
      message: 'too many errors, only the first 100 are shown',
    })
  })

  it('lists the decisions errors, then the report errors, then the agent error', () => {
    const snapshot = buildSnapshot(
      { plan: planOf('s1'), decisions: '{', testReports: [{ step: 's9', text: '{' }] },
      now,
      { unavailable: 'host-error' },
    )
    expect(snapshot.errors.map(({ file }) => file)).toEqual(['decisions.jsonl', 'test-report', 'agent-state'])
  })

  it('reads no report when the plan is unusable', () => {
    const snapshot = buildSnapshot({ plan: '{', testReports: [vitestReport('s1', 1, 1), { step: 's1', text: '{' }] }, now)
    expect(snapshot.steps).toEqual([])
    expect(snapshot.errors).toEqual([{ file: 'plan.json', location: null, field: null, message: 'is not valid JSON' }])
  })

  it('carries no failure text of the report into the snapshot', () => {
    const failure = 'AssertionError: expected 1 to be 2 at /home/dev/secret.ts:12'
    const vitest = JSON.stringify({
      numTotalTests: 2,
      numPassedTests: 1,
      numFailedTestSuites: 0,
      testResults: [{ assertionResults: [{ status: 'failed', failureMessages: [failure] }] }],
    })
    const cucumber = JSON.stringify([
      { elements: [{ steps: [{ result: { status: 'failed', error_message: failure } }] }] },
    ])
    const snapshot = buildSnapshot(
      { plan: planOf('s1'), testReports: [{ step: 's1', text: vitest }, { step: 's1', text: cucumber }] },
      now,
    )
    expect(snapshot.steps[0]?.facts).toHaveLength(2)
    expect(JSON.stringify(snapshot)).not.toContain('AssertionError')
    expect(JSON.stringify(snapshot)).not.toContain('secret.ts')
  })
})

describe('buildSnapshot reading the text of a test report', () => {
  const MAX_TEXT = 1_048_576

  const reading = (text: string): Snapshot =>
    buildSnapshot({ plan: planText(step()), testReports: [{ step: 's1', text }] }, now)

  const factsOf = (text: string) => reading(text).steps[0]?.facts

  const refusal = (message: string) => [{ file: 'test-report', location: 1, field: null, message }]

  const unknownShape = refusal('is not a vitest or cucumber-js JSON report')

  const vitestText = (overlay: Record<string, unknown>): string => {
    const report = { numTotalTests: 5, numPassedTests: 5, ...overlay }
    const failedSuites = report.numPassedTests === report.numTotalTests ? 0 : 1
    return JSON.stringify({ numFailedTestSuites: failedSuites, ...report })
  }

  const padded = (body: string, length: number): string => `${body}${' '.repeat(length - body.length)}`

  const verified = (source: string, label: string) => [{ origin: 'verified', source, label }]

  describe('a vitest report', () => {
    it.each([
      [5, 5],
      [5, 3],
      [5, 0],
      [0, 0],
      [1, 1],
      [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    ])('is accepted with %i tests of which %i passed, as reported', (total, passed) => {
      const snapshot = reading(vitestText({ numTotalTests: total, numPassedTests: passed }))
      expect(snapshot.steps[0]?.facts).toEqual(verified('vitest', `${passed} of ${total} passed`))
      expect(snapshot.errors).toEqual([])
    })

    it.each([
      [5, 3, 1, '3 of 5 passed'],
      [5, 3, 0, '3 of 5 passed'],
      [5, 4, 1, '4 of 5 passed'],
      [5, 5, 0, '5 of 5 passed'],
      [5, 5, 1, '5 of 5 passed, run failed'],
      [5, 5, 3, '5 of 5 passed, run failed'],
      [0, 0, 1, '0 of 0 passed, run failed'],
    ])('labels %i tests of which %i passed with %i failed suites as "%s"', (total, passed, failedSuites, label) => {
      const text = vitestText({ numTotalTests: total, numPassedTests: passed, numFailedTestSuites: failedSuites })
      expect(factsOf(text)).toEqual(verified('vitest', label))
    })

    it.each([
      ['one more passed than total', { numTotalTests: 5, numPassedTests: 6 }],
      ['a negative total', { numTotalTests: -1, numPassedTests: 0 }],
      ['a negative passed count', { numPassedTests: -1 }],
      ['a fractional total', { numTotalTests: 2.5, numPassedTests: 2 }],
      ['a fractional passed count', { numPassedTests: 2.5 }],
      ['an unsafe integer total', { numTotalTests: 2 ** 53, numPassedTests: 0 }],
      ['a string total', { numTotalTests: '5' }],
      ['a string passed count', { numPassedTests: '5' }],
      ['a missing total', { numTotalTests: undefined }],
      ['a missing passed count', { numPassedTests: undefined }],
      ['a missing failed suites count', { numFailedTestSuites: undefined }],
      ['a negative failed suites count', { numFailedTestSuites: -1 }],
      ['a fractional failed suites count', { numFailedTestSuites: 1.5 }],
      ['a string failed suites count', { numFailedTestSuites: '1' }],
      ['a null failed suites count', { numFailedTestSuites: null }],
    ])('is refused as an unknown shape with %s', (_, overlay) => {
      const snapshot = reading(vitestText(overlay))
      expect(snapshot.steps[0]?.facts).toEqual([])
      expect(snapshot.errors).toEqual(unknownShape)
    })

    it('is refused as an unknown shape when it is an empty object', () => {
      expect(reading('{}').errors).toEqual(unknownShape)
    })
  })

  describe('a text that is not a usable report', () => {
    it.each([
      ['an empty text', ''],
      ['a truncated document', '{"numTotalTests": 5'],
      ['plain prose', 'not json'],
    ])('is refused as invalid JSON for %s', (_, text) => {
      expect(reading(text).errors).toEqual(refusal('is not valid JSON'))
      expect(factsOf(text)).toEqual([])
    })

    it.each([
      ['null', 'null'],
      ['a number', '5'],
      ['a string', '"vitest"'],
      ['a boolean', 'true'],
      ['an array holding null', '[null]'],
      ['an array holding an array', '[[]]'],
      ['deeply nested arrays', `${'['.repeat(500)}${']'.repeat(500)}`],
      ['an array of features without elements', '[{}]'],
    ])('is refused as an unknown shape without throwing for %s', (_, text) => {
      expect(reading(text).errors).toEqual(unknownShape)
      expect(factsOf(text)).toEqual([])
    })

    it('is refused when one character over the bound, before it is parsed', () => {
      const text = padded(vitestText({}), MAX_TEXT + 1)
      expect(text).toHaveLength(MAX_TEXT + 1)
      expect(reading(text).errors).toEqual(refusal(`exceeds ${MAX_TEXT} characters`))
      expect(factsOf(text)).toEqual([])
    })

    it('is accepted at exactly the bound', () => {
      const text = padded(vitestText({}), MAX_TEXT)
      expect(text).toHaveLength(MAX_TEXT)
      expect(factsOf(text)).toEqual(verified('vitest', '5 of 5 passed'))
    })
  })

  describe('a cucumber-js JSON report', () => {
    const scenario = (...statuses: unknown[]): Record<string, unknown> => ({
      type: 'scenario',
      steps: statuses.map((status) => ({ result: { status } })),
    })

    const feature = (...elements: unknown[]): Record<string, unknown> => ({ keyword: 'Feature', elements })

    const cucumberText = (...features: unknown[]): string => JSON.stringify(features)

    const labeled = (label: string) => verified('cucumber-js', label)

    it('counts a scenario as passed when every one of its steps passed', () => {
      expect(factsOf(cucumberText(feature(scenario('passed', 'passed'), scenario('passed'))))).toEqual(
        labeled('2 of 2 passed'),
      )
    })

    it.each(['failed', 'skipped', 'pending', 'undefined', 'ambiguous', 'unknown'])(
      'does not count a scenario with one %s step as passed',
      (status) => {
        const text = cucumberText(feature(scenario('passed', status, 'passed'), scenario('passed')))
        expect(factsOf(text)).toEqual(labeled('1 of 2 passed'))
      },
    )

    it('does not count a scenario whose last step is a failed hidden hook', () => {
      const hook = { hidden: true, keyword: 'After', result: { status: 'failed' } }
      const text = cucumberText(feature({ type: 'scenario', steps: [{ result: { status: 'passed' } }, hook] }))
      expect(factsOf(text)).toEqual(labeled('0 of 1 passed'))
    })

    it('counts a scenario with no step as passed', () => {
      expect(factsOf(cucumberText(feature(scenario())))).toEqual(labeled('1 of 1 passed'))
    })

    it('sums the scenarios of every feature and never adds a failed suites suffix', () => {
      const text = cucumberText(feature(scenario('passed'), scenario('failed')), feature(scenario('passed')), feature())
      expect(factsOf(text)).toEqual(labeled('2 of 3 passed'))
    })

    it.each([
      ['no feature', '[]'],
      ['a feature with no scenario', cucumberText(feature())],
    ])('reports 0 of 0 for %s', (_, text) => {
      expect(factsOf(text)).toEqual(labeled('0 of 0 passed'))
    })

    it.each([
      ['a null feature', cucumberText(null)],
      ['a feature whose elements is not an array', cucumberText({ elements: {} })],
      ['a null scenario', cucumberText(feature(null))],
      ['a scenario whose steps is not an array', cucumberText(feature({ steps: 'passed' }))],
      ['a null step', cucumberText(feature({ steps: [null] }))],
      ['a step with no result', cucumberText(feature({ steps: [{}] }))],
      ['a step whose result is null', cucumberText(feature({ steps: [{ result: null }] }))],
      ['a step with no status', cucumberText(feature({ steps: [{ result: {} }] }))],
      ['a step whose status is not a string', cucumberText(feature(scenario(1)))],
      ['one bad scenario after good ones', cucumberText(feature(scenario('passed'), null))],
      ['one bad feature after good ones', cucumberText(feature(scenario('passed')), null)],
    ])('is refused whole for %s', (_, text) => {
      expect(reading(text).errors).toEqual(unknownShape)
      expect(factsOf(text)).toEqual([])
    })
  })
})

describe('buildSnapshot with mutation reports', () => {
  const MAX_TEXT = 1_048_576

  const mutantsOf = (counts: Record<string, number>): Record<string, unknown>[] =>
    Object.entries(counts).flatMap(([status, count]) =>
      Array.from({ length: count }, () => ({ status })),
    )

  const strykerText = (counts: Record<string, number>, overlay: Record<string, unknown> = {}): string =>
    JSON.stringify({ schemaVersion: '1.0', files: { 'src/a.ts': { language: 'typescript', mutants: mutantsOf(counts) } }, ...overlay })

  const mutationReport = (stepId: string, counts: Record<string, number>) => ({ step: stepId, text: strykerText(counts) })

  const labeled = (label: string) => [{ origin: 'verified', source: 'stryker', label }]

  const mutationFactsOf = (text: string) =>
    buildSnapshot({ plan: planOf('s1'), mutationReports: [{ step: 's1', text }] }, now).steps[0]?.facts

  const refusal = (message: string, location = 1) => [{ file: 'mutation-report', location, field: null, message }]

  it('attaches a verified stryker fact labeled with the score and the surviving count to its step only', () => {
    const snapshot = buildSnapshot(
      { plan: planOf('s1', 's2'), mutationReports: [mutationReport('s2', { Killed: 3, Survived: 1 })] },
      now,
    )
    expect(snapshot.steps[0]?.facts).toEqual([])
    expect(snapshot.steps[1]?.facts).toEqual(labeled('75.00% mutation score, 1 surviving'))
    expect(snapshot.errors).toEqual([])
  })

  it.each([
    ['floors 9 of 11 to 81.81', { Killed: 9, Survived: 2 }, '81.81% mutation score, 2 surviving'],
    ['floors 2 of 3 to 66.66', { Killed: 2, Survived: 1 }, '66.66% mutation score, 1 surviving'],
    ['never reads 100.00 with a survivor', { Killed: 20001, Survived: 1 }, '99.99% mutation score, 1 surviving'],
    ['reads 0.00 when nothing is detected', { Survived: 3 }, '0.00% mutation score, 3 surviving'],
    ['reads 100.00 when nothing survives', { Killed: 7 }, '100.00% mutation score, 0 surviving'],
    ['pads a single digit of hundredths', { Killed: 1, Survived: 19 }, '5.00% mutation score, 19 surviving'],
    ['pads the hundredths with a zero', { Killed: 1005, Survived: 8995 }, '10.05% mutation score, 8995 surviving'],
    ['counts a timeout as detected', { Timeout: 1, Survived: 1 }, '50.00% mutation score, 1 surviving'],
    ['counts a mutant with no coverage as surviving', { Killed: 1, NoCoverage: 1 }, '50.00% mutation score, 1 surviving'],
    ['counts survived and no coverage together', { Killed: 8, Timeout: 1, Survived: 1, NoCoverage: 1 }, '81.81% mutation score, 2 surviving'],
  ])('%s', (_, counts, label) => {
    expect(mutationFactsOf(strykerText(counts))).toEqual(labeled(label))
  })

  it.each(['Ignored', 'CompileError', 'RuntimeError', 'Pending'])('does not count a %s mutant', (status) => {
    expect(mutationFactsOf(strykerText({ Killed: 1, Survived: 1, [status]: 5 }))).toEqual(
      labeled('50.00% mutation score, 1 surviving'),
    )
  })

  it('sums the mutants of every file of the report', () => {
    const text = JSON.stringify({
      schemaVersion: '1.0',
      files: {
        'src/a.ts': { mutants: mutantsOf({ Killed: 1, Survived: 1 }) },
        'src/b.ts': { mutants: mutantsOf({ Killed: 2 }) },
        'src/c.ts': { mutants: [] },
      },
    })
    expect(mutationFactsOf(text)).toEqual(labeled('75.00% mutation score, 1 surviving'))
  })

  it('reads a file named __proto__ like any other', () => {
    const text = '{"schemaVersion":"1.0","files":{"__proto__":{"mutants":[{"status":"Killed"},{"status":"Survived"}]}}}'
    expect(mutationFactsOf(text)).toEqual(labeled('50.00% mutation score, 1 surviving'))
  })

  it('states the score without ruling on the thresholds of the report', () => {
    const high = mutationFactsOf(strykerText({ Killed: 3, Survived: 1 }, { thresholds: { high: 90, low: 80 } }))
    const none = mutationFactsOf(strykerText({ Killed: 3, Survived: 1 }))
    expect(high).toEqual(none)
  })

  it('lists the declared facts, then the test report facts, then the mutation facts in input order', () => {
    const vitest = JSON.stringify({ numTotalTests: 2, numPassedTests: 2, numFailedTestSuites: 0 })
    const snapshot = buildSnapshot(
      {
        plan: planOf('s1'),
        decisions: decisionLine('s1', 'a'),
        testReports: [{ step: 's1', text: vitest }],
        mutationReports: [mutationReport('s1', { Killed: 1, Survived: 1 }), mutationReport('s1', { Killed: 1 })],
      },
      now,
    )
    expect(snapshot.steps[0]?.facts).toEqual([
      { origin: 'declared', source: 'decisions.jsonl', label: 'a' },
      { origin: 'verified', source: 'vitest', label: '2 of 2 passed' },
      { origin: 'verified', source: 'stryker', label: '50.00% mutation score, 1 surviving' },
      { origin: 'verified', source: 'stryker', label: '100.00% mutation score, 0 surviving' },
    ])
  })

  it('builds the same snapshot whether the mutation reports are absent or empty', () => {
    const files = { plan: planOf('s1'), decisions: decisionLine('s1', 'a') }
    expect(buildSnapshot({ ...files, mutationReports: [] }, now)).toEqual(buildSnapshot(files, now))
  })

  const stepNotInPlan = (location: number) => unknownStepError('mutation-report', location)

  it('adds an error at the report position and no fact when its step is not in the plan', () => {
    const reports = [mutationReport('s1', { Killed: 1 }), mutationReport('s9', { Killed: 1 })]
    const snapshot = buildSnapshot({ plan: planOf('s1'), mutationReports: reports }, now)
    expect(snapshot.steps[0]?.facts).toHaveLength(1)
    expect(snapshot.errors).toEqual([stepNotInPlan(2)])
  })

  it('reports an unmatched malformed report as an unmatched step only', () => {
    const snapshot = buildSnapshot({ plan: planOf('s1'), mutationReports: [{ step: 's9', text: '{' }] }, now)
    expect(snapshot.errors).toEqual([stepNotInPlan(1)])
  })

  it('reports a report whose step is an Object.prototype name instead of throwing', () => {
    const reports = [mutationReport('toString', { Killed: 1 }), mutationReport('__proto__', { Killed: 1 })]
    const snapshot = buildSnapshot({ plan: planOf('s1'), mutationReports: reports }, now)
    expect(snapshot.errors).toEqual([stepNotInPlan(1), stepNotInPlan(2)])
  })

  it('attaches a report to a step whose id is an Object.prototype name', () => {
    const snapshot = buildSnapshot({ plan: planOf('__proto__'), mutationReports: [mutationReport('__proto__', { Killed: 1 })] }, now)
    expect(snapshot.steps[0]?.facts).toEqual(labeled('100.00% mutation score, 0 surviving'))
    expect(snapshot.errors).toEqual([])
  })

  it.each([
    ['text that is not JSON', '{', 'is not valid JSON'],
    ['an empty text', '', 'is not valid JSON'],
    ['an array', '[]', 'is not a Stryker mutation report'],
    ['null', 'null', 'is not a Stryker mutation report'],
    ['a string', '"report"', 'is not a Stryker mutation report'],
    ['a document with no schemaVersion', '{"files":{"a":{"mutants":[{"status":"Killed"}]}}}', 'is not a Stryker mutation report'],
    ['a schemaVersion that is not a string', '{"schemaVersion":2,"files":{"a":{"mutants":[{"status":"Killed"}]}}}', 'is not a Stryker mutation report'],
    ['a document with no files', '{"schemaVersion":"1.0"}', 'is not a Stryker mutation report'],
    ['files that is null', '{"schemaVersion":"1.0","files":null}', 'is not a Stryker mutation report'],
    ['files that is an array', '{"schemaVersion":"1.0","files":[{"mutants":[{"status":"Killed"}]}]}', 'is not a Stryker mutation report'],
    ['a file that is null', '{"schemaVersion":"1.0","files":{"a":null}}', 'is not a Stryker mutation report'],
    ['a file with no mutants', '{"schemaVersion":"1.0","files":{"a":{}}}', 'is not a Stryker mutation report'],
    ['a file whose mutants is not an array', '{"schemaVersion":"1.0","files":{"a":{"mutants":{}}}}', 'is not a Stryker mutation report'],
    ['one bad file after a good one', '{"schemaVersion":"1.0","files":{"a":{"mutants":[{"status":"Killed"}]},"b":{}}}', 'is not a Stryker mutation report'],
    ['a mutant that is null', '{"schemaVersion":"1.0","files":{"a":{"mutants":[null]}}}', 'is not a Stryker mutation report'],
    ['a mutant with no status', '{"schemaVersion":"1.0","files":{"a":{"mutants":[{}]}}}', 'is not a Stryker mutation report'],
    ['a status that is not a string', '{"schemaVersion":"1.0","files":{"a":{"mutants":[{"status":1}]}}}', 'is not a Stryker mutation report'],
    ['a status outside the Stryker set', '{"schemaVersion":"1.0","files":{"a":{"mutants":[{"status":"killed"}]}}}', 'is not a Stryker mutation report'],
    ['one bad mutant after good ones', '{"schemaVersion":"1.0","files":{"a":{"mutants":[{"status":"Killed"},{"status":"Nope"}]}}}', 'is not a Stryker mutation report'],
    ['no file', '{"schemaVersion":"1.0","files":{}}', 'has no mutant to score'],
    ['a file with no mutant', '{"schemaVersion":"1.0","files":{"a":{"mutants":[]}}}', 'has no mutant to score'],
    ['only ignored mutants', strykerText({ Ignored: 2 }), 'has no mutant to score'],
    ['only mutants that cannot be counted', strykerText({ Ignored: 1, CompileError: 1, RuntimeError: 1, Pending: 1 }), 'has no mutant to score'],
    ['an oversized text', `${strykerText({ Killed: 1 })}${' '.repeat(MAX_TEXT)}`, `exceeds ${MAX_TEXT} characters`],
  ])('adds one error and keeps every other fact for %s', (_, text, message) => {
    const snapshot = buildSnapshot(
      {
        plan: planOf('s1', 's2'),
        decisions: decisionLine('s1', 'a'),
        mutationReports: [mutationReport('s2', { Killed: 1, Survived: 1 }), { step: 's1', text }],
      },
      now,
    )
    expect(snapshot.steps[0]?.facts).toEqual([{ origin: 'declared', source: 'decisions.jsonl', label: 'a' }])
    expect(snapshot.steps[1]?.facts).toEqual(labeled('50.00% mutation score, 1 surviving'))
    expect(snapshot.errors).toEqual(refusal(message, 2))
  })

  it('accepts a text of exactly the size bound and refuses one unit more', () => {
    const body = strykerText({ Killed: 1 })
    const padded = (length: number): string => `${body}${' '.repeat(length - body.length)}`
    expect(mutationFactsOf(padded(MAX_TEXT))).toEqual(labeled('100.00% mutation score, 0 surviving'))
    expect(mutationFactsOf(padded(MAX_TEXT + 1))).toEqual([])
  })

  it('carries nothing of the report source text into the snapshot', () => {
    const marker = 'LEAK-MARKER'
    const text = JSON.stringify({
      schemaVersion: '1.0',
      thresholds: { high: 90, low: 80, note: marker },
      config: { note: marker },
      files: {
        'src/a.ts': {
          source: marker,
          mutants: [
            { status: 'Survived', replacement: marker, statusReason: marker, mutatorName: marker, id: marker },
            { status: 'Killed', replacement: marker, statusReason: marker },
          ],
        },
      },
    })
    const snapshot = buildSnapshot({ plan: planOf('s1'), mutationReports: [{ step: 's1', text }, { step: 's1', text: `${text}x` }] }, now)
    expect(snapshot.steps[0]?.facts).toEqual(labeled('50.00% mutation score, 1 surviving'))
    expect(JSON.stringify(snapshot)).not.toContain(marker)
  })

  it('caps the mutation report errors and says so', () => {
    const reports = Array.from({ length: 101 }, () => mutationReport('ghost', { Killed: 1 }))
    const { errors } = buildSnapshot({ plan: planOf('s1'), mutationReports: reports }, now)
    expect(errors).toHaveLength(101)
    expect(errors[99]).toEqual(stepNotInPlan(100))
    expect(errors[100]).toEqual({
      file: 'mutation-report',
      location: null,
      field: null,
      message: 'too many errors, only the first 100 are shown',
    })
  })

  it('lists the decisions errors, then the test report errors, then the mutation report errors, then the agent error', () => {
    const snapshot = buildSnapshot(
      {
        plan: planOf('s1'),
        decisions: '{',
        testReports: [{ step: 's9', text: '{' }],
        mutationReports: [{ step: 's9', text: '{' }],
      },
      now,
      { unavailable: 'host-error' },
    )
    expect(snapshot.errors.map(({ file }) => file)).toEqual(['decisions.jsonl', 'test-report', 'mutation-report', 'agent-state'])
  })

  it('reads no mutation report when the plan is unusable', () => {
    const snapshot = buildSnapshot({ plan: '{', mutationReports: [mutationReport('s1', { Killed: 1 }), { step: 's1', text: '{' }] }, now)
    expect(snapshot.steps).toEqual([])
    expect(snapshot.errors).toEqual([{ file: 'plan.json', location: null, field: null, message: 'is not valid JSON' }])
  })
})
