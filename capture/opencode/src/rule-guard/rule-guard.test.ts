import { describe, expect, it } from 'vitest'
import { createRuleGuardPlugin } from './rule-guard'

const message =
  'agent-flow: AGENT_FLOW_HOME must name the Agent Flow checkout that holds this guard; the rule guard refused to activate\n'

const checkout = '/work/agent-flow'

const disk: Record<string, string> = {
  [checkout]: '/real/agent-flow',
  '/links/to-checkout': '/real/agent-flow',
  '/work/other-checkout': '/real/other',
  '': '/real/agent-flow',
  'relative/checkout': '/real/agent-flow',
}

const guardFor = (home: string | undefined, resolvable: Record<string, string> = disk) => {
  const events: string[] = []
  const plugin = createRuleGuardPlugin({
    home,
    checkout,
    resolve: (path) => resolvable[path],
    report: (text) => void events.push(`report:${text}`),
    exit: (code) => {
      events.push(`exit:${code}`)
      return undefined as never
    },
  })
  return { plugin, events }
}

describe('rule guard', () => {
  it.each([
    ['unset', undefined, disk],
    ['empty', '', disk],
    ['another checkout', '/work/other-checkout', disk],
    ['a path that does not resolve', '/nowhere', disk],
    ['unresolvable on both sides', '/nowhere', {}],
    ['relative', 'relative/checkout', disk],
  ])('reports once, then exits with code 1, when AGENT_FLOW_HOME is %s', async (_state, home, resolvable) => {
    const { plugin, events } = guardFor(home, resolvable)
    await expect(plugin.setup()).rejects.toThrow(new Error(message))
    expect(events).toEqual([`report:${message}`, 'exit:1'])
  })

  it.each([
    ['exactly', checkout],
    ['through a symlink', '/links/to-checkout'],
  ])('starts silently when AGENT_FLOW_HOME names the checkout %s', async (_reference, home) => {
    const { plugin, events } = guardFor(home)
    expect(plugin.id).toBe('agent-flow.rule-guard')
    await expect(plugin.setup()).resolves.toBeUndefined()
    expect(events).toEqual([])
  })
})
