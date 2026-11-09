import { isExistingPlanRefusal, seedPlan } from './index'

const usage = 'usage: agent-flow-plan <worktree> <issue> <title>\n'

export const runPlanCommand = (
  args: readonly string[],
  writeError: (text: string) => void,
): number => {
  if (args.length !== 3) {
    writeError(usage)
    return 2
  }
  const [worktree, issue, title] = args as readonly [string, string, string]
  const result = seedPlan(worktree, issue, title)
  if (result.accepted) return 0
  writeError(`${JSON.stringify({ errors: result.errors })}\n`)
  return isExistingPlanRefusal(result) ? 3 : 1
}
