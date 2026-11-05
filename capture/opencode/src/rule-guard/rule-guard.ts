export type RuleGuardOptions = {
  readonly home: string | undefined
  readonly checkout: string
  readonly resolve: (path: string) => string | undefined
  readonly report: (text: string) => void
}

const refusal = 'agent-flow: AGENT_FLOW_HOME must name the Agent Flow checkout; the decision-logging rule is not loaded\n'

const namesCheckout = ({ home, checkout, resolve }: RuleGuardOptions): boolean => {
  if (!home) return false
  const resolved = resolve(home)
  return resolved !== undefined && resolved === resolve(checkout)
}

export function createRuleGuardPlugin(options: RuleGuardOptions) {
  return {
    id: 'agent-flow.rule-guard',
    async setup(): Promise<undefined> {
      if (namesCheckout(options)) return undefined
      options.report(refusal)
      throw new Error(refusal)
    },
  }
}
