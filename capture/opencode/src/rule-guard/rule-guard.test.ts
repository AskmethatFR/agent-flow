import { describe, expect, it } from 'vitest'
import { createRuleGuardPlugin } from './rule-guard'

const message = 'agent-flow: AGENT_FLOW_HOME must name the Agent Flow checkout; the decision-logging rule is not loaded\n'

const checkout = '/work/agent-flow'

const disk: Record<string, string> = {
  [checkout]: '/real/agent-flow',
  '/links/to-checkout': '/real/agent-flow',
  '/work/other-checkout': '/real/other',
  '': '/real/agent-flow',
}

const guardFor = (home: string | undefined, resolvable: Record<string, string> = disk) => {
  const reports: string[] = []
  const plugin = createRuleGuardPlugin({
    home,
    checkout,
    resolve: (path) => resolvable[path],
    report: (text) => void reports.push(text),
  })
  return { plugin, reports }
}

describe('rule guard', () => {
  it.each([
    ['unset', undefined, disk],
    ['empty', '', disk],
    ['another checkout', '/work/other-checkout', disk],
    ['a path that does not resolve', '/nowhere', disk],
    ['unresolvable on both sides', '/nowhere', {}],
  ])('reports once, then refuses, when AGENT_FLOW_HOME is %s', async (_state, home, resolvable) => {
    const { plugin, reports } = guardFor(home, resolvable)
    await expect(plugin.setup()).rejects.toThrow(new Error(message))
    expect(reports).toEqual([message])
  })

  it.each([
    ['exactly', checkout],
    ['through a symlink', '/links/to-checkout'],
  ])('starts silently when AGENT_FLOW_HOME names the checkout %s', async (_reference, home) => {
    const { plugin, reports } = guardFor(home)
    expect(plugin.id).toBe('agent-flow.rule-guard')
    await expect(plugin.setup()).resolves.toBeUndefined()
    expect(reports).toEqual([])
  })
})
