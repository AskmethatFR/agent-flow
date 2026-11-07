import { MAX_TEXT_LENGTH } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { applyPlanOperations } from '@agent-flow/capture-shared/plan-writer'
import type { PlanOperation } from '@agent-flow/capture-shared/plan-writer'

const MAX_TODOS = 64

const asObject = (value: unknown): object => (typeof value === 'object' && value !== null ? value : {})

const field = (source: object, key: string): unknown => Reflect.get(source, key)

const isKey = (value: unknown): value is string =>
  typeof value === 'string' && value !== '' && value.length <= MAX_TEXT_LENGTH

const contentsWhere = (todos: readonly unknown[], accepts: (status: unknown) => boolean): string[] =>
  todos
    .slice(0, MAX_TODOS)
    .map(asObject)
    .filter((todo) => accepts(field(todo, 'status')))
    .map((todo) => field(todo, 'content'))
    .filter(isKey)

const contentsWith = (todos: readonly unknown[], status: string): string[] =>
  contentsWhere(todos, (actual) => actual === status)

const allContents = (todos: readonly unknown[]): string[] => contentsWhere(todos, () => true)

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
  return applyPlanOperations(worktree, [
    ...allContents(todos).map((stepId): PlanOperation => ({ kind: 'add', stepId, title: stepId })),
    ...contentsWith(todos, 'completed').map((stepId): PlanOperation => ({ kind: 'finish', stepId, at })),
    ...contentsWith(todos, 'in_progress').map((stepId): PlanOperation => ({ kind: 'start', stepId, at })),
  ])
}
