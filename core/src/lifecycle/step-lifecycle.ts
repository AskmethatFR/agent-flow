import { safeLabel } from '../contracts/contract-error'
import type { ContractError } from '../contracts/contract-error'
import { validatePlan } from '../contracts/plan'
import { instantTime } from './instant'
import { ROLE_IDS } from './roles'

export type StepLifecycleResult =
  | { readonly accepted: true; readonly plan: string }
  | { readonly accepted: false; readonly errors: readonly [ContractError, ...ContractError[]] }

type Step = {
  readonly id: string
  readonly title: string
  readonly role: string
  readonly status: string
  readonly origin: 'planned' | 'proposed'
  readonly startedAt: string | null
  readonly endedAt: string | null
}

type Plan = { readonly issue: string; readonly steps: readonly Step[] }

type Transition = {
  readonly atField: 'startedAt' | 'endedAt'
  readonly requiredStatus: string
  readonly statusMessage: string
  readonly staleEndMessage: (step: Step) => string | undefined
  readonly timeError: (step: Step, location: string, atTime: number) => ContractError | undefined
  readonly apply: (step: Step, at: string) => Step
}

const file = 'plan.json'
const notInstant = 'must be an ISO-8601 UTC instant'
const issuePattern = /^[1-9][0-9]{0,9}$/
const issueRef = (issue: string): string => `#${issue}`
const roleOfItem = new RegExp(`^(${ROLE_IDS.join('|')}): (.+)$`)

const refused = (
  location: string | null,
  field: string | null,
  message: string,
): StepLifecycleResult => ({ accepted: false, errors: [{ file, location, field, message }] })

const labelOf = (step: Step, index: number): string => safeLabel(step.id) ?? `steps[${index}]`

const closed = (step: Step, at: string): Step => ({ ...step, status: 'done', endedAt: at })

const endError = (step: Step, location: string, atTime: number): ContractError | undefined => {
  const startedTime = instantTime(step.startedAt)
  if (Number.isNaN(startedTime)) return { file, location, field: 'startedAt', message: notInstant }
  if (atTime < startedTime) {
    return { file, location, field: 'endedAt', message: 'must not be earlier than startedAt' }
  }
  return undefined
}

const emit = (document: object, steps: readonly Step[]): StepLifecycleResult => {
  const text = `${JSON.stringify({ ...document, steps }, null, 2)}\n`
  const readBack = validatePlan(text)
  return readBack.accepted ? { accepted: true, plan: text } : readBack
}

const starting: Transition = {
  atField: 'startedAt',
  requiredStatus: 'todo',
  statusMessage: 'must be todo to start',
  staleEndMessage: (step) => (step.endedAt === null ? undefined : 'must be null to start'),
  timeError: () => undefined,
  apply: (step, at) => ({ ...step, status: 'in_progress', startedAt: at }),
}

const finishing: Transition = {
  atField: 'endedAt',
  requiredStatus: 'in_progress',
  statusMessage: 'must be in_progress to finish',
  staleEndMessage: () => undefined,
  timeError: endError,
  apply: closed,
}

const reworkPattern = /^\.rework-([1-9][0-9]{0,8})$/

const reworkNumber = (parentId: string, candidate: Step): number => {
  if (!candidate.id.startsWith(parentId)) return 0
  const digits = reworkPattern.exec(candidate.id.slice(parentId.length))?.[1]
  return digits === undefined ? 0 : Number(digits)
}

const isReworkInProgress = (parent: Step, candidate: Step): boolean => {
  const number = reworkNumber(parent.id, candidate)
  return (
    candidate.status === 'in_progress' &&
    number > 0 &&
    candidate.role === parent.role &&
    candidate.origin === 'proposed' &&
    candidate.title === `${parent.title} (rework ${number})`
  )
}

const reworkInProgressIndex = (steps: readonly Step[], parent: Step): number =>
  steps.findIndex((candidate) => isReworkInProgress(parent, candidate))

const reworkOf = (parent: Step, number: number, at: string): Step => ({
  id: `${parent.id}.rework-${number}`,
  title: `${parent.title} (rework ${number})`,
  role: parent.role,
  status: 'in_progress',
  origin: 'proposed',
  startedAt: at,
  endedAt: null,
})

type Located = {
  readonly document: Plan
  readonly index: number
  readonly step: Step
  readonly location: string
  readonly atTime: number
}

