import { constants, fstatSync, lstatSync, realpathSync } from 'node:fs'
import type * as NodeFs from 'node:fs'
import { isAbsolute } from 'node:path'
import { MAX_TEXT_LENGTH } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'

export type ReadIo = Pick<typeof NodeFs, 'openSync' | 'readSync' | 'closeSync'>

export type Rejected = Extract<ValidationResult, { readonly accepted: false }>

export type Refuse<Refusal extends ValidationResult = ValidationResult> = (
  message: string,
  field?: string | null,
) => Refusal

export const notRegularFile = 'must be a regular file, not a link'
const readLimit = 4 * MAX_TEXT_LENGTH

export const refusalFor =
  (file: string): Refuse<Rejected> =>
  (message, field = null) => ({
    accepted: false,
    errors: [{ file, location: null, field, message }],
  })

const refusePlan = refusalFor('plan.json')

export const attempt = (action: () => void): void => {
  try {
    action()
  } catch {}
}

export const codeOf = (error: unknown): unknown => (error as NodeJS.ErrnoException).code

const hasDotSegment = (path: string): boolean =>
  path.split('/').some((segment) => segment === '.' || segment === '..')

export const isConfinableWorktree = (worktree: unknown): worktree is string =>
  typeof worktree === 'string' && isAbsolute(worktree) && !hasDotSegment(worktree)

export const resolveWorktree = <Refusal extends ValidationResult>(
  worktree: string,
  refuse: Refuse<Refusal>,
): string | Refusal => {
  try {
    return realpathSync(worktree)
  } catch {
    return refuse('worktree cannot be resolved')
  }
}

export const inspectAgentFlowDirectory = <Refusal extends ValidationResult>(
  directory: string,
  refuse: Refuse<Refusal>,
): Refusal | undefined => {
  let isDirectory: boolean
  try {
    isDirectory = lstatSync(directory).isDirectory()
  } catch (error) {
    return refuse(codeOf(error) === 'ENOENT' ? '.agent-flow is missing' : '.agent-flow cannot be read')
  }
  return isDirectory ? undefined : refuse('.agent-flow must be a real directory')
}

const openRefusal = (error: unknown, refuse: Refuse): ValidationResult => {
  const code = codeOf(error)
  if (code === 'ENOENT') return refuse('is missing')
  if (code === 'ELOOP') return refuse(notRegularFile)
  return refuse('cannot be read')
}

const readBounded = (io: ReadIo, fd: number, refuse: Refuse): string | ValidationResult => {
  const buffer = Buffer.allocUnsafe(readLimit + 1)
  let total = 0
  for (;;) {
    const count = io.readSync(fd, buffer, total, buffer.length - total, null)
    if (count === 0) break
    total += count
  }
  return total > readLimit ? refuse('is too large') : buffer.toString('utf8', 0, total)
}

export type PlanFile = { readonly text: string; readonly mode: number }

export const readContractFile = (
  io: ReadIo,
  path: string,
  refuse: Refuse,
): PlanFile | ValidationResult => {
  let fd: number
  try {
    fd = io.openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (error) {
    return openRefusal(error, refuse)
  }
  try {
    const stats = fstatSync(fd)
    if (!stats.isFile()) return refuse(notRegularFile)
    const text = readBounded(io, fd, refuse)
    return typeof text === 'string' ? { text, mode: stats.mode & 0o777 } : text
  } catch {
    return refuse('cannot be read')
  } finally {
    attempt(() => io.closeSync(fd))
  }
}

export const readPlan = (io: ReadIo, planPath: string): PlanFile | ValidationResult =>
  readContractFile(io, planPath, refusePlan)
