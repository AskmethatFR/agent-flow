import { constants, fstatSync, realpathSync } from 'node:fs'
import type * as NodeFs from 'node:fs'
import { isAbsolute } from 'node:path'
import { MAX_TEXT_LENGTH } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'

export type ReadIo = Pick<typeof NodeFs, 'openSync' | 'readSync' | 'closeSync'>

export type Refuse = (message: string, field?: string | null) => ValidationResult

export const notRegularFile = 'must be a regular file, not a link'
const readLimit = 4 * MAX_TEXT_LENGTH

export const refusalFor =
  (file: string): Refuse =>
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

export const resolveWorktree = (worktree: string, refuse: Refuse): string | ValidationResult => {
  try {
    return realpathSync(worktree)
  } catch {
    return refuse('worktree cannot be resolved')
  }
}

const openRefusal = (error: unknown): ValidationResult => {
  const code = codeOf(error)
  if (code === 'ENOENT') return refusePlan('is missing')
  if (code === 'ELOOP') return refusePlan(notRegularFile)
  return refusePlan('cannot be read')
}

const readBounded = (io: ReadIo, fd: number): string | ValidationResult => {
  const buffer = Buffer.allocUnsafe(readLimit + 1)
  let total = 0
  for (;;) {
    const count = io.readSync(fd, buffer, total, buffer.length - total, null)
    if (count === 0) break
    total += count
  }
  return total > readLimit ? refusePlan('is too large') : buffer.toString('utf8', 0, total)
}

export type PlanFile = { readonly text: string; readonly mode: number }

export const readPlan = (io: ReadIo, planPath: string): PlanFile | ValidationResult => {
  let fd: number
  try {
    fd = io.openSync(planPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (error) {
    return openRefusal(error)
  }
  try {
    const stats = fstatSync(fd)
    if (!stats.isFile()) return refusePlan(notRegularFile)
    const text = readBounded(io, fd)
    return typeof text === 'string' ? { text, mode: stats.mode & 0o777 } : text
  } catch {
    return refusePlan('cannot be read')
  } finally {
    attempt(() => io.closeSync(fd))
  }
}
