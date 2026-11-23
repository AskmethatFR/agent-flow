import { join } from 'node:path'
import { checkContractFile } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { ROLE_IDS, decisionStepOf } from '@agent-flow/core/lifecycle'
import { readTestReport } from '@agent-flow/core/snapshot'
import { appendLine } from '../shared/confined-append'
import type { AppendIo } from '../shared/confined-append'
import {
  inspectAgentFlowDirectory,
  isConfinableWorktree,
  readContractFile,
  readPlan,
  refusalFor,
  resolveWorktree,
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

type Confined = { readonly realWorktree: string; readonly directory: string }

// The paths derive from the worktree realpath, and .agent-flow must be a real directory
// (docs/technical/decisions/plan-writer-confinement.md:86).
const confine = (worktree: string): Confined | Rejected => {
  if (!isConfinableWorktree(worktree)) {
    return refuse('worktree must be an absolute path without . or .. segments')
  }
  const realWorktree = resolveWorktree(worktree, refuse)
  if (typeof realWorktree !== 'string') return realWorktree
  const directory = join(realWorktree, '.agent-flow')
  return inspectAgentFlowDirectory(directory, refuse) ?? { realWorktree, directory }
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

// Read from the fixed path under the worktree, never from a path in the command, and parsed by
// core's own reader, so the host holds no parsing rule.
const vitestCountsOf = (io: AppendIo, realWorktree: string, run: ObservedRun): Counts | Rejected => {
  const report = readContractFile(io, join(realWorktree, reportPath), refuseReport)
  if ('accepted' in report) return report
  if (!writtenDuring(run, report)) return refuseReport('was not written during the run')
  const parsed = readTestReport(report.text)
  if (!parsed.accepted) return refuseReport(parsed.message)
  const { source, passed, total, failedSuites } = parsed.report
  return source === 'vitest' ? { passed, total, failedSuites } : refuseReport('is not a vitest JSON report')
}

// decisionStepOf names decisions.jsonl in the one error of its own refusals (decision-append's
// file); a fact refusal names the file the writer is writing. A plan refusal stays as it is.
const relabelled = (refusal: ValidationResult & { accepted: false }): ValidationResult => {
  const [first] = refusal.errors
  return first.file === 'decisions.jsonl' ? refuse(first.message, first.field) : refusal
}

export function createFactAppender(io: AppendIo): Appender {
  return function appendFact(worktree, run) {
    const role = hostRoleOf(run.agentType) ?? null
    const confined = confine(worktree)
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
