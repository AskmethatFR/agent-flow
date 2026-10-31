import { capErrors, safeLabel } from '../contracts/contract-error'
import type { ContractError } from '../contracts/contract-error'
import { validatePlan } from '../contracts/plan'

export type StepLifecycleResult =
  | { readonly accepted: true; readonly plan: string }
  | { readonly accepted: false; readonly errors: readonly [ContractError, ...ContractError[]] }

type Step = {
  readonly id: string
  readonly status: string
  readonly startedAt: string | null
  readonly endedAt: string | null
}

type Plan = { readonly steps: readonly Step[] }

type Transition = {
  readonly atField: 'startedAt' | 'endedAt'
  readonly requiredStatus: string
  readonly statusMessage: string
  readonly closes: (step: Step, position: number, index: number) => boolean
  readonly apply: (step: Step, at: string) => Step
}

const file = 'plan.json'
const notInstant = 'must be an ISO-8601 UTC instant'

const refused = (
  location: string | null,
  field: string | null,
  message: string,
): StepLifecycleResult => ({ accepted: false, errors: [{ file, location, field, message }] })

const instantTime = (value: unknown): number => {
  if (typeof value !== 'string') return Number.NaN
  const milliseconds = Date.parse(value)
  if (Number.isNaN(milliseconds)) return Number.NaN
  const canonical = new Date(milliseconds).toISOString()
  const isInstant = value === canonical || value === canonical.replace('.000Z', 'Z')
  return isInstant ? milliseconds : Number.NaN
}

const labelOf = (step: Step, index: number): string => safeLabel(step.id) ?? `steps[${index}]`

const closed = (step: Step, at: string): Step => ({ ...step, status: 'done', endedAt: at })

const closingError = (step: Step, index: number, atTime: number): ContractError[] => {
  const location = labelOf(step, index)
  const startedTime = instantTime(step.startedAt)
  if (Number.isNaN(startedTime)) return [{ file, location, field: 'startedAt', message: notInstant }]
  if (atTime < startedTime) {
    return [{ file, location, field: 'endedAt', message: 'must not be earlier than startedAt' }]
  }
  return []
}

const emit = (document: Plan, steps: readonly Step[]): StepLifecycleResult => {
  const text = `${JSON.stringify({ ...document, steps }, null, 2)}\n`
  const readBack = validatePlan(text)
  return readBack.accepted ? { accepted: true, plan: text } : readBack
}

const starting: Transition = {
  atField: 'startedAt',
  requiredStatus: 'todo',
  statusMessage: 'must be todo to start',
  closes: (step) => step.status === 'in_progress',
  apply: (step, at) => ({ ...step, status: 'in_progress', startedAt: at }),
}

const finishing: Transition = {
  atField: 'endedAt',
  requiredStatus: 'in_progress',
  statusMessage: 'must be in_progress to finish',
  closes: (_step, position, index) => position === index,
  apply: closed,
}

function applyTransition(
  plan: string,
  stepId: string,
  at: string,
  transition: Transition,
): StepLifecycleResult {
  if (typeof plan !== 'string') return refused(null, null, 'must be a string')
  const input = validatePlan(plan)
  if (!input.accepted) return input
  const document = JSON.parse(plan) as Plan
  const index = document.steps.findIndex((step) => step.id === stepId)
  const step = document.steps[index]
  if (step === undefined) return refused(safeLabel(stepId), 'id', 'is not a step of this plan')
  const location = labelOf(step, index)
  const atTime = instantTime(at)
  if (Number.isNaN(atTime)) return refused(location, transition.atField, notInstant)
  if (step.status !== transition.requiredStatus) {
    return refused(location, 'status', transition.statusMessage)
  }
  const closes = (candidate: Step, position: number): boolean =>
    transition.closes(candidate, position, index)
  const [first, ...rest] = capErrors(
    file,
    document.steps.flatMap((candidate, position) =>
      closes(candidate, position) ? closingError(candidate, position, atTime) : [],
    ),
  )
  if (first !== undefined) return { accepted: false, errors: [first, ...rest] }
  const steps = document.steps.map((candidate, position) => {
    if (position === index) return transition.apply(candidate, at)
    return closes(candidate, position) ? closed(candidate, at) : candidate
  })
  return emit(document, steps)
}

export function startStep(plan: string, stepId: string, at: string): StepLifecycleResult {
  return applyTransition(plan, stepId, at, starting)
}

export function finishStep(plan: string, stepId: string, at: string): StepLifecycleResult {
  return applyTransition(plan, stepId, at, finishing)
}
