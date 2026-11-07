import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { createPlan } from '@agent-flow/core/lifecycle'
import { createAtomically } from '../shared/atomic-write'
import type { CreateIo } from '../shared/atomic-write'
import {
  attempt,
  inspectAgentFlowDirectory,
  isConfinableWorktree,
  refusalFor,
  resolveWorktree,
} from '../shared/confinement'

export type PlanSeederIo = CreateIo

type Seeder = (worktree: string, issue: string, title: string) => ValidationResult

const refuse = refusalFor('plan.json')

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
    return createAtomically(io, directory, join(directory, 'plan.json'), plan.plan, 0o666)
  }
}
