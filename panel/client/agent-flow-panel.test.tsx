import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-test-renderer'
import { renderPanel } from './testing/render-panel.tsx'

const step = (id: string, title: string, status = 'todo') => ({
  id,
  title,
  role: 'dev-a',
  status,
  origin: 'planned',
  timeSpent: null,
  decisions: [],
})

const snapshotReply = (overrides: Record<string, unknown> = {}) => ({
  kind: 'snapshot',
  snapshot: {
    issue: '#42',
    title: 'Add login',
    steps: [step('s1', 'Write tests'), step('s2', 'Implement'), step('s3', 'Open PR')],
    currentStepId: null,
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
