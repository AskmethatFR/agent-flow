import { lstatSync, mkdirSync } from 'node:fs'
import type * as NodeFs from 'node:fs'
import { join } from 'node:path'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { addStep, finishStep, startStep } from '@agent-flow/core/lifecycle'
import type { StepLifecycleResult } from '@agent-flow/core/lifecycle'
import { replaceAtomically } from '../shared/atomic-write'
import {
  attempt,
  codeOf,
  isConfinableWorktree,
  readPlan,
  refusalFor,
  resolveWorktree,
} from '../shared/confinement'
import type { Rejected } from '../shared/confinement'
import { defaultLockPolicy, lockFileName, withLock } from '../shared/plan-lock'
import type { LockPolicy } from '../shared/plan-lock'

export type StepEvent = {
  readonly kind: 'start' | 'finish'
  readonly stepId: string
  readonly at: string
}

export type PlanWriterIo = Pick<
  typeof NodeFs,
  'openSync' | 'readSync' | 'writeSync' | 'fsyncSync' | 'closeSync' | 'renameSync' | 'unlinkSync'
> & { readonly temporaryName: () => string }

export type NewStep = {
  readonly stepId: string
  readonly title: string
}

export type PlanOperation = ({ readonly kind: 'add' } & NewStep) | StepEvent

type Applier = (worktree: string, event: StepEvent) => ValidationResult

type StepAdder = (worktree: string, step: NewStep) => ValidationResult

type BatchWriter = (worktree: string, operations: readonly PlanOperation[]) => ValidationResult[]

const refuse = refusalFor('plan.json')

const inspectDirectory = (directory: string): ValidationResult | undefined => {
  let isDirectory: boolean
  try {
    isDirectory = lstatSync(directory).isDirectory()
  } catch (error) {
    if (codeOf(error) !== 'ENOENT') return refuse('cannot be read')
    attempt(() => mkdirSync(directory))
    return refuse('is missing')
  }
  return isDirectory ? undefined : refuse('.agent-flow must be a real directory')
}

type Transform = (current: string) => StepLifecycleResult

const readModifyWrite = (io: PlanWriterIo, directory: string, transform: Transform): ValidationResult => {
  const planPath = join(directory, 'plan.json')
  const current = readPlan(io, planPath)
  if ('accepted' in current) return current
  const result = transform(current.text)
  if (!result.accepted) return result
  if (result.plan === current.text) return { accepted: true }
  return replaceAtomically(io, directory, planPath, result.plan, current.mode)
}

const confine = (worktree: string): string | ValidationResult => {
  if (!isConfinableWorktree(worktree)) {
    return refuse('worktree must be an absolute path without . or .. segments')
  }
  const realWorktree = resolveWorktree(worktree, refuse)
  if (typeof realWorktree !== 'string') return realWorktree
  const directory = join(realWorktree, '.agent-flow')
  return inspectDirectory(directory) ?? directory
}

const isTransform = (prepared: Transform | Rejected): prepared is Transform => typeof prepared === 'function'

const updatePlans = (
  io: PlanWriterIo,
  policy: LockPolicy,
  worktree: string,
  prepared: readonly (Transform | Rejected)[],
): ValidationResult[] => {
  if (!prepared.some(isTransform)) return prepared as Rejected[]
  const failure = (refusal: ValidationResult): ValidationResult[] =>
    prepared.map((entry) => (isTransform(entry) ? refusal : entry))
  const directory = confine(worktree)
  if (typeof directory !== 'string') return failure(directory)
  const results: ValidationResult[] = []
  const locked = withLock(join(directory, lockFileName), policy, refuse, () => {
    for (const entry of prepared) {
      results.push(isTransform(entry) ? readModifyWrite(io, directory, entry) : entry)
    }
    return { accepted: true }
  })
  return locked.accepted ? results : failure(locked)
}

const transitionOf = (event: StepEvent): Transform | Rejected => {
  if (event?.kind !== 'start' && event?.kind !== 'finish') {
    return refuse('must be start or finish', 'kind')
  }
  const transition = event.kind === 'start' ? startStep : finishStep
  return (text) => transition(text, event.stepId, event.at)
}

const additionOf =
  (step: NewStep): Transform =>
  (text) =>
    addStep(text, step?.stepId, step?.title)

const updateOne = (
  io: PlanWriterIo,
  policy: LockPolicy,
  worktree: string,
  prepared: Transform | Rejected,
): ValidationResult => updatePlans(io, policy, worktree, [prepared])[0] as ValidationResult

export function createPlanWriter(io: PlanWriterIo, policy: LockPolicy = defaultLockPolicy): Applier {
  return function applyStepEvent(worktree, event) {
    return updateOne(io, policy, worktree, transitionOf(event))
  }
}

export function createPlanStepAdder(io: PlanWriterIo, policy: LockPolicy = defaultLockPolicy): StepAdder {
  return function addPlanStep(worktree, step) {
    return updateOne(io, policy, worktree, additionOf(step))
  }
}

export function createPlanBatchWriter(io: PlanWriterIo, policy: LockPolicy = defaultLockPolicy): BatchWriter {
  return function applyPlanOperations(worktree, operations) {
    return updatePlans(
      io,
      policy,
      worktree,
      operations.map((operation) => (operation.kind === 'add' ? additionOf(operation) : transitionOf(operation))),
    )
  }
}
