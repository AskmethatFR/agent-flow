import { constants, realpathSync } from 'node:fs'
import type * as NodeFs from 'node:fs'
import { join } from 'node:path'
import { MAX_TEXT_LENGTH, serializeDecision } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { decisionStepOf } from '@agent-flow/core/lifecycle'
import {
  attempt,
  codeOf,
  inspectAgentFlowDirectory,
  isConfinableWorktree,
  notRegularFile,
  readPlan,
  refusalFor,
  resolveWorktree,
} from '../shared/confinement'

export type DecisionAppenderIo = Pick<
  typeof NodeFs,
  'openSync' | 'readSync' | 'writeSync' | 'closeSync' | 'fstatSync' | 'lstatSync'
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

type Completed = { readonly decision: unknown }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const withDecisionStep = (
  io: DecisionAppenderIo,
  directory: string,
  decision: unknown,
): Completed | ValidationResult => {
  if (!isRecord(decision)) return { decision }
  const plan = readPlan(io, join(directory, 'plan.json'))
  if ('accepted' in plan) return plan
  const resolved = decisionStepOf(plan.text, decision.role)
  if (!resolved.accepted) return resolved
  if (!Object.hasOwn(decision, 'step')) return { decision: { ...decision, step: resolved.stepId } }
  if (decision.step !== resolved.stepId) return refuse('is not the step in progress', 'step')
  return { decision }
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
    const stats = io.fstatSync(fd)
    if (!stats.isFile() || stats.nlink !== 1) return refuse(notRegularFile)
    if (realpathSync(directory) !== directory) return refuse('.agent-flow must be a real directory')
    const linked = io.lstatSync(path)
    if (linked.dev !== stats.dev || linked.ino !== stats.ino) return refuse(notRegularFile)
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
    const directoryRefusal = inspectAgentFlowDirectory(directory, refuse)
    if (directoryRefusal !== undefined) return directoryRefusal
    const completed = withDecisionStep(io, directory, decision)
    if (!('decision' in completed)) return completed
    const serialized = serializeDecision(completed.decision)
    if (!serialized.accepted) return { accepted: false, errors: [serialized.error] }
    return appendLine(io, directory, join(directory, 'decisions.jsonl'), serialized.line)
  }
}
