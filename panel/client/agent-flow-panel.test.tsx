import { describe, expect, it } from 'vitest'
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
