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
