import { displayStateOf } from '../agent-state/agent-state'
import type { AgentDisplayState } from '../agent-state/agent-state'
import { MAX_TEXT_LENGTH, capErrors } from '../contracts/contract-error'
import type { ContractError } from '../contracts/contract-error'
import { readLocatedDecisions } from '../contracts/decisions'
import { readPlan } from '../contracts/plan'
import type { PlanStep, ReadPlanResult } from '../contracts/plan'
import { readCiStatus } from './ci-status'
import type { CiState } from './ci-status'
import { mutationLabelOf, readMutationReport } from './mutation-report'
import { readTestReport } from './test-report'
import type { ParsedTestReport } from './test-report'
import { instantOf, timeSpentOf } from './time-spent'
import type { TimeSpent } from './time-spent'

export const MAX_DECISIONS_PER_STEP = 50

export type FileUnavailable = {
  readonly unavailable: 'missing' | 'unreadable' | 'too-large'
}

export type AgentFlowFile = string | FileUnavailable

export type AgentStatusUnavailable = { readonly unavailable: 'host-error' }

type StepReport = {
  readonly step: string
  readonly text: string
}

export type TestReport = StepReport

export type MutationReport = StepReport

export type SnapshotFiles = {
  readonly plan: AgentFlowFile
  readonly decisions?: AgentFlowFile
  readonly testReports?: readonly TestReport[]
  readonly mutationReports?: readonly MutationReport[]
  readonly ciStatus?: string
}

export type SnapshotDecision = {
  readonly title: string
  readonly why: string
  readonly rejected: readonly string[]
  readonly role: string
  readonly confidence: 'high' | 'medium' | 'low'
}

export type SnapshotFact = {
  readonly origin: 'verified' | 'declared'
  readonly source: string
  readonly label: string
}

export type CiFact = {
  readonly origin: 'verified'
  readonly source: string
  readonly headCommit: string
  readonly state: CiState
}

export type SnapshotStep = {
  readonly id: string
  readonly title: string
  readonly role: string
  readonly status: 'todo' | 'in_progress' | 'done'
  readonly origin: 'planned' | 'proposed'
  readonly timeSpent: TimeSpent | null
  readonly decisions: readonly SnapshotDecision[]
  readonly omittedDecisions: number
  readonly facts: readonly SnapshotFact[]
}

export type CurrentAgent = {
  readonly role: string
  readonly state: AgentDisplayState
}

export type Snapshot = {
  readonly issue: string | null
  readonly title: string | null
  readonly steps: readonly SnapshotStep[]
  readonly currentStepId: string | null
  readonly currentAgent: CurrentAgent | null
  readonly ci: CiFact | null
  readonly errors: readonly ContractError[]
}

const declaredFactOf = (decision: SnapshotDecision): SnapshotFact => ({
  origin: 'declared',
  source: decisionsFile,
  label: decision.title,
})

const runFailedSuffixOf = ({ passed, total, failedSuites }: ParsedTestReport): string =>
  passed === total && failedSuites > 0 ? ', run failed' : ''

const verifiedFactOf = (report: ParsedTestReport): SnapshotFact => ({
  origin: 'verified',
  source: report.source,
  label: `${report.passed} of ${report.total} passed${runFailedSuffixOf(report)}`,
})

const toSnapshotStep = (
  step: PlanStep,
  now: Date,
  { decisions, omitted }: StepDecisions,
  verified: readonly VerifiedFact[],
): SnapshotStep => ({
  id: step.id,
  title: step.title,
  role: step.role,
  status: step.status,
  origin: step.origin,
  timeSpent: timeSpentOf(step, now),
  decisions,
  omittedDecisions: omitted,
  facts: [
    ...decisions.map(declaredFactOf),
    ...verified.filter((entry) => entry.step === step.id).map(({ fact }) => fact),
  ],
})

