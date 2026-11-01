import { constants, fstatSync, lstatSync, realpathSync } from 'node:fs'
import type * as NodeFs from 'node:fs'
import { join } from 'node:path'
import { MAX_TEXT_LENGTH, serializeDecision } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { buildSnapshot } from '@agent-flow/core/snapshot'
import {
  attempt,
  codeOf,
  isConfinableWorktree,
  notRegularFile,
  readPlan,
  refusalFor,
  resolveWorktree,
} from '../shared/confinement'

export type DecisionAppenderIo = Pick<
  typeof NodeFs,
  'openSync' | 'readSync' | 'writeSync' | 'closeSync'
>

type Appender = (worktree: string, decision: unknown) => ValidationResult

const refuse = refusalFor('decisions.jsonl')
const newline = 0x0a
const openFlags =
  constants.O_RDWR |
  constants.O_APPEND |
  constants.O_CREAT |
  constants.O_NOFOLLOW |
  constants.O_NONBLOCK

const inspectDirectory = (directory: string): ValidationResult | undefined => {
  let isDirectory: boolean
  try {
    isDirectory = lstatSync(directory).isDirectory()
  } catch (error) {
    return refuse(codeOf(error) === 'ENOENT' ? '.agent-flow is missing' : '.agent-flow cannot be read')
  }
  return isDirectory ? undefined : refuse('.agent-flow must be a real directory')
}

type Completed = { readonly decision: unknown }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const withCurrentStep = (
  io: DecisionAppenderIo,
  directory: string,
  decision: unknown,
): Completed | ValidationResult => {
  if (!isRecord(decision) || Object.hasOwn(decision, 'step')) return { decision }
  const plan = readPlan(io, join(directory, 'plan.json'))
  if ('accepted' in plan) return plan
  const snapshot = buildSnapshot({ plan: plan.text }, new Date())
  const [firstError, ...otherErrors] = snapshot.errors
  if (firstError !== undefined) return { accepted: false, errors: [firstError, ...otherErrors] }
  if (snapshot.currentStepId === null) return refuse('no step is in progress', 'step')
  return { decision: { ...decision, step: snapshot.currentStepId } }
}

const separatorNeeded = (io: DecisionAppenderIo, fd: number, size: number): boolean => {
  if (size === 0) return false
  const last = Buffer.alloc(1)
  io.readSync(fd, last, 0, 1, size - 1)
  return last[0] !== newline
}

const appendLine = (
  io: DecisionAppenderIo,
  directory: string,
  path: string,
  line: string,
): ValidationResult => {
  let fd: number
  try {
    fd = io.openSync(path, openFlags, 0o666)
  } catch (error) {
    return codeOf(error) === 'ELOOP' ? refuse(notRegularFile) : refuse('cannot be written')
  }
  try {
    const stats = fstatSync(fd)
    if (!stats.isFile()) return refuse(notRegularFile)
    if (realpathSync(directory) !== directory) return refuse('.agent-flow must be a real directory')
    const linked = lstatSync(path)
    if (linked.ino !== stats.ino) return refuse(notRegularFile)
    const prefix = separatorNeeded(io, fd, stats.size) ? '\n' : ''
    const bytes = Buffer.from(`${prefix}${line}\n`)
    if (stats.size + bytes.length > MAX_TEXT_LENGTH) {
      return refuse(`exceeds ${MAX_TEXT_LENGTH} characters`)
    }
    let offset = 0
    while (offset < bytes.length) offset += io.writeSync(fd, bytes, offset)
    return { accepted: true }
  } catch {
    return refuse('cannot be written')
  } finally {
    attempt(() => io.closeSync(fd))
  }
}

export function createDecisionAppender(io: DecisionAppenderIo): Appender {
  return function appendDecision(worktree, decision) {
    if (!isConfinableWorktree(worktree)) {
      return refuse('worktree must be an absolute path without . or .. segments')
    }
    const realWorktree = resolveWorktree(worktree, refuse)
    if (typeof realWorktree !== 'string') return realWorktree
    const directory = join(realWorktree, '.agent-flow')
    const directoryRefusal = inspectDirectory(directory)
    if (directoryRefusal !== undefined) return directoryRefusal
    const completed = withCurrentStep(io, directory, decision)
    if (!('decision' in completed)) return completed
    const serialized = serializeDecision(completed.decision)
    if (!serialized.accepted) return { accepted: false, errors: [serialized.error] }
    return appendLine(io, directory, join(directory, 'decisions.jsonl'), serialized.line)
  }
}
