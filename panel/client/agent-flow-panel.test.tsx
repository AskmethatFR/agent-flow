import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-test-renderer'
import { renderPanel } from './testing/render-panel.tsx'

const step = (id: string, title: string, status = 'todo', timeSpent: { milliseconds: number; label: string } | null = null) => ({
  id,
  title,
  role: 'dev-a',
  status,
  origin: 'planned',
  timeSpent,
  decisions: [],
  omittedDecisions: 0,
  facts: [],
})

const snapshotReply = (overrides: Record<string, unknown> = {}) => ({
  kind: 'snapshot',
  snapshot: {
    issue: '#42',
    title: 'Add login',
    steps: [step('s1', 'Write tests'), step('s2', 'Implement'), step('s3', 'Open PR')],
    currentStepId: null,
    currentAgent: null,
    errors: [],
    ...overrides,
  },
})

describe('AgentFlowPanel', () => {
  it('shows the issue title and the steps in the order the snapshot gives', async () => {
    const calls: { method: string; input: unknown }[] = []
    const invoke = async (method: string, input: unknown) => {
      calls.push({ method, input })
      return snapshotReply()
    }

    const panel = await renderPanel(invoke, { workspaceId: 'w7' })

    expect(calls).toEqual([{ method: 'get-snapshot', input: { workspaceId: 'w7' } }])
    const texts = panel.texts()
    expect(texts).toContain('Add login')
    expect(texts).toContain('#42')
    const positions = ['Write tests', 'Implement', 'Open PR'].map((title) => texts.findIndex((text) => text.includes(title)))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    await panel.unmount()
  })

  it('renders steps as given, without sorting them by id or status', async () => {
    const steps = [step('s9', 'Zeta', 'done'), step('s1', 'Alpha', 'todo')]
    const panel = await renderPanel(async () => snapshotReply({ steps }))

    const texts = panel.texts()
    expect(texts.findIndex((text) => text.includes('Zeta'))).toBeLessThan(texts.findIndex((text) => text.includes('Alpha')))
    await panel.unmount()
  })
})

