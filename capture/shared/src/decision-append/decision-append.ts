import { join } from 'node:path'
import { serializeDecision } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { decisionStepOf } from '@agent-flow/core/lifecycle'
import { appendLine } from '../shared/confined-append'
import type { AppendIo } from '../shared/confined-append'
import {
  inspectAgentFlowDirectory,
  isConfinableWorktree,
  readPlan,
  refusalFor,
  resolveWorktree,
} from '../shared/confinement'

export type DecisionAppenderIo = AppendIo

type Appender = (worktree: string, decision: unknown) => ValidationResult

const refuse = refusalFor('decisions.jsonl')

type Completed = { readonly decision: unknown }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const withDecisionStep = (
  io: DecisionAppenderIo,
  directory: string,
  decision: unknown,
): Completed | ValidationResult => {
  if (!isRecord(decision)) return { decision }
  const plan = readPlan(io, join(directory, 'plan.json'))
  if ('accepted' in plan) return plan
  const resolved = decisionStepOf(plan.text, decision.role)
  if (!resolved.accepted) return resolved
  if (!Object.hasOwn(decision, 'step')) return { decision: { ...decision, step: resolved.stepId } }
  if (decision.step !== resolved.stepId) return refuse('is not the step in progress', 'step')
  return { decision }
}

export function createDecisionAppender(io: DecisionAppenderIo): Appender {
  return function appendDecision(worktree, decision) {
    if (!isConfinableWorktree(worktree)) {
      return refuse('worktree must be an absolute path without . or .. segments')
    }
    const realWorktree = resolveWorktree(worktree, refuse)
    if (typeof realWorktree !== 'string') return realWorktree
    const directory = join(realWorktree, '.agent-flow')
    const directoryRefusal = inspectAgentFlowDirectory(directory, refuse)
    if (directoryRefusal !== undefined) return directoryRefusal
    const completed = withDecisionStep(io, directory, decision)
    if (!('decision' in completed)) return completed
    const serialized = serializeDecision(completed.decision)
    if (!serialized.accepted) return { accepted: false, errors: [serialized.error] }
    return appendLine(io, directory, join(directory, 'decisions.jsonl'), serialized.line, refuse)
  }
}
