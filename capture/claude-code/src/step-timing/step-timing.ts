import { MAX_TEXT_LENGTH } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { addPlanStep, applyStepEvent } from '@agent-flow/capture-shared/plan-writer'

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

const captureCreation = (payload: object, projectDir: string): ValidationResult | undefined => {
  const task = asObject(field(asObject(field(payload, 'tool_response')), 'task'))
  const stepId = field(task, 'id')
  const title = field(task, 'subject')
  if (typeof stepId !== 'string' || stepId === '' || typeof title !== 'string') return undefined
  return addPlanStep(projectDir, { stepId, title })
}

const captureUpdate = (
  payload: object,
  projectDir: string,
  now: () => Date,
): ValidationResult | undefined => {
  const taskId = field(asObject(field(payload, 'tool_input')), 'taskId')
  const to = field(asObject(field(asObject(field(payload, 'tool_response')), 'statusChange')), 'to')
  if (typeof taskId !== 'string' || taskId === '') return undefined
  const kind = kindOf.get(to)
  if (kind === undefined) return undefined
  return applyStepEvent(projectDir, { kind, stepId: taskId, at: now().toISOString() })
}

export function captureStepTiming(
  input: string,
  projectDir: string | undefined,
  now: () => Date,
): ValidationResult | undefined {
  if (projectDir === undefined || projectDir === '' || input.length > MAX_TEXT_LENGTH) return undefined
  const payload = parse(input)
  if (field(payload, 'hook_event_name') !== 'PostToolUse') return undefined
  const tool = field(payload, 'tool_name')
  if (tool === 'TaskCreate') return captureCreation(payload, projectDir)
  if (tool === 'TaskUpdate') return captureUpdate(payload, projectDir, now)
  return undefined
}
