import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { createPlan, planNamesIssue } from '@agent-flow/core/lifecycle'
import { alreadyExists, createAtomically } from '../shared/atomic-write'
import type { CreateIo } from '../shared/atomic-write'
import {
  attempt,
  confirmAgentFlowDirectory,
  inspectAgentFlowDirectory,
  isConfinableWorktree,
  readPlan,
  refusalFor,
  resolveWorktree,
} from '../shared/confinement'
import type { ReadIo } from '../shared/confinement'

export type PlanSeederIo = CreateIo & ReadIo

type Seeder = (worktree: string, issue: string, title: string) => ValidationResult

const refuse = refusalFor('plan.json')

export const isExistingPlanRefusal = (result: ValidationResult): boolean =>
  !result.accepted && result.errors.map((error) => error.message).includes(alreadyExists)

const namesIssue = (io: ReadIo, planPath: string, issue: string): boolean => {
  const existing = readPlan(io, planPath)
  return 'text' in existing && planNamesIssue(existing.text, issue)
}

export function createPlanSeeder(io: PlanSeederIo): Seeder {
  return function seedPlan(worktree, issue, title) {
    const plan = createPlan(issue, title)
    if (!plan.accepted) return plan
    if (!isConfinableWorktree(worktree)) {
      return refuse('worktree must be an absolute path without . or .. segments')
    }
    const realWorktree = resolveWorktree(worktree, refuse)
    if (typeof realWorktree !== 'string') return realWorktree
    const directory = join(realWorktree, '.agent-flow')
    attempt(() => mkdirSync(directory))
    const directoryRefusal = inspectAgentFlowDirectory(directory, refuse)
    if (directoryRefusal !== undefined) return directoryRefusal
    const planPath = join(directory, 'plan.json')
    const created = createAtomically(io, directory, planPath, plan.plan, 0o666)
    if (!isExistingPlanRefusal(created)) return created
    const unconfirmed = confirmAgentFlowDirectory(directory, refuse)
    if (unconfirmed !== undefined) return unconfirmed
    return namesIssue(io, planPath, issue) ? { accepted: true } : created
  }
}
