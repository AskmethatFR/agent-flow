import { MAX_TEXT_LENGTH } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { applyStepEvent } from '@agent-flow/capture-shared/plan-writer'

const MAX_TODOS = 64

const asObject = (value: unknown): object => (typeof value === 'object' && value !== null ? value : {})

const field = (source: object, key: string): unknown => Reflect.get(source, key)

const isKey = (value: unknown): value is string =>
  typeof value === 'string' && value !== '' && value.length <= MAX_TEXT_LENGTH

const contentsWith = (todos: readonly unknown[], status: string): string[] =>
  todos
    .slice(0, MAX_TODOS)
    .map(asObject)
    .filter((todo) => field(todo, 'status') === status)
    .map((todo) => field(todo, 'content'))
    .filter(isKey)

export function captureStepTiming(
  event: unknown,
  worktree: string | undefined,
  now: () => Date,
): readonly ValidationResult[] | undefined {
  if (worktree === undefined || worktree === '') return undefined
  const call = asObject(event)
  if (field(call, 'tool') !== 'todowrite' || field(call, 'status') !== 'completed') return undefined
  const todos = field(asObject(field(call, 'input')), 'todos')
  if (!Array.isArray(todos)) return undefined
  const at = now().toISOString()
  return [
    ...contentsWith(todos, 'completed').map((stepId) => applyStepEvent(worktree, { kind: 'finish', stepId, at })),
    ...contentsWith(todos, 'in_progress').map((stepId) => applyStepEvent(worktree, { kind: 'start', stepId, at })),
  ]
}
