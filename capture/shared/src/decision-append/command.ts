import type { ValidationResult } from '@agent-flow/core/contracts'
import { appendDecision } from './index'

const usage = 'usage: agent-flow-decision <worktree> <decision-json>\n'

const notJson: ValidationResult = {
  accepted: false,
  errors: [{ file: 'decisions.jsonl', location: null, field: null, message: 'is not valid JSON' }],
}

const parse = (text: string): { readonly value: unknown } | ValidationResult => {
  try {
    return { value: JSON.parse(text) }
  } catch {
    return notJson
  }
}

export const runDecisionCommand = (
  args: readonly string[],
  writeError: (text: string) => void,
): number => {
  const [worktree, text] = args
  if (args.length !== 2 || worktree === undefined || text === undefined) {
    writeError(usage)
    return 2
  }
  const parsed = parse(text)
  const result = 'value' in parsed ? appendDecision(worktree, parsed.value) : parsed
  if (result.accepted) return 0
  writeError(`${JSON.stringify({ errors: result.errors })}\n`)
  return 1
}
