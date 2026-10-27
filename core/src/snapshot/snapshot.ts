import { MAX_TEXT_LENGTH } from '../contracts/contract-error'
import type { ContractError } from '../contracts/contract-error'
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

export type SnapshotStep = {
  readonly id: string
  readonly title: string
  readonly role: string
  readonly status: 'todo' | 'in_progress' | 'done'
  readonly origin: 'planned' | 'proposed'
  readonly timeSpent: TimeSpent | null
}

export type Snapshot = {
  readonly issue: string | null
  readonly title: string | null
  readonly steps: readonly SnapshotStep[]
  readonly currentStepId: string | null
  readonly errors: readonly ContractError[]
}

const toSnapshotStep = (step: PlanStep, now: Date): SnapshotStep => ({
  id: step.id,
  title: step.title,
  role: step.role,
  status: step.status,
  origin: step.origin,
  timeSpent: timeSpentOf(step, now),
})

const startOf = (step: PlanStep): number => instantOf(step.startedAt) ?? Number.NEGATIVE_INFINITY

const currentStepIdOf = (steps: readonly PlanStep[]): string | null => {
  let current: PlanStep | null = null
  for (const step of steps) {
    if (step.status === 'in_progress' && (current === null || startOf(step) > startOf(current))) {
      current = step
    }
  }
  return current?.id ?? null
}

const unavailableMessages: Record<FileUnavailable['unavailable'], string> = {
  missing: 'is missing',
  unreadable: 'cannot be read',
  'too-large': `exceeds ${MAX_TEXT_LENGTH} characters`,
}

const readPlanFile = (planFile: AgentFlowFile): ReadPlanResult =>
  typeof planFile === 'string'
    ? readPlan(planFile)
    : {
        accepted: false,
        errors: [
          {
            file: 'plan.json',
            location: null,
            field: null,
            message: unavailableMessages[planFile.unavailable],
          },
        ],
      }

export const buildSnapshot = (files: SnapshotFiles, now: Date): Snapshot => {
  const result = readPlanFile(files.plan)
  if (!result.accepted) {
    return { issue: null, title: null, steps: [], currentStepId: null, errors: result.errors }
  }
  const { plan } = result
  return {
    issue: plan.issue,
    title: plan.title,
    steps: plan.steps.map((step) => toSnapshotStep(step, now)),
    currentStepId: currentStepIdOf(plan.steps),
    errors: [],
  }
}