const startOf = (step: PlanStep): number => instantOf(step.startedAt) ?? Number.NEGATIVE_INFINITY

const currentStepOf = (steps: readonly PlanStep[]): PlanStep | null => {
  let current: PlanStep | null = null
  let currentStart = Number.NEGATIVE_INFINITY
  for (const step of steps) {
    if (step.status !== 'in_progress') continue
    const start = startOf(step)
    if (current === null || start > currentStart) {
      current = step
      currentStart = start
    }
  }
  return current
}

const currentAgentOf = (
  step: PlanStep | null,
  agentStatus: string | undefined,
): CurrentAgent | null =>
  step === null || agentStatus === undefined
    ? null
    : { role: step.role, state: displayStateOf(agentStatus) }

const unavailableMessages: Record<FileUnavailable['unavailable'], string> = {
  missing: 'is missing',
  unreadable: 'cannot be read',
  'too-large': `exceeds ${MAX_TEXT_LENGTH} characters`,
}

const unavailableError = (file: string, code: FileUnavailable['unavailable']): ContractError => ({
  file,
  location: null,
  field: null,
  message: unavailableMessages[code],
})

const agentStateMessages: Record<AgentStatusUnavailable['unavailable'], string> = {
  'host-error': 'cannot be read from the host',
}

const agentStateError = ({ unavailable }: AgentStatusUnavailable): ContractError => ({
  file: 'agent-state',
  location: null,
  field: null,
  message: agentStateMessages[unavailable],
})

const isStatusUnavailable = (
  agentStatus: string | AgentStatusUnavailable | undefined,
): agentStatus is AgentStatusUnavailable =>
  typeof agentStatus === 'object' && agentStatus !== null && agentStatus.unavailable === 'host-error'

const readPlanFile = (planFile: AgentFlowFile): ReadPlanResult =>
  typeof planFile === 'string'
    ? readPlan(planFile)
    : { accepted: false, errors: [unavailableError('plan.json', planFile.unavailable)] }

const decisionsFile = 'decisions.jsonl'

type StepDecisions = { readonly decisions: SnapshotDecision[]; omitted: number }

const emptyStepDecisions = (): StepDecisions => ({ decisions: [], omitted: 0 })

type GroupedDecisions = {
  readonly perStep: readonly { readonly step: PlanStep; readonly bucket: StepDecisions }[]
  readonly errors: readonly ContractError[]
}

const groupDecisions = (
  steps: readonly PlanStep[],
  file: AgentFlowFile | undefined,
): GroupedDecisions => {
  const buckets = steps.map((step) => ({ step, bucket: emptyStepDecisions() }))
  const grouped = new Map(buckets.map(({ step, bucket }) => [step.id, bucket] as const))
  if (file === undefined) return { perStep: buckets, errors: [] }
  if (typeof file !== 'string') {
    const errors = file.unavailable === 'missing' ? [] : [unavailableError(decisionsFile, file.unavailable)]
    return { perStep: buckets, errors }
  }
  const { entries, errors } = readLocatedDecisions(file)
  const orphans: ContractError[] = []
  for (const { decision, location } of entries) {
    const bucket = grouped.get(decision.step)
    if (bucket === undefined) {
      orphans.push({ file: decisionsFile, location, field: 'step', message: 'is not a step of plan.json' })
      continue
    }
    if (bucket.decisions.length === MAX_DECISIONS_PER_STEP) {
      bucket.omitted += 1
      continue
    }
    bucket.decisions.push({
      title: decision.title,
      why: decision.why,
      rejected: decision.rejected ?? [],
      role: decision.role,
      confidence: decision.confidence,
    })
  }
  return { perStep: buckets, errors: [...errors, ...capErrors(decisionsFile, orphans)] }
}

const testReportFile = 'test-report'
const mutationReportFile = 'mutation-report'

type VerifiedFact = { readonly step: string; readonly fact: SnapshotFact }

