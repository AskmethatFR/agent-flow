import { constants, fstatSync, lstatSync, realpathSync } from 'node:fs'
import type * as NodeFs from 'node:fs'
import { isAbsolute } from 'node:path'
import { MAX_TEXT_LENGTH } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'

export type ReadIo = Pick<typeof NodeFs, 'openSync' | 'readSync' | 'closeSync'>

export type Rejected = Extract<ValidationResult, { readonly accepted: false }>

export type Refuse = (message: string, field?: string | null) => Rejected

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

export const resolveWorktree = (worktree: string, refuse: Refuse): string | Rejected => {
  try {
    return realpathSync(worktree)
  } catch {
    return refuse('worktree cannot be resolved')
  }
}

type Lstat = (path: string) => { isDirectory(): boolean }

// lstat, not stat: a link is not a directory. The label names the folder in the refusal.
export const inspectFolder = (
  lstat: Lstat,
  directory: string,
  label: string,
  refuse: Refuse,
): Rejected | undefined => {
  let isDirectory: boolean
  try {
    isDirectory = lstat(directory).isDirectory()
  } catch (error) {
    return refuse(`${label} ${codeOf(error) === 'ENOENT' ? 'is missing' : 'cannot be read'}`)
  }
  return isDirectory ? undefined : refuse(`${label} must be a real directory`)
}

export const inspectAgentFlowDirectory = (directory: string, refuse: Refuse): Rejected | undefined =>
  inspectFolder(lstatSync, directory, '.agent-flow', refuse)

export const confirmAgentFlowDirectory = (directory: string, refuse: Refuse): Rejected | undefined => {
  try {
    if (realpathSync(directory) !== directory) return refuse('.agent-flow must be a real directory')
  } catch {
    return refuse('.agent-flow cannot be read')
  }
  return inspectAgentFlowDirectory(directory, refuse)
}

const openRefusal = (error: unknown, refuse: Refuse): Rejected => {
  const code = codeOf(error)
  if (code === 'ENOENT') return refuse('is missing')
  if (code === 'ELOOP') return refuse(notRegularFile)
  return refuse('cannot be read')
}

const readBounded = (io: ReadIo, fd: number, refuse: Refuse): string | Rejected => {
  const buffer = Buffer.allocUnsafe(readLimit + 1)
  let total = 0
  for (;;) {
    const count = io.readSync(fd, buffer, total, buffer.length - total, null)
    if (count === 0) break
    total += count
  }
  return total > readLimit ? refuse('is too large') : buffer.toString('utf8', 0, total)
}

// mtimeMs and ctimeMs come from the fstat of the opened file, the one the text is read from.
export type ContractFile = {
  readonly text: string
  readonly mode: number
  readonly mtimeMs: number
  readonly ctimeMs: number
}

export const readContractFile = (io: ReadIo, path: string, refuse: Refuse): ContractFile | Rejected => {
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
    return typeof text === 'string'
      ? { text, mode: stats.mode & 0o777, mtimeMs: stats.mtimeMs, ctimeMs: stats.ctimeMs }
      : text
  } catch {
    return refuse('cannot be read')
  } finally {
    attempt(() => io.closeSync(fd))
  }
}

export const readPlan = (io: ReadIo, planPath: string): ContractFile | Rejected =>
  readContractFile(io, planPath, refusePlan)