const settle = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('AgentFlowPanel polling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls again every 2 seconds and shows the new snapshot without reopening', async () => {
    let title = 'First'
    const invoke = vi.fn(async () => snapshotReply({ title }))
    const panel = await renderPanel(invoke)
    expect(panel.texts()).toContain('First')

    title = 'Second'
    await settle(1_999)
    expect(invoke).toHaveBeenCalledTimes(1)
    await settle(1)
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(panel.texts()).toContain('Second')

    await settle(2_000)
    expect(invoke).toHaveBeenCalledTimes(3)
    await panel.unmount()
  })

  it('does not start a second call while the previous one is pending', async () => {
    let release!: (reply: unknown) => void
    const invoke = vi.fn(() => new Promise((resolve) => (release = resolve)))
    const panel = await renderPanel(invoke)

    await settle(10_000)
    expect(invoke).toHaveBeenCalledTimes(1)

    await act(async () => {
      release(snapshotReply())
    })
    await settle(2_000)
    expect(invoke).toHaveBeenCalledTimes(2)
    await panel.unmount()
  })

  it('stops polling on unmount', async () => {
    const invoke = vi.fn(async () => snapshotReply())
    const panel = await renderPanel(invoke)
    await panel.unmount()

    await settle(10_000)
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('ignores a late reply after unmount', async () => {
    let release!: (reply: unknown) => void
    const invoke = vi.fn(() => new Promise((resolve) => (release = resolve)))
    const panel = await renderPanel(invoke)
    await panel.unmount()

    await act(async () => {
      release(snapshotReply())
    })
    await settle(10_000)
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('restarts for the new workspace when workspaceId changes', async () => {
    const invoke = vi.fn(async (_method: string, input: unknown) =>
      snapshotReply({ title: (input as { workspaceId: string }).workspaceId }),
    )
    const panel = await renderPanel(invoke, { workspaceId: 'w1' })
    expect(panel.texts()).toContain('w1')

    await panel.update('w2')
    expect(invoke).toHaveBeenLastCalledWith('get-snapshot', { workspaceId: 'w2' })
    expect(panel.texts()).toContain('w2')

    await settle(2_000)
    expect(invoke).toHaveBeenCalledTimes(3)
    expect(invoke).toHaveBeenLastCalledWith('get-snapshot', { workspaceId: 'w2' })
    await panel.unmount()
  })
})

describe('AgentFlowPanel states', () => {
  it('lists each snapshot error with its file, location, field and message', async () => {
    const errors = [
      { file: 'plan.json', location: 's4', field: 'status', message: 'unknown status' },
      { file: 'plan.json', location: 3, field: null, message: 'bad step' },
      { file: 'plan.json', location: null, field: null, message: 'malformed' },
    ]
    const panel = await renderPanel(async () => snapshotReply({ errors }))

    const texts = panel.texts()
    expect(texts).toContain('Snapshot errors')
    expect(texts).toContain('plan.json · s4 · status · unknown status')
    expect(texts).toContain('plan.json · 3 · bad step')
    expect(texts).toContain('plan.json · malformed')
    await panel.unmount()
  })

  it('does not show the errors heading when the snapshot has no error', async () => {
    const panel = await renderPanel(async () => snapshotReply())
    expect(panel.texts()).not.toContain('Snapshot errors')
    await panel.unmount()
  })

  it('shows the empty-plan copy and the errors when a rejected plan has no steps', async () => {
    const errors = [{ file: 'plan.json', location: null, field: null, message: 'malformed' }]
    const panel = await renderPanel(async () =>
      snapshotReply({ issue: null, title: null, steps: [], errors }),
    )

    const texts = panel.texts()
    expect(texts).toContain('No steps yet.')
    expect(texts).toContain('plan.json · malformed')
    expect(texts).not.toContain('#42')
    await panel.unmount()
  })

  it('shows the loading copy until the first reply', async () => {
    const panel = await renderPanel(() => new Promise(() => {}))
    expect(panel.texts()).toEqual(['Loading the plan…'])
    await panel.unmount()
  })

  it('shows the refusal copy for a workspace the host does not know', async () => {
    const panel = await renderPanel(async () => ({ kind: 'refused', reason: 'unknown-worktree' }))
    expect(panel.texts()).toEqual(['Agent Flow cannot read this workspace.'])
    await panel.unmount()
  })

  describe('with a failing transport', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('shows fixed copy, not the error text, when the call rejects, then recovers on the next poll', async () => {
      let failing = true
      const invoke = vi.fn(async () => {
        if (failing) throw new Error('secret transport detail')
        return snapshotReply()
      })
      const panel = await renderPanel(invoke)
      expect(panel.texts()).toEqual(['The Agent Flow server did not answer. Retrying.'])

      failing = false
      await settle(2_000)
      expect(panel.texts()).toContain('Add login')
      await panel.unmount()
    })

    it('treats a reply that fails the contract as unreachable and keeps polling', async () => {
      const invoke = vi.fn(async () => ({ kind: 'bogus' }))
      const panel = await renderPanel(invoke)
      expect(panel.texts()).toEqual(['The Agent Flow server did not answer. Retrying.'])

      await settle(2_000)
      expect(invoke).toHaveBeenCalledTimes(2)
      await panel.unmount()
    })

    it('keeps the last good plan on screen no longer than the next reply: a later failure shows unreachable', async () => {
      let failing = false
      const invoke = vi.fn(async () => {
        if (failing) throw new Error('down')
        return snapshotReply()
      })
      const panel = await renderPanel(invoke)
      expect(panel.texts()).toContain('Add login')

      failing = true
      await settle(2_000)
      expect(panel.texts()).toEqual(['The Agent Flow server did not answer. Retrying.'])
      await panel.unmount()
    })
  })
})

describe('AgentFlowPanel agent text', () => {
  it('shows every agent-originated string as safe, bounded plain text', async () => {
    const hostile = '\u202eevil\u0007'
    const long = 'y'.repeat(300)
    const panel = await renderPanel(async () =>
      snapshotReply({
        issue: `#${hostile}`,
        title: `T${hostile}`,
        steps: [step('s1', `S${hostile}`), step('s2', long)],
        errors: [{ file: `f${hostile}`, location: `l${hostile}`, field: `d${hostile}`, message: `m${hostile}` }],
      }),
    )

    const texts = panel.texts()
    expect(texts).toContain('#evil')
    expect(texts).toContain('Tevil')
    expect(texts).toContain('Sevil (todo)')
    expect(texts).toContain(`${'y'.repeat(199)}… (todo)`)
    expect(texts).toContain('fevil · levil · devil · mevil')
    await panel.unmount()
  })

  it('bounds the error row once, as a whole', async () => {
    const errors = [{ file: 'f'.repeat(150), location: null, field: null, message: 'm'.repeat(150) }]
    const panel = await renderPanel(async () => snapshotReply({ errors }))

    const row = panel.texts().find((text) => text.startsWith('ffff'))
    expect(Array.from(row ?? '')).toHaveLength(200)
    await panel.unmount()
  })
})

describe('AgentFlowPanel theme and layout', () => {
  it('colours every text from the theme and the surface from surface0', async () => {
    const errors = [{ file: 'f', location: null, field: null, message: 'bad' }]
    const panel = await renderPanel(async () => snapshotReply({ errors }))

    for (const content of ['#42', 'Add login', 'Write tests (todo)']) {
      expect(panel.styleOf(content)).toEqual({ color: '#fff' })
    }
    expect(panel.styleOf('Snapshot errors')).toEqual({ color: '#f00' })
    expect(panel.styleOf('f · bad')).toEqual({ color: '#f00' })
    expect(panel.surface()).toBe('#000')
    await panel.unmount()
  })

  it('colours the empty-plan copy from the foreground and the notices from foregroundMuted', async () => {
    const empty = await renderPanel(async () => snapshotReply({ steps: [] }))
    expect(empty.styleOf('No steps yet.')).toEqual({ color: '#fff' })
    await empty.unmount()

    const loading = await renderPanel(() => new Promise(() => {}))
    expect(loading.styleOf('Loading the plan…')).toEqual({ color: '#aaa' })
    await loading.unmount()
  })

  it.each([
    [true, 16],
    [false, 24],
  ])('pads the panel by the layout: compact %s gives %s', async (compact, padding) => {
    const panel = await renderPanel(async () => snapshotReply(), { compact })
    expect(panel.rootPadding()).toBe(padding)
    await panel.unmount()
  })

  it('shows the loading copy again when the workspace changes while the new reply is pending', async () => {
    const invoke = vi.fn(async (_method: string, input: unknown) =>
      (input as { workspaceId: string }).workspaceId === 'w1' ? snapshotReply() : new Promise<never>(() => {}),
    )
    const panel = await renderPanel(invoke, { workspaceId: 'w1' })
    expect(panel.texts()).toContain('Add login')

    await panel.update('w2')
    expect(panel.texts()).toEqual(['Loading the plan…'])
    await panel.unmount()
  })

  it('keeps a long step title from hiding the real status', async () => {
    const panel = await renderPanel(async () => snapshotReply({ steps: [step('s1', 'z'.repeat(300), 'done')] }))
    expect(panel.texts()).toContain(`${'z'.repeat(199)}… (done)`)
    await panel.unmount()
  })
})

describe('AgentFlowPanel time spent', () => {
  const inProgress = step('s1', 'Implement', 'in_progress', { milliseconds: 38 * 60_000, label: '38 min' })

  it('shows the time label of the step in progress and marks it as current in the accent colour', async () => {
    const panel = await renderPanel(async () => snapshotReply({ steps: [inProgress], currentStepId: 's1' }))

    expect(panel.texts()).toEqual(['#42', 'Add login', 'Implement (in_progress)', '38 min', 'Current'])
    expect(panel.styleOf('Current')?.color).toBe('#08f')
    expect(panel.styleOf('38 min')?.color).toBe('#fff')
    await panel.unmount()
  })

  it('marks no step as current when the snapshot names none', async () => {
    const panel = await renderPanel(async () => snapshotReply({ steps: [inProgress], currentStepId: null }))

    expect(panel.texts()).not.toContain('Current')
    await panel.unmount()
  })

  it('marks only the step the snapshot names as current', async () => {
    const steps = [step('s1', 'First', 'in_progress', { milliseconds: 0, label: '< 1 min' }), step('s2', 'Second', 'in_progress', { milliseconds: 0, label: '< 1 min' })]
    const panel = await renderPanel(async () => snapshotReply({ steps, currentStepId: 's2' }))

    const texts = panel.texts()
    expect(texts.filter((text) => text === 'Current')).toHaveLength(1)
    expect(texts.indexOf('Current')).toBeGreaterThan(texts.indexOf('Second (in_progress)'))
    await panel.unmount()
  })

  it('shows the total duration of a done step and no current marker', async () => {
    const done = step('s1', 'Implement', 'done', { milliseconds: 75 * 60_000, label: '1 h 15 min' })
    const panel = await renderPanel(async () => snapshotReply({ steps: [done], currentStepId: null }))

    expect(panel.texts()).toEqual(['#42', 'Add login', 'Implement (done)', '1 h 15 min'])
    await panel.unmount()
  })

  it('shows no time for a step that is not started', async () => {
    const panel = await renderPanel(async () => snapshotReply({ steps: [step('s1', 'Implement')] }))

    expect(panel.texts()).toEqual(['#42', 'Add login', 'Implement (todo)'])
    await panel.unmount()
  })

  it.each([
    [{ milliseconds: 60_000, label: '38 min' }, '38 min'],
    [{ milliseconds: 0, label: 'about 2 weeks' }, 'about 2 weeks'],
  ])('renders the label %j verbatim, whatever the milliseconds say', async (timeSpent, shown) => {
    const panel = await renderPanel(async () => snapshotReply({ steps: [step('s1', 'Implement', 'done', timeSpent)] }))

    expect(panel.texts()).toContain(shown)
    await panel.unmount()
  })

  it('shows no estimate, budget or percentage', async () => {
    const panel = await renderPanel(async () => snapshotReply({ steps: [inProgress], currentStepId: 's1' }))

    expect(panel.texts().filter((text) => /estimate|budget|%/i.test(text))).toEqual([])
    await panel.unmount()
  })

  it('strips control characters from the label and bounds its length', async () => {
    const hostile = step('s1', 'Implement', 'done', { milliseconds: 0, label: `\u{202E}${'9'.repeat(300)}` })
    const panel = await renderPanel(async () => snapshotReply({ steps: [hostile] }))

    expect(panel.texts()).toContain(`${'9'.repeat(199)}…`)
    await panel.unmount()
  })
})

type DecisionOverrides = Partial<{
  title: string
  why: string
  rejected: string[]
  role: string
  confidence: string
}>

const decision = (overrides: DecisionOverrides = {}) => ({
  title: 'Use zod',
  why: 'one schema for both sides',
  rejected: ['io-ts'],
  role: 'architect',
  confidence: 'high',
  ...overrides,
})

const stepWith = (id: string, title: string, decisions: ReturnType<typeof decision>[]) => ({
  ...step(id, title),
  decisions,
})

describe('AgentFlowPanel step detail', () => {
  const twoSteps = () => [
    stepWith('s1', 'Write tests', [decision({ title: 'Use vitest' }), decision({ title: 'Keep fixtures small' })]),
    stepWith('s2', 'Implement', [decision({ title: 'Use zod' })]),
  ]

  it('lists only the decisions of the pressed step', async () => {
    const panel = await renderPanel(async () => snapshotReply({ steps: twoSteps() }))

    await panel.press('Write tests (todo)')

    const texts = panel.texts()
    expect(texts).toContain('Use vitest')
    expect(texts).toContain('Keep fixtures small')
    expect(texts).not.toContain('Use zod')
    await panel.unmount()
  })

  it('shows no detail before any step is pressed', async () => {
    const panel = await renderPanel(async () => snapshotReply({ steps: twoSteps() }))

    expect(panel.texts()).toEqual(['#42', 'Add login', 'Write tests (todo)', 'Implement (todo)'])
    await panel.unmount()
  })

  it('shows title, why, rejected options, role and confidence right under the pressed step', async () => {
    const full = decision({
      title: 'Use zod',
      why: 'one schema for both sides',
      rejected: ['io-ts', 'yup'],
      role: 'architect',
      confidence: 'medium',
    })
    const steps = [stepWith('s1', 'Design', [full]), stepWith('s2', 'Implement', [])]
    const panel = await renderPanel(async () => snapshotReply({ steps }))

    await panel.press('Design (todo)')

    expect(panel.texts()).toEqual([
      '#42',
      'Add login',
      'Design (todo)',
      'Use zod',
      'Why: one schema for both sides',
      'Rejected: io-ts · yup',
      'Role: architect · Confidence: medium',
      'Implement (todo)',
    ])
    await panel.unmount()
  })

  it('omits the rejected line when no option was rejected', async () => {
    const steps = [stepWith('s1', 'Design', [decision({ rejected: [] })])]
    const panel = await renderPanel(async () => snapshotReply({ steps }))

    await panel.press('Design (todo)')

    expect(panel.texts().filter((text) => text.startsWith('Rejected'))).toEqual([])
    await panel.unmount()
  })

  it('lists every decision of the step in the order given', async () => {
    const steps = [stepWith('s1', 'Design', [decision({ title: 'Second thought' }), decision({ title: 'First thought' })])]
    const panel = await renderPanel(async () => snapshotReply({ steps }))

    await panel.press('Design (todo)')

    const texts = panel.texts()
    expect(texts.indexOf('Second thought')).toBeGreaterThan(-1)
    expect(texts.indexOf('Second thought')).toBeLessThan(texts.indexOf('First thought'))
    await panel.unmount()
  })

  it('states that no decision was logged for a pressed step without decisions', async () => {
    const panel = await renderPanel(async () => snapshotReply({ steps: twoSteps().concat(stepWith('s3', 'Open PR', [])) }))

    await panel.press('Open PR (todo)')

    const texts = panel.texts()
    expect(texts).toContain('No decision logged for this step.')
    expect(texts).not.toContain('Use vitest')
    await panel.unmount()
  })

  it('shows one marker with the count of omitted decisions under the listed ones', async () => {
    const capped = { ...stepWith('s1', 'Design', [decision({ title: 'Use zod' })]), omittedDecisions: 7 }
    const panel = await renderPanel(async () => snapshotReply({ steps: [capped] }))

    await panel.press('Design (todo)')

    const texts = panel.texts()
    expect(texts.filter((text) => text.startsWith('Decisions not shown'))).toEqual(['Decisions not shown: 7'])
    expect(texts.indexOf('Decisions not shown: 7')).toBeGreaterThan(texts.indexOf('Use zod'))
    await panel.unmount()
  })

  it('shows no omitted-decisions marker when none were omitted', async () => {
    const panel = await renderPanel(async () => snapshotReply({ steps: twoSteps() }))

    await panel.press('Write tests (todo)')

    expect(panel.texts().some((text) => text.startsWith('Decisions not shown'))).toBe(false)
    await panel.unmount()
  })

  it('does not state that no decision was logged for a step that has some', async () => {
    const panel = await renderPanel(async () => snapshotReply({ steps: twoSteps() }))

    await panel.press('Write tests (todo)')

    expect(panel.texts()).not.toContain('No decision logged for this step.')
    await panel.unmount()
  })

  it('shows the decisions of the last pressed step only', async () => {
    const panel = await renderPanel(async () => snapshotReply({ steps: twoSteps() }))

    await panel.press('Write tests (todo)')
    await panel.press('Implement (todo)')

    const texts = panel.texts()
    expect(texts).toContain('Use zod')
    expect(texts).not.toContain('Use vitest')
    await panel.unmount()
  })

  it.each(['Design (todo)', '38 min', 'Current', 'Agent: dev-a', 'running'])('selects the step when its row part "%s" is pressed', async (part) => {
    const row = { ...stepWith('s1', 'Design', [decision()]), timeSpent: { milliseconds: 0, label: '38 min' } }
    const currentAgent = { role: 'dev-a', state: 'running' }
    const panel = await renderPanel(async () => snapshotReply({ steps: [row], currentStepId: 's1', currentAgent }))

    await panel.press(part)

    expect(panel.texts()).toContain('Use zod')
    await panel.unmount()
  })

  it('strips control characters and bounds title, why, role and the joined rejected options', async () => {
    const hostile = decision({
      title: `\u{202E}${'t'.repeat(300)}`,
      why: `\u{202E}${'w'.repeat(300)}`,
      rejected: ['a'.repeat(150), `\u{202E}${'b'.repeat(150)}`],
      role: `\u{202E}${'r'.repeat(300)}`,
    })
    const panel = await renderPanel(async () => snapshotReply({ steps: [stepWith('s1', 'Design', [hostile])] }))

    await panel.press('Design (todo)')

    const texts = panel.texts()
    expect(texts).toContain(`${'t'.repeat(199)}…`)
    expect(texts).toContain(`Why: ${'w'.repeat(199)}…`)
    expect(texts).toContain(`Rejected: ${'a'.repeat(150)} · ${'b'.repeat(46)}…`)
    expect(texts).toContain(`Role: ${'r'.repeat(199)}… · Confidence: high`)
    await panel.unmount()
  })

  it('draws every detail line in the foreground colour', async () => {
    const steps = [stepWith('s1', 'Design', [decision()]), stepWith('s2', 'Open PR', [])]
    const panel = await renderPanel(async () => snapshotReply({ steps }))

    await panel.press('Design (todo)')
    await panel.press('Open PR (todo)')

    expect(panel.styleOf('No decision logged for this step.')?.color).toBe('#fff')
    await panel.press('Design (todo)')
    for (const line of ['Use zod', 'Why: one schema for both sides', 'Rejected: io-ts', 'Role: architect · Confidence: high']) {
      expect(panel.styleOf(line)?.color).toBe('#fff')
    }
    await panel.unmount()
  })

  describe('across polls and workspaces', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('keeps the selection and shows the decisions of the next snapshot', async () => {
      let title = 'Use vitest'
      const invoke = vi.fn(async () => snapshotReply({ steps: [stepWith('s1', 'Design', [decision({ title })])] }))
      const panel = await renderPanel(invoke)
      await panel.press('Design (todo)')
      expect(panel.texts()).toContain('Use vitest')

      title = 'Use jest'
      await settle(2_000)

      expect(invoke).toHaveBeenCalledTimes(2)
      expect(panel.texts()).toContain('Use jest')
      expect(panel.texts()).not.toContain('Use vitest')
      await panel.unmount()
    })

    it('forgets the selection when the workspace changes', async () => {
      const invoke = vi.fn(async () => snapshotReply({ steps: [stepWith('s1', 'Design', [decision()])] }))
      const panel = await renderPanel(invoke, { workspaceId: 'w1' })
      await panel.press('Design (todo)')
      expect(panel.texts()).toContain('Use zod')

      await panel.update('w2')

      expect(panel.texts()).not.toContain('Use zod')
      expect(panel.texts()).toContain('Design (todo)')
      await panel.unmount()
    })
  })
})

