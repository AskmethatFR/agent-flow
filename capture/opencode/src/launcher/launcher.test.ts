import { describe, expect, it } from 'vitest'
import { checkLauncherHome } from './launcher'

const message =
  'agent-flow: AGENT_FLOW_HOME must name the Agent Flow checkout that holds this launcher; OpenCode was not started\n'

const checkout = '/work/agent-flow'

const disk: Record<string, string> = {
  [checkout]: '/real/agent-flow',
  '/links/to-checkout': '/real/agent-flow',
  '/work/other-checkout': '/real/other',
  '': '/real/agent-flow',
  'relative/checkout': '/real/agent-flow',
}

const checkFor = (home: string | undefined, resolvable: Record<string, string> = disk) => {
  const reports: string[] = []
  const code = checkLauncherHome({
    home,
    checkout,
    resolve: (path) => resolvable[path],
    report: (text) => void reports.push(text),
  })
  return { code, reports }
}

describe('launcher check', () => {
  it.each([
    ['unset', undefined, disk],
    ['empty', '', disk],
    ['another checkout', '/work/other-checkout', disk],
    ['a path that does not resolve', '/nowhere', disk],
    ['unresolvable on both sides', '/nowhere', {}],
    ['relative', 'relative/checkout', disk],
  ])('reports once and returns 1 when AGENT_FLOW_HOME is %s', (_state, home, resolvable) => {
    const { code, reports } = checkFor(home, resolvable)
    expect(code).toBe(1)
    expect(reports).toEqual([message])
  })

  it.each([
    ['exactly', checkout],
    ['through a symlink', '/links/to-checkout'],
  ])('returns 0 silently when AGENT_FLOW_HOME names the checkout %s', (_reference, home) => {
    const { code, reports } = checkFor(home)
    expect(code).toBe(0)
    expect(reports).toEqual([])
  })
})