type ReadReports = {
  readonly verified: readonly VerifiedFact[]
  readonly errors: readonly ContractError[]
}

type ReportOutcome = { readonly verified: VerifiedFact } | { readonly error: ContractError }

type FactReading = { readonly fact: SnapshotFact } | { readonly message: string }

type ReportReader = (text: string) => FactReading

const readTestReportFact: ReportReader = (text) => {
  const result = readTestReport(text)
  return result.accepted ? { fact: verifiedFactOf(result.report) } : { message: result.message }
}

const readMutationReportFact: ReportReader = (text) => {
  const result = readMutationReport(text)
  return result.accepted
    ? { fact: { origin: 'verified', source: result.report.source, label: mutationLabelOf(result.report) } }
    : { message: result.message }
}

const outcomeOfReport = (
  file: string,
  read: ReportReader,
  stepIds: ReadonlySet<string>,
  { step, text }: StepReport,
  location: number,
): ReportOutcome => {
  if (!stepIds.has(step)) {
    return { error: { file, location, field: 'step', message: 'is not a step of plan.json' } }
  }
  const reading = read(text)
  if ('message' in reading) {
    return { error: { file, location, field: null, message: reading.message } }
  }
  return { verified: { step, fact: reading.fact } }
}

const readReports = (
  file: string,
  read: ReportReader,
  steps: readonly PlanStep[],
  reports: readonly StepReport[],
): ReadReports => {
  const stepIds = new Set(steps.map((step) => step.id))
  const outcomes = reports.map((report, index) => outcomeOfReport(file, read, stepIds, report, index + 1))
  return {
    verified: outcomes.filter((outcome) => 'verified' in outcome).map((outcome) => outcome.verified),
    errors: capErrors(
      file,
      outcomes.filter((outcome) => 'error' in outcome).map((outcome) => outcome.error),
    ),
  }
}

const ciStatusFile = 'ci-status'

type ReadCi = {
  readonly ci: CiFact | null
  readonly errors: readonly ContractError[]
}

const readCi = (text: string | undefined): ReadCi => {
  if (text === undefined) return { ci: null, errors: [] }
  const result = readCiStatus(text)
  return result.accepted
    ? { ci: { origin: 'verified', ...result.status }, errors: [] }
    : { ci: null, errors: [{ file: ciStatusFile, location: null, field: null, message: result.message }] }
}

export const buildSnapshot = (
  files: SnapshotFiles,
  now: Date,
  agentStatus?: string | AgentStatusUnavailable,
): Snapshot => {
  const unavailable = isStatusUnavailable(agentStatus)
  const agentErrors = unavailable ? [agentStateError(agentStatus)] : []
  const status = unavailable ? undefined : agentStatus
  const result = readPlanFile(files.plan)
  const { ci, errors: ciErrors } = readCi(files.ciStatus)
  if (!result.accepted) {
    return {
      issue: null,
      title: null,
      steps: [],
      currentStepId: null,
      currentAgent: null,
      ci,
      errors: [...result.errors, ...ciErrors, ...agentErrors],
    }
  }
  const { plan } = result
  const { perStep, errors } = groupDecisions(plan.steps, files.decisions)
  const testReports = readReports(testReportFile, readTestReportFact, plan.steps, files.testReports ?? [])
  const mutationReports = readReports(mutationReportFile, readMutationReportFact, plan.steps, files.mutationReports ?? [])
  const verified = [...testReports.verified, ...mutationReports.verified]
  const current = currentStepOf(plan.steps)
  return {
    issue: plan.issue,
    title: plan.title,
    steps: perStep.map(({ step, bucket }) => toSnapshotStep(step, now, bucket, verified)),
    currentStepId: current?.id ?? null,
    currentAgent: currentAgentOf(current, status),
    ci,
    errors: [...errors, ...testReports.errors, ...mutationReports.errors, ...ciErrors, ...agentErrors],
  }
}
