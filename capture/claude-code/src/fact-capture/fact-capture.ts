import { MAX_TEXT_LENGTH } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { appendFact } from '@agent-flow/capture-shared/fact-append'
import { isVitestCommand } from './vitest-command'

const asObject = (value: unknown): object => (typeof value === 'object' && value !== null ? value : {})

const field = (source: object, key: string): unknown => Reflect.get(source, key)

const parse = (input: string): object => {
  try {
    return asObject(JSON.parse(input))
  } catch {
    return {}
  }
}

// The host delivers a passing run as PostToolUse and a failing one as PostToolUseFailure, which
// has no tool_response and carries is_interrupt. A PostToolUse that carries backgroundTaskId is a
// run moved to the background: it has not ended
// (docs/technical/decisions/evidence/verified-facts/capture-128/run.txt).
const endedRun = (payload: object): boolean => {
  const event = field(payload, 'hook_event_name')
  if (event === 'PostToolUseFailure') return field(payload, 'is_interrupt') === false
  const response = asObject(field(payload, 'tool_response'))
  return (
    event === 'PostToolUse' &&
    field(response, 'interrupted') === false &&
    !Object.hasOwn(response, 'backgroundTaskId')
  )
}

// duration_ms is the length of the run: a safe non-negative integer, or the run is not observed.
const isDuration = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0

export function captureFact(
  input: string,
  projectDir: string | undefined,
  now: () => Date,
): ValidationResult | undefined {
  if (projectDir === undefined || projectDir === '' || input.length > MAX_TEXT_LENGTH) return undefined
  const payload = parse(input)
  if (field(payload, 'tool_name') !== 'Bash' || !endedRun(payload)) return undefined
  if (!isVitestCommand(field(asObject(field(payload, 'tool_input')), 'command'))) return undefined
  const durationMs = field(payload, 'duration_ms')
  if (!isDuration(durationMs)) return undefined
  return appendFact(projectDir, { agentType: field(payload, 'agent_type'), at: now().toISOString(), durationMs })
}
