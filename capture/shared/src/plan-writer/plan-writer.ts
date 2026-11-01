import { constants, lstatSync, mkdirSync, realpathSync } from 'node:fs'
import type * as NodeFs from 'node:fs'
import { join } from 'node:path'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { finishStep, startStep } from '@agent-flow/core/lifecycle'
import {
  attempt,
  codeOf,
  isConfinableWorktree,
  readPlan,
  refusalFor,
  resolveWorktree,
} from '../shared/confinement'

export type StepEvent = {
  readonly kind: 'start' | 'finish'
  readonly stepId: string
  readonly at: string
}

export type PlanWriterIo = Pick<
  typeof NodeFs,
  'openSync' | 'readSync' | 'writeSync' | 'fsyncSync' | 'closeSync' | 'renameSync' | 'unlinkSync'
> & { readonly temporaryName: () => string }

type Applier = (worktree: string, event: StepEvent) => ValidationResult

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

const writeAtomically = (
  io: PlanWriterIo,
  directory: string,
  planPath: string,
  text: string,
  mode: number,
): ValidationResult => {
  const temporary = join(directory, `.plan.json.${io.temporaryName()}.tmp`)
  let fd: number | undefined
  let created = false
  const failed = (): ValidationResult => {
    if (fd !== undefined) attempt(() => io.closeSync(fd as number))
    if (created) attempt(() => io.unlinkSync(temporary))
    return refuse('cannot be written')
  }
  try {
    fd = io.openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode)
    created = true
    const bytes = Buffer.from(text)
    let offset = 0
    while (offset < bytes.length) offset += io.writeSync(fd, bytes, offset)
    io.fsyncSync(fd)
    const closing = fd
    fd = undefined
    io.closeSync(closing)
    if (realpathSync(directory) !== directory) return failed()
    io.renameSync(temporary, planPath)
    return { accepted: true }
  } catch {
    return failed()
  }
}

export function createPlanWriter(io: PlanWriterIo): Applier {
  return function applyStepEvent(worktree, event) {
    if (event?.kind !== 'start' && event?.kind !== 'finish') {
      return refuse('must be start or finish', 'kind')
    }
    if (!isConfinableWorktree(worktree)) {
      return refuse('worktree must be an absolute path without . or .. segments')
    }
    const realWorktree = resolveWorktree(worktree, refuse)
    if (typeof realWorktree !== 'string') return realWorktree
    const directory = join(realWorktree, '.agent-flow')
    const directoryRefusal = inspectDirectory(directory)
    if (directoryRefusal !== undefined) return directoryRefusal
    const planPath = join(directory, 'plan.json')
    const current = readPlan(io, planPath)
    if ('accepted' in current) return current
    const transition = event.kind === 'start' ? startStep : finishStep
    const result = transition(current.text, event.stepId, event.at)
    if (!result.accepted) return result
    return writeAtomically(io, directory, planPath, result.plan, current.mode)
  }
}
