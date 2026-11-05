import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRuleGuardPlugin } from './rule-guard'

const realpathOrUndefined = (path: string): string | undefined => {
  try {
    return realpathSync(path)
  } catch {
    return undefined
  }
}

export default createRuleGuardPlugin({
  home: process.env.AGENT_FLOW_HOME,
  checkout: fileURLToPath(new URL('../../../../', import.meta.url)),
  resolve: realpathOrUndefined,
  report: (text) => void process.stderr.write(text),
})
