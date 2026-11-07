import type { ContractError } from '../contracts/contract-error'
import { readPlan } from '../contracts/plan'
import type { PlanStep } from '../contracts/plan'
import { instantTime } from './instant'

export type DecisionStepResult =
  | { readonly accepted: true; readonly stepId: string }
  | { readonly accepted: false; readonly errors: readonly [ContractError, ...ContractError[]] }

const refused = (field: string, message: string): DecisionStepResult => ({
  accepted: false,
  errors: [{ file: 'decisions.jsonl', location: null, field, message }],
})

const startOf = (step: PlanStep): number => {
  const start = instantTime(step.startedAt)
  return Number.isNaN(start) ? Number.NEGATIVE_INFINITY : start
}

const latestStarted = (steps: readonly PlanStep[]): PlanStep | undefined => {
  let latest: PlanStep | undefined
  let latestStart = Number.NEGATIVE_INFINITY
  for (const step of steps) {
    const start = startOf(step)
    if (latest === undefined || start > latestStart) {
      latest = step
      latestStart = start
    }
  }
  return latest
}

export function decisionStepOf(plan: string, role: unknown): DecisionStepResult {
  const read = readPlan(plan)
  if (!read.accepted) return read
  const inProgress = read.plan.steps.filter((step) => step.status === 'in_progress')
  const own = latestStarted(inProgress.filter((step) => step.role === role))
  if (own !== undefined) return { accepted: true, stepId: own.id }
  const [only, ...others] = inProgress
  if (only === undefined) return refused('step', 'no step is in progress')
  if (others.length > 0) return refused('role', 'has no step in progress')
  return { accepted: true, stepId: only.id }
}
