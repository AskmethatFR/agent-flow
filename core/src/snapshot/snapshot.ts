import { MAX_TEXT_LENGTH, capErrors } from '../contracts/contract-error'
import type { ContractError } from '../contracts/contract-error'
import { readLocatedDecisions } from '../contracts/decisions'
import { readPlan } from '../contracts/plan'
import type { PlanStep, ReadPlanResult } from '../contracts/plan'
import { instantOf, timeSpentOf } from './time-spent'
import type { TimeSpent } from './time-spent'

export type FileUnavailable = {
  readonly unavailable: 'missing' | 'unreadable' | 'too-large'
}

export type AgentFlowFile = string | FileUnavailable

export type SnapshotFiles = {
  readonly plan: AgentFlowFile
  readonly decisions?: AgentFlowFile
}

export type SnapshotDecision = {
  readonly title: string
  readonly why: string
  readonly rejected: readonly string[]
  readonly role: string
  readonly confidence: 'high' | 'medium' | 'low'
}

export type SnapshotStep = {
  readonly id: string
  readonly title: string
  readonly role: string
  readonly status: 'todo' | 'in_progress' | 'done'
  readonly origin: 'planned' | 'proposed'
  readonly timeSpent: TimeSpent | null
  readonly decisions: readonly SnapshotDecision[]
}

export type Snapshot = {
  readonly issue: string | null
  readonly title: string | null
  readonly steps: readonly SnapshotStep[]
  readonly currentStepId: string | null
  readonly errors: readonly ContractError[]
}

const toSnapshotStep = (
  step: PlanStep,
  now: Date,
  decisions: readonly SnapshotDecision[],
): SnapshotStep => ({
  id: step.id,
  title: step.title,
  role: step.role,
  status: step.status,
  origin: step.origin,
  timeSpent: timeSpentOf(step, now),
  decisions,
})

const startOf = (step: PlanStep): number => instantOf(step.startedAt) ?? Number.NEGATIVE_INFINITY

const currentStepIdOf = (steps: readonly PlanStep[]): string | null => {
  let current: PlanStep | null = null
  let currentStart = Number.NEGATIVE_INFINITY
  for (const step of steps) {
    if (step.status !== 'in_progress') continue
    const start = startOf(step)
    if (current === null || start > currentStart) {
      current = step
      currentStart = start
    }
  }
  return current?.id ?? null
}

const unavailableMessages: Record<FileUnavailable['unavailable'], string> = {
  missing: 'is missing',
  unreadable: 'cannot be read',
  'too-large': `exceeds ${MAX_TEXT_LENGTH} characters`,
}

const unavailableError = (file: string, code: FileUnavailable['unavailable']): ContractError => ({
  file,
  location: null,
  field: null,
  message: unavailableMessages[code],
})

const readPlanFile = (planFile: AgentFlowFile): ReadPlanResult =>
  typeof planFile === 'string'
    ? readPlan(planFile)
    : { accepted: false, errors: [unavailableError('plan.json', planFile.unavailable)] }

const decisionsFile = 'decisions.jsonl'

type GroupedDecisions = {
  readonly byStep: ReadonlyMap<string, readonly SnapshotDecision[]>
  readonly errors: readonly ContractError[]
}

const groupDecisions = (
  stepIds: readonly string[],
  file: AgentFlowFile | undefined,
): GroupedDecisions => {
  const grouped = new Map<string, SnapshotDecision[]>(stepIds.map((id) => [id, []]))
  if (file === undefined || (typeof file !== 'string' && file.unavailable === 'missing')) {
    return { byStep: grouped, errors: [] }
  }
  if (typeof file !== 'string') {
    return { byStep: grouped, errors: [unavailableError(decisionsFile, file.unavailable)] }
  }
  const { entries, errors } = readLocatedDecisions(file)
  const orphans: ContractError[] = []
  for (const { decision, location } of entries) {
    const bucket = grouped.get(decision.step)
    if (bucket === undefined) {
      orphans.push({ file: decisionsFile, location, field: 'step', message: 'is not a step of plan.json' })
      continue
    }
    bucket.push({
      title: decision.title,
      why: decision.why,
      rejected: decision.rejected ?? [],
      role: decision.role,
      confidence: decision.confidence,
    })
  }
  return { byStep: grouped, errors: [...errors, ...capErrors(decisionsFile, orphans)] }
}

export const buildSnapshot = (files: SnapshotFiles, now: Date): Snapshot => {
  const result = readPlanFile(files.plan)
  if (!result.accepted) {
    return { issue: null, title: null, steps: [], currentStepId: null, errors: result.errors }
  }
  const { plan } = result
  const { byStep, errors } = groupDecisions(
    plan.steps.map((step) => step.id),
    files.decisions,
  )
  return {
    issue: plan.issue,
    title: plan.title,
    steps: plan.steps.map((step) => toSnapshotStep(step, now, byStep.get(step.id) ?? [])),
    currentStepId: currentStepIdOf(plan.steps),
    errors,
  }
}
