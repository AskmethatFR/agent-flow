import {
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  realpathSync,
} from 'node:fs'
import type * as NodeFs from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { MAX_TEXT_LENGTH } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { finishStep, startStep } from '@agent-flow/core/lifecycle'

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

const notRegularFile = 'must be a regular file, not a link'
const readLimit = 4 * MAX_TEXT_LENGTH

const refuse = (message: string, field: string | null = null): ValidationResult => ({
  accepted: false,
  errors: [{ file: 'plan.json', location: null, field, message }],
})

const attempt = (action: () => void): void => {
  try {
    action()
  } catch {}
}

const codeOf = (error: unknown): unknown => (error as NodeJS.ErrnoException).code

const hasDotSegment = (path: string): boolean =>
  path.split('/').some((segment) => segment === '.' || segment === '..')

const isConfinableWorktree = (worktree: unknown): worktree is string =>
  typeof worktree === 'string' && isAbsolute(worktree) && !hasDotSegment(worktree)

const resolveWorktree = (worktree: string): string | ValidationResult => {
  try {
    return realpathSync(worktree)
  } catch {
    return refuse('worktree cannot be resolved')
  }
}

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

const openRefusal = (error: unknown): ValidationResult => {
  const code = codeOf(error)
  if (code === 'ENOENT') return refuse('is missing')
  if (code === 'ELOOP') return refuse(notRegularFile)
  return refuse('cannot be read')
}

const readBounded = (io: PlanWriterIo, fd: number): string | ValidationResult => {
  const buffer = Buffer.allocUnsafe(readLimit + 1)
  let total = 0
  for (;;) {
    const count = io.readSync(fd, buffer, total, buffer.length - total, null)
    if (count === 0) break
    total += count
  }
  return total > readLimit ? refuse('is too large') : buffer.toString('utf8', 0, total)
}

type PlanFile = { readonly text: string; readonly mode: number }

const readPlan = (io: PlanWriterIo, planPath: string): PlanFile | ValidationResult => {
  let fd: number
  try {
    fd = io.openSync(planPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (error) {
    return openRefusal(error)
  }
  try {
    const stats = fstatSync(fd)
    if (!stats.isFile()) return refuse(notRegularFile)
    const text = readBounded(io, fd)
    return typeof text === 'string' ? { text, mode: stats.mode & 0o777 } : text
  } catch {
    return refuse('cannot be read')
  } finally {
    attempt(() => io.closeSync(fd))
  }
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
    const realWorktree = resolveWorktree(worktree)
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
