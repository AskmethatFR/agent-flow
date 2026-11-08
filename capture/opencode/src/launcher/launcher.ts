import { namesCheckout } from '../rule-guard/rule-guard'
import type { CheckoutHome } from '../rule-guard/rule-guard'

export type LauncherCheckOptions = CheckoutHome & {
  readonly report: (text: string) => void
}

const refusal =
  'agent-flow: AGENT_FLOW_HOME must name the Agent Flow checkout that holds this launcher; OpenCode was not started\n'

export function checkLauncherHome(options: LauncherCheckOptions): 0 | 1 {
  if (namesCheckout(options)) return 0
  options.report(refusal)
  return 1
}