const fact = (origin: 'verified' | 'declared', source: string, label: string) => ({ origin, source, label })

const stepWithFacts = (id: string, title: string, facts: ReturnType<typeof fact>[]) => ({
  ...step(id, title),
  facts,
})

describe('AgentFlowPanel step facts', () => {
  const testsPassing = fact('verified', 'vitest', '3 of 5 passing')
  const almostDone = fact('declared', 'decisions.jsonl', 'scenario 4 is almost done')

  it('lists each fact with its badge, its label and its source right after the decisions', async () => {
    const decided = { ...stepWith('s1', 'Design', [decision()]), facts: [testsPassing, almostDone] }
    const panel = await renderPanel(async () => snapshotReply({ steps: [decided] }))

    await panel.press('Design (todo)')

    expect(panel.texts()).toEqual([
      '#42',
      'Add login',
      'Design (todo)',
      'Use zod',
      'Why: one schema for both sides',
      'Rejected: io-ts',
      'Role: architect · Confidence: high',
      'Verified',
      '3 of 5 passing',
      'Source: vitest',
      'Declared',
      'scenario 4 is almost done',
      'Source: decisions.jsonl',
    ])
    await panel.unmount()
  })

  it('keeps the order of the snapshot rather than putting verified facts first', async () => {
    const steps = [stepWithFacts('s1', 'Design', [almostDone, testsPassing])]
    const panel = await renderPanel(async () => snapshotReply({ steps }))

    await panel.press('Design (todo)')

    expect(panel.texts().filter((text) => text === 'Verified' || text === 'Declared')).toEqual(['Declared', 'Verified'])
    await panel.unmount()
  })

  it('shows no badge, no source line and no placeholder for a step without facts', async () => {
    const panel = await renderPanel(async () => snapshotReply({ steps: [stepWithFacts('s1', 'Design', [])] }))

    await panel.press('Design (todo)')

    expect(panel.texts()).toEqual(['#42', 'Add login', 'Design (todo)', 'No decision logged for this step.'])
    await panel.unmount()
  })

  it('shows the facts of the pressed step only', async () => {
    const steps = [stepWithFacts('s1', 'Design', [testsPassing]), stepWithFacts('s2', 'Implement', [almostDone])]
    const panel = await renderPanel(async () => snapshotReply({ steps }))

    await panel.press('Implement (todo)')

    const texts = panel.texts()
    expect(texts).toContain('scenario 4 is almost done')
    expect(texts).not.toContain('3 of 5 passing')
    await panel.unmount()
  })

  it('strips control characters and bounds the label and the source', async () => {
    const hostile = fact('declared', `\u{202E}${'s'.repeat(300)}`, `\u{202E}${'l'.repeat(300)}`)
    const panel = await renderPanel(async () => snapshotReply({ steps: [stepWithFacts('s1', 'Design', [hostile])] }))

    await panel.press('Design (todo)')

    const texts = panel.texts()
    expect(texts).toContain(`${'l'.repeat(199)}…`)
    expect(texts).toContain(`Source: ${'s'.repeat(199)}…`)
    await panel.unmount()
  })

  it('draws every fact line in the foreground colour', async () => {
    const panel = await renderPanel(async () => snapshotReply({ steps: [stepWithFacts('s1', 'Design', [testsPassing])] }))

    await panel.press('Design (todo)')

    for (const line of ['Verified', '3 of 5 passing', 'Source: vitest']) {
      expect(panel.styleOf(line)?.color).toBe('#fff')
    }
    await panel.unmount()
  })
})

