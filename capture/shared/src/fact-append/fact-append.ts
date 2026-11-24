import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { checkContractFile } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { ROLE_IDS, decisionStepOf } from '@agent-flow/core/lifecycle'
import { readTestReport } from '@agent-flow/core/snapshot'
import { appendLine } from '../shared/confined-append'
import type { AppendIo } from '../shared/confined-append'
import {
  confineAgentFlow,
  decisionsFile,
  inspectFolder,
  readContractFile,
  readPlan,
  refusalFor,
} from '../shared/confinement'
import type { ContractFile, Rejected } from '../shared/confinement'

// The run is [at - durationMs, at]: at is its end, durationMs its length (a safe non-negative integer).
export type ObservedRun = { readonly agentType: unknown; readonly at: string; readonly durationMs: number }

type Appender = (worktree: string, run: ObservedRun) => ValidationResult

const factsFile = 'verified-facts.jsonl'
const reportPath = 'reports/vitest/vitest.json'
const refuse = refusalFor(factsFile)
const refuseReport = refusalFor(reportPath)
const hostPrefix = 'agentic-team:'

// Ruling G2 (docs/technical/decisions/verified-facts.md S13): a bare role id, or one with the
// agentic-team: prefix, is host-observed; any other prefix is not. A run with no host role is
// still asked of decisionStepOf with null, never '' (a role-less step has the role '', S12 (a)).
const hostRoleOf = (agentType: unknown): string | undefined => {
  if (typeof agentType !== 'string') return undefined
  const name = agentType.startsWith(hostPrefix) ? agentType.slice(hostPrefix.length) : agentType
  return ROLE_IDS.find((role) => role === name)
}

type Counts = { readonly passed: number; readonly total: number; readonly failedSuites: number }

// Docs verified-facts.md S12: the report is fresh only when both its modification time and its
// change time fall in the observed run. mtime alone proves nothing (touch -d sets it to any
// instant); the ctime stays at the real time of the change. The ends are whole milliseconds, as
// `at` is, so a time is compared by its millisecond.
const writtenDuring = (run: ObservedRun, file: ContractFile): boolean => {
  const end = Date.parse(run.at)
  return [file.mtimeMs, file.ctimeMs].every((time) => time >= end - run.durationMs && Math.floor(time) <= end)
}

// Docs verified-facts.md S12 (Security F5): each folder of the fixed path is lstat'ed as a directory,
// not a link, before the read, since O_NOFOLLOW covers the last component only. Same chain as
// docs/technical/decisions/plan-writer-confinement.md:86.
const reportFolders = ['reports', 'reports/vitest']

const inspectReportFolders = (io: AppendIo, realWorktree: string): Rejected | undefined => {
  for (const folder of reportFolders) {
    const refusal = inspectFolder(io.lstatSync, join(realWorktree, folder), folder, refuseReport)
    if (refusal !== undefined) return refusal
  }
  return undefined
}

// A folder swapped for a link after its lstat is caught here, once the report is open: the folder
// chain must still resolve to itself, as confined-append checks .agent-flow after its open. A swap
// undone before this check is not seen here: confirmReportFile catches it.
const confirmReportFolder = (realWorktree: string): Rejected | undefined => {
  const folder = join(realWorktree, 'reports/vitest')
  try {
    if (realpathSync(folder) !== folder) return refuseReport('reports/vitest must be a real directory')
  } catch {
    return refuseReport('reports/vitest cannot be read')
  }
  return undefined
}

// A swap undone before confirmReportFolder leaves the path on another file than the one read
// (Security F4 on #128): the path must still name the read file, by dev and inode.
const confirmReportFile = (io: AppendIo, path: string, read: ContractFile): Rejected | undefined => {
  try {
    const linked = io.lstatSync(path)
    if (linked.dev === read.dev && linked.ino === read.ino) return undefined
  } catch {}
  return refuseReport('was replaced once read')
}

// Read from the fixed path under the worktree, never from a path in the command, and parsed by
// core's own reader, so the host holds no parsing rule.
const vitestCountsOf = (io: AppendIo, realWorktree: string, run: ObservedRun): Counts | Rejected => {
  const unsafe = inspectReportFolders(io, realWorktree)
  if (unsafe !== undefined) return unsafe
  const path = join(realWorktree, reportPath)
  const report = readContractFile(io, path, refuseReport)
  if ('accepted' in report) return report
  const swapped = confirmReportFolder(realWorktree) ?? confirmReportFile(io, path, report)
  if (swapped !== undefined) return swapped
  if (!writtenDuring(run, report)) return refuseReport('was not written during the run')
  const parsed = readTestReport(report.text)
  if (!parsed.accepted) return refuseReport(parsed.message)
  const { source, passed, total, failedSuites } = parsed.report
  return source === 'vitest' ? { passed, total, failedSuites } : refuseReport('is not a vitest JSON report')
}

// decisionStepOf names the decisions file in the one error of its own refusals (decision-append's
// file); a fact refusal names the file the writer is writing. A plan refusal stays as it is.
const relabelled = (refusal: ValidationResult & { accepted: false }): ValidationResult => {
  const [first] = refusal.errors
  return first.file === decisionsFile ? refuse(first.message, first.field) : refusal
}

export function createFactAppender(io: AppendIo): Appender {
  return function appendFact(worktree, run) {
    const role = hostRoleOf(run.agentType) ?? null
    const confined = confineAgentFlow(worktree, refuse)
    if ('accepted' in confined) return confined
    const plan = readPlan(io, join(confined.directory, 'plan.json'))
    if ('accepted' in plan) return plan
    const step = decisionStepOf(plan.text, role)
    if (!step.accepted) return relabelled(step)
    const counts = vitestCountsOf(io, confined.realWorktree, run)
    if ('accepted' in counts) return counts
    const line = JSON.stringify({
      at: run.at,
      tool: 'vitest',
      step: step.stepId,
      attachment: step.attachment,
      role,
      roleFrom: role === null ? null : 'host',
      ...counts,
    })
    const checked = checkContractFile(factsFile, line)
    if (!checked.accepted) return checked
    return appendLine(io, confined.directory, join(confined.directory, factsFile), line, refuse)
  }
}