function locate(
  plan: string,
  stepId: string,
  at: string,
  atField: Transition['atField'],
): Located | StepLifecycleResult {
  if (typeof plan !== 'string') return refused(null, null, 'must be a string')
  const input = validatePlan(plan)
  if (!input.accepted) return input
  const document = JSON.parse(plan) as Plan
  const index = document.steps.findIndex((step) => step.id === stepId)
  const step = document.steps[index]
  if (step === undefined) return refused(safeLabel(stepId), 'id', 'is not a step of this plan')
  const location = labelOf(step, index)
  const atTime = instantTime(at)
  if (Number.isNaN(atTime)) return refused(location, atField, notInstant)
  return { document, index, step, location, atTime }
}

function transit(
  { document, index, step, location, atTime }: Located,
  at: string,
  transition: Transition,
): StepLifecycleResult {
  if (step.status !== transition.requiredStatus) {
    return refused(location, 'status', transition.statusMessage)
  }
  const staleEnd = transition.staleEndMessage(step)
  if (staleEnd !== undefined) return refused(location, 'endedAt', staleEnd)
  const timeError = transition.timeError(step, location, atTime)
  if (timeError !== undefined) return { accepted: false, errors: [timeError] }
  const steps = document.steps.map((candidate, position) =>
    position === index ? transition.apply(candidate, at) : candidate,
  )
  return emit(document, steps)
}

function startRework({ document, step, location }: Located, at: string): StepLifecycleResult {
  if (reworkInProgressIndex(document.steps, step) >= 0) {
    return refused(location, 'status', 'is already being reworked')
  }
  const highest = Math.max(0, ...document.steps.map((candidate) => reworkNumber(step.id, candidate)))
  return emit(document, [...document.steps, reworkOf(step, highest + 1, at)])
}

function reworkTarget(located: Located): Located {
  const { document, step } = located
  if (step.status !== 'done') return located
  const index = reworkInProgressIndex(document.steps, step)
  const rework = document.steps[index]
  if (rework === undefined) return located
  return { ...located, index, step: rework, location: labelOf(rework, index) }
}

export function createPlan(issue: string, title: string): StepLifecycleResult {
  if (typeof issue !== 'string' || !issuePattern.test(issue)) {
    return refused(null, 'issue', 'must be a number of 1 to 10 digits without leading zero')
  }
  if (typeof title !== 'string' || title.trim() === '') {
    return refused(null, 'title', 'must not be blank')
  }
  return emit({ issue: issueRef(issue), title }, [])
}

export function planNamesIssue(plan: string, issue: string): boolean {
  return (
    typeof plan === 'string' &&
    issuePattern.test(issue) &&
    validatePlan(plan).accepted &&
    (JSON.parse(plan) as Plan).issue === issueRef(issue)
  )
}

export function addStep(plan: string, stepId: string, itemTitle: string): StepLifecycleResult {
  if (typeof plan !== 'string') return refused(null, null, 'must be a string')
  const input = validatePlan(plan)
  if (!input.accepted) return input
  if (typeof stepId !== 'string') return refused(null, 'id', 'must be text')
  if (typeof itemTitle !== 'string') return refused(safeLabel(stepId), 'title', 'must be text')
  const document = JSON.parse(plan) as Plan
  if (document.steps.some((step) => step.id === stepId)) return { accepted: true, plan }
  const parsed = roleOfItem.exec(itemTitle)
  const role = parsed?.[1] ?? ''
  const title = parsed?.[2] ?? itemTitle
  const origin = document.steps.every((step) => step.status === 'todo') ? 'planned' : 'proposed'
  const added: Step = { id: stepId, title, role, status: 'todo', origin, startedAt: null, endedAt: null }
  return emit(document, [...document.steps, added])
}

export function startStep(plan: string, stepId: string, at: string): StepLifecycleResult {
  const located = locate(plan, stepId, at, starting.atField)
  if ('accepted' in located) return located
  return located.step.status === 'done' ? startRework(located, at) : transit(located, at, starting)
}

export function finishStep(plan: string, stepId: string, at: string): StepLifecycleResult {
  const located = locate(plan, stepId, at, finishing.atField)
  if ('accepted' in located) return located
  return transit(reworkTarget(located), at, finishing)
}
