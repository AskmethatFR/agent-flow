import { displayStateOf } from '../agent-state/agent-state'
import type { AgentDisplayState } from '../agent-state/agent-state'
import { MAX_TEXT_LENGTH, capErrors } from '../contracts/contract-error'
import type { ContractError } from '../contracts/contract-error'
import { readLocatedDecisions } from '../contracts/decisions'
import { readPlan } from '../contracts/plan'
import type { PlanStep, ReadPlanResult } from '../contracts/plan'
import { instantOf, timeSpentOf } from './time-spent'
import type { TimeSpent } from './time-spent'

export const MAX_DECISIONS_PER_STEP = 50

export type FileUnavailable = {
  readonly unavailable: 'missing' | 'unreadable' | 'too-large'
}

export type AgentFlowFile = string | FileUnavailable

export type AgentStatusUnavailable = { readonly unavailable: 'host-error' }

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

export type SnapshotFact = {
  readonly origin: 'verified' | 'declared'
  readonly source: string
  readonly label: string
}

export type SnapshotStep = {
  readonly id: string
  readonly title: string
  readonly role: string
  readonly status: 'todo' | 'in_progress' | 'done'
  readonly origin: 'planned' | 'proposed'
  readonly timeSpent: TimeSpent | null
  readonly decisions: readonly SnapshotDecision[]
  readonly omittedDecisions: number
  readonly facts: readonly SnapshotFact[]
}

export type CurrentAgent = {
  readonly role: string
  readonly state: AgentDisplayState
}

export type Snapshot = {
  readonly issue: string | null
  readonly title: string | null
  readonly steps: readonly SnapshotStep[]
  readonly currentStepId: string | null
  readonly currentAgent: CurrentAgent | null
  readonly errors: readonly ContractError[]
}

const declaredFactOf = (decision: SnapshotDecision): SnapshotFact => ({
  origin: 'declared',
  source: decisionsFile,
  label: decision.title,
})

const toSnapshotStep = (
  step: PlanStep,
  now: Date,
  { decisions, omitted }: StepDecisions,
): SnapshotStep => ({
  id: step.id,
  title: step.title,
  role: step.role,
  status: step.status,
  origin: step.origin,
  timeSpent: timeSpentOf(step, now),
  decisions,
  omittedDecisions: omitted,
  facts: decisions.map(declaredFactOf),
})

const startOf = (step: PlanStep): number => instantOf(step.startedAt) ?? Number.NEGATIVE_INFINITY

const currentStepOf = (steps: readonly PlanStep[]): PlanStep | null => {
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
  return current
}

const currentAgentOf = (
  step: PlanStep | null,
  agentStatus: string | undefined,
): CurrentAgent | null =>
  step === null || agentStatus === undefined
    ? null
    : { role: step.role, state: displayStateOf(agentStatus) }

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

const agentStateMessages: Record<AgentStatusUnavailable['unavailable'], string> = {
  'host-error': 'cannot be read from the host',
}

const agentStateError = ({ unavailable }: AgentStatusUnavailable): ContractError => ({
  file: 'agent-state',
  location: null,
  field: null,
  message: agentStateMessages[unavailable],
})

const isStatusUnavailable = (
  agentStatus: string | AgentStatusUnavailable | undefined,
): agentStatus is AgentStatusUnavailable =>
  typeof agentStatus === 'object' && agentStatus !== null && agentStatus.unavailable === 'host-error'

const readPlanFile = (planFile: AgentFlowFile): ReadPlanResult =>
  typeof planFile === 'string'
    ? readPlan(planFile)
    : { accepted: false, errors: [unavailableError('plan.json', planFile.unavailable)] }

const decisionsFile = 'decisions.jsonl'

type StepDecisions = { readonly decisions: SnapshotDecision[]; omitted: number }

const emptyStepDecisions = (): StepDecisions => ({ decisions: [], omitted: 0 })

type GroupedDecisions = {
  readonly perStep: readonly { readonly step: PlanStep; readonly bucket: StepDecisions }[]
  readonly errors: readonly ContractError[]
}

const groupDecisions = (
  steps: readonly PlanStep[],
  file: AgentFlowFile | undefined,
): GroupedDecisions => {
  const buckets = steps.map((step) => ({ step, bucket: emptyStepDecisions() }))
  const grouped = new Map(buckets.map(({ step, bucket }) => [step.id, bucket] as const))
  if (file === undefined) return { perStep: buckets, errors: [] }
  if (typeof file !== 'string') {
    const errors = file.unavailable === 'missing' ? [] : [unavailableError(decisionsFile, file.unavailable)]
    return { perStep: buckets, errors }
  }
  const { entries, errors } = readLocatedDecisions(file)
  const orphans: ContractError[] = []
  for (const { decision, location } of entries) {
    const bucket = grouped.get(decision.step)
    if (bucket === undefined) {
      orphans.push({ file: decisionsFile, location, field: 'step', message: 'is not a step of plan.json' })
      continue
    }
    if (bucket.decisions.length === MAX_DECISIONS_PER_STEP) {
      bucket.omitted += 1
      continue
    }
    bucket.decisions.push({
      title: decision.title,
      why: decision.why,
      rejected: decision.rejected ?? [],
      role: decision.role,
      confidence: decision.confidence,
    })
  }
  return { perStep: buckets, errors: [...errors, ...capErrors(decisionsFile, orphans)] }
}

export const buildSnapshot = (
  files: SnapshotFiles,
  now: Date,
  agentStatus?: string | AgentStatusUnavailable,
): Snapshot => {
  const unavailable = isStatusUnavailable(agentStatus)
  const agentErrors = unavailable ? [agentStateError(agentStatus)] : []
  const status = unavailable ? undefined : agentStatus
  const result = readPlanFile(files.plan)
  if (!result.accepted) {
    return {
      issue: null,
      title: null,
      steps: [],
      currentStepId: null,
      currentAgent: null,
      errors: [...result.errors, ...agentErrors],
    }
  }
  const { plan } = result
  const { perStep, errors } = groupDecisions(plan.steps, files.decisions)
  const current = currentStepOf(plan.steps)
  return {
    issue: plan.issue,
    title: plan.title,
    steps: perStep.map(({ step, bucket }) => toSnapshotStep(step, now, bucket)),
    currentStepId: current?.id ?? null,
    currentAgent: currentAgentOf(current, status),
    errors: [...errors, ...agentErrors],
  }
}
