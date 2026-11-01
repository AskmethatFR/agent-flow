import { MAX_TEXT_LENGTH } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { applyStepEvent } from '@agent-flow/capture-shared/plan-writer'

const kindOf: ReadonlyMap<unknown, 'start' | 'finish'> = new Map([
  ['in_progress', 'start'],
  ['completed', 'finish'],
])

const asObject = (value: unknown): object => (typeof value === 'object' && value !== null ? value : {})

const field = (source: object, key: string): unknown => Reflect.get(source, key)

const parse = (input: string): object => {
  try {
    return asObject(JSON.parse(input))
  } catch {
    return {}
  }
}

export function captureStepTiming(
  input: string,
  projectDir: string | undefined,
  now: () => Date,
): ValidationResult | undefined {
  if (projectDir === undefined || projectDir === '' || input.length > MAX_TEXT_LENGTH) return undefined
  const payload = parse(input)
  if (field(payload, 'hook_event_name') !== 'PostToolUse' || field(payload, 'tool_name') !== 'TaskUpdate') {
    return undefined
  }
  const taskId = field(asObject(field(payload, 'tool_input')), 'taskId')
  const to = field(asObject(field(asObject(field(payload, 'tool_response')), 'statusChange')), 'to')
  if (typeof taskId !== 'string' || taskId === '') return undefined
  const kind = kindOf.get(to)
  if (kind === undefined) return undefined
  return applyStepEvent(projectDir, { kind, stepId: taskId, at: now().toISOString() })
}