describe('AgentFlowPanel current agent', () => {
  const inProgress = step('s1', 'Implement', 'in_progress', { milliseconds: 38 * 60_000, label: '38 min' })
  const agentOf = (state: string, role = 'dev-a') => ({ role, state })
  const withAgent = (currentAgent: unknown) => snapshotReply({ steps: [inProgress], currentStepId: 's1', currentAgent })

  it.each(['running', 'stopped', 'unknown'])('shows the role and the %s state right after the Current marker', async (state) => {
    const panel = await renderPanel(async () => withAgent(agentOf(state)))

    expect(panel.texts()).toEqual(['#42', 'Add login', 'Implement (in_progress)', '38 min', 'Current', 'Agent: dev-a', state])
    await panel.unmount()
  })

  it('shows no agent line and keeps the row intact when the snapshot has no current agent', async () => {
    const panel = await renderPanel(async () => withAgent(null))

    expect(panel.texts()).toEqual(['#42', 'Add login', 'Implement (in_progress)', '38 min', 'Current'])
    await panel.unmount()
  })

  it('shows the agent on the current step only', async () => {
    const steps = [step('s1', 'First', 'done'), step('s2', 'Second', 'in_progress')]
    const panel = await renderPanel(async () =>
      snapshotReply({ steps, currentStepId: 's2', currentAgent: agentOf('running') }),
    )

    const texts = panel.texts()
    expect(texts.filter((text) => text.startsWith('Agent:'))).toEqual(['Agent: dev-a'])
    expect(texts.indexOf('Agent: dev-a')).toBe(texts.indexOf('Current') + 1)
    await panel.unmount()
  })

  it('strips control characters from the role and keeps the state visible after a long role', async () => {
    const hostile = await renderPanel(async () => withAgent(agentOf('running', '\u{202E}evil\u0007')))
    expect(hostile.texts()).toContain('Agent: evil')
    await hostile.unmount()

    const long = await renderPanel(async () => withAgent(agentOf('running', 'r'.repeat(300))))
    expect(long.texts()).toContain(`Agent: ${'r'.repeat(199)}…`)
    expect(long.texts()).toContain('running')
    await long.unmount()
  })

  it('shows the real state as its own text when the role imitates a state', async () => {
    const panel = await renderPanel(async () => withAgent(agentOf('stopped', 'dev-a (running)')))

    expect(panel.texts().slice(-2)).toEqual(['Agent: dev-a (running)', 'stopped'])
    await panel.unmount()
  })

  it('draws the role and the state in the foreground colour whatever the state', async () => {
    for (const state of ['running', 'stopped', 'unknown']) {
      const panel = await renderPanel(async () => withAgent(agentOf(state)))
      expect(panel.styleOf('Agent: dev-a')).toEqual({ color: '#fff' })
      expect(panel.styleOf(state)).toEqual({ color: '#fff' })
      await panel.unmount()
    }
  })

  describe('across polls', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('shows the new state after the next poll without reopening the panel', async () => {
      let state = 'running'
      const invoke = vi.fn(async () => withAgent(agentOf(state)))
      const panel = await renderPanel(invoke)
      expect(panel.texts()).toContain('running')

      state = 'stopped'
      await settle(2_000)

      expect(invoke).toHaveBeenCalledTimes(2)
      expect(panel.texts()).toContain('stopped')
      expect(panel.texts()).not.toContain('running')
      await panel.unmount()
    })
  })
})
