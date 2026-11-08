import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkLauncherHome } from './launcher'

const realpathOrUndefined = (path: string): string | undefined => {
  try {
    return realpathSync(path)
  } catch {
    return undefined
  }
}

process.exitCode = checkLauncherHome({
  home: process.env.AGENT_FLOW_HOME,
  checkout: fileURLToPath(new URL('../../../../', import.meta.url)),
  resolve: realpathOrUndefined,
  report: (text) => void process.stderr.write(text),
})
