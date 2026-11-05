import { checkWorktree } from './index'

const usage = 'usage: agent-flow-check <worktree>\n'

export const runContractCheckCommand = (
  args: readonly string[],
  writeOut: (text: string) => void,
  writeError: (text: string) => void,
): number => {
  if (args.length !== 1) {
    writeError(usage)
    return 2
  }
  const result = checkWorktree(args[0] as string)
  if (result.accepted) {
    writeOut(`${JSON.stringify({ checked: result.checked })}\n`)
    return 0
  }
  writeError(`${JSON.stringify({ errors: result.errors })}\n`)
  return 1
}
