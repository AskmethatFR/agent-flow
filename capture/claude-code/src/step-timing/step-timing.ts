import { MAX_TEXT_LENGTH } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { applyStepEvent } from '@agent-flow/capture-shared/plan-writer'

const kindOf: Readonly<Record<string, 'start' | 'finish'>> = {
  in_progress: 'start',
  completed: 'finish',
}

const objectIn = (value: unknown, key: string): Record<string, unknown> | undefined => {
  const child = (value as Record<string, unknown> | null | undefined)?.[key]
  return typeof child === 'object' && child !== null ? (child as Record<string, unknown>) : undefined
}

const parse = (input: string): unknown => {
  try {
    return JSON.parse(input)
  } catch {
    return undefined
  }
}

export function captureStepTiming(
  input: string,
  projectDir: string | undefined,
  now: () => Date,
): ValidationResult | undefined {
  if (projectDir === undefined || projectDir === '' || input.length > MAX_TEXT_LENGTH) return undefined
  const payload = parse(input) as Record<string, unknown> | null
  if (payload?.hook_event_name !== 'PostToolUse' || payload.tool_name !== 'TaskUpdate') return undefined
  const taskId = objectIn(payload, 'tool_input')?.taskId
  const to = objectIn(objectIn(payload, 'tool_response'), 'statusChange')?.to
  if (typeof taskId !== 'string' || taskId === '' || typeof to !== 'string') return undefined
  const kind = Object.hasOwn(kindOf, to) ? kindOf[to] : undefined
  if (kind === undefined) return undefined
  return applyStepEvent(projectDir, { kind, stepId: taskId, at: now().toISOString() })
}
