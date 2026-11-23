import { displayStateOf } from '../agent-state/agent-state'
import type { AgentDisplayState } from '../agent-state/agent-state'
import { MAX_TEXT_LENGTH, capErrors } from '../contracts/contract-error'
import type { ContractError } from '../contracts/contract-error'
import { readLocatedDecisions } from '../contracts/decisions'
import { firstViolation, readJsonl } from '../contracts/jsonl'
import type { JsonlContract } from '../contracts/jsonl'
import { readPlan } from '../contracts/plan'
import type { PlanStep, ReadPlanResult } from '../contracts/plan'
import { verifiedFactsContract } from '../contracts/verified-facts'
import { readCiStatus } from './ci-status'
import type { CiState } from './ci-status'
import { readFactLine } from './fact-line'
import { mutationLabelOf, readMutationReport } from './mutation-report'
import type { ParsedMutationReport } from './mutation-report'
import { readTestReport } from './test-report'
import type { ParsedTestReport } from './test-report'
import { instantOf, timeSpentOf } from './time-spent'
import type { TimeSpent } from './time-spent'

export const MAX_DECISIONS_PER_STEP = 50
export const MAX_REPORTS_PER_BUILD = 200
export const MAX_UNATTACHED_FACTS = 50

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

export type VerifiedFactEntry = StepReport

export type SnapshotFiles = {
  readonly plan: AgentFlowFile
  readonly decisions?: AgentFlowFile
  readonly testReports?: readonly TestReport[]
  readonly mutationReports?: readonly MutationReport[]
  readonly verifiedFacts?: FactEntries
  readonly ciStatus?: string
  readonly unattachedEntries?: readonly string[]
}

export type FactEntries = {
  readonly entries: readonly VerifiedFactEntry[]
  readonly unattached: readonly string[]
  readonly errors: readonly ContractError[]
}

// Each valid line keeps its own text, in file order: an attached line becomes a step-level entry,
// a step: null line goes to unattached, the input of SnapshotFiles.unattachedEntries.
export const factEntriesOf = (file: AgentFlowFile): FactEntries => {
  if (typeof file !== 'string') {
    const errors = file.unavailable === 'missing' ? [] : [unavailableError(verifiedFactsContract.file, file.unavailable)]
    return { entries: [], unattached: [], errors }
  }
  const lines = file.split('\n')
  const { records, errors } = readJsonl(verifiedFactsContract, file)
  const entries: VerifiedFactEntry[] = []
  const unattached: string[] = []
  for (const { record, location } of records) {
    const { step } = record as { step: string | null }
    const text = lines[location - 1] as string
    if (step === null) unattached.push(text)
    else entries.push({ step, text })
  }
  return { entries, unattached, errors }
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
  readonly omittedFacts: number
  readonly ranTool: boolean
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
  readonly unattachedFacts: readonly SnapshotFact[]
  readonly omittedUnattachedFacts: number
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

const mutationFactOf = (report: ParsedMutationReport): SnapshotFact => ({
  origin: 'verified',
  source: report.source,
  label: mutationLabelOf(report),
})

const latestVerifiedFacts = (
  stepId: string,
  verified: readonly VerifiedFact[],
): { readonly kept: readonly SnapshotFact[]; readonly omitted: number } => {
  const facts = verified.filter((entry) => entry.step === stepId).map(({ fact }) => fact)
  const omitted = Math.max(0, facts.length - MAX_DECISIONS_PER_STEP)
  return { kept: facts.slice(omitted), omitted }
}

const toSnapshotStep = (
  step: PlanStep,
  now: Date,
  { decisions, omitted }: StepDecisions,
  verified: readonly VerifiedFact[],
  ranSteps: ReadonlySet<string>,
): SnapshotStep => {
  const { kept, omitted: omittedFacts } = latestVerifiedFacts(step.id, verified)
  return {
    id: step.id,
    title: step.title,
    role: step.role,
    status: step.status,
    origin: step.origin,
    timeSpent: timeSpentOf(step, now),
    decisions,
    omittedDecisions: omitted,
    facts: [...decisions.map(declaredFactOf), ...kept],
    omittedFacts,
    ranTool: ranSteps.has(step.id),
  }
}

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
const verifiedFactEntryLabel = 'verified-fact'

type VerifiedFact = { readonly step: string; readonly fact: SnapshotFact }

type ReadReports = {
  readonly ranSteps: readonly string[]
  readonly verified: readonly VerifiedFact[]
  readonly errors: readonly ContractError[]
}

type ReportOutcome = { readonly verified: VerifiedFact } | { readonly error: ContractError }

type FactReading = { readonly fact: SnapshotFact } | { readonly message: string }

type ReportReader = (text: string, step: string) => FactReading

const readTestReportFact: ReportReader = (text) => {
  const result = readTestReport(text)
  return result.accepted ? { fact: verifiedFactOf(result.report) } : { message: result.message }
}

const readMutationReportFact: ReportReader = (text) => {
  const result = readMutationReport(text)
  return result.accepted ? { fact: mutationFactOf(result.report) } : { message: result.message }
}

const readFactLineFact: ReportReader = (text, step) => {
  const result = readFactLine(text, step)
  if (!result.accepted) return { message: result.message }
  const { report } = result
  return { fact: report.source === 'stryker' ? mutationFactOf(report) : verifiedFactOf(report) }
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
  const reading = read(text, step)
  if ('message' in reading) {
    return { error: { file, location, field: null, message: reading.message } }
  }
  return { verified: { step, fact: reading.fact } }
}

const boundErrorsOf = (file: string, skipped: number): readonly ContractError[] =>
  skipped === 0
    ? []
    : [
        {
          file,
          location: null,
          field: null,
          message: `too many reports, only the last ${MAX_REPORTS_PER_BUILD} are read`,
        },
      ]

const readReports = (
  file: string,
  read: ReportReader,
  steps: readonly PlanStep[],
  reports: readonly StepReport[],
): ReadReports => {
  const stepIds = new Set(steps.map((step) => step.id))
  const skipped = Math.max(0, reports.length - MAX_REPORTS_PER_BUILD)
  const window = reports.slice(skipped)
  const outcomes = window.map((report, index) => outcomeOfReport(file, read, stepIds, report, skipped + index + 1))
  return {
    ranSteps: window.map(({ step }) => step),
    verified: outcomes.filter((outcome) => 'verified' in outcome).map((outcome) => outcome.verified),
    errors: [
      ...boundErrorsOf(file, skipped),
      ...capErrors(
        file,
        outcomes.filter((outcome) => 'error' in outcome).map((outcome) => outcome.error),
      ),
    ],
  }
}

const unattachedEntryFile = 'unattached-entry'

// The shape validateVerifiedFacts guarantees, narrowed to what core reads: the tool and its counts.
type UnattachedEntry =
  | {
      readonly tool: 'vitest' | 'cucumber-js'
      readonly step: string | null
      readonly passed: number
      readonly total: number
      readonly failedSuites: number
    }
  | { readonly tool: 'stryker'; readonly step: string | null; readonly detected: number; readonly surviving: number }

type EntryOutcome = { readonly fact: SnapshotFact } | { readonly error: ContractError }

const entryError = (location: number, field: string | null, message: string): EntryOutcome => ({
  error: { file: unattachedEntryFile, location, field, message },
})

const factOfEntry = (entry: UnattachedEntry): SnapshotFact =>
  entry.tool === 'stryker'
    ? {
        origin: 'verified',
        source: entry.tool,
        label: mutationLabelOf({ source: entry.tool, detected: entry.detected, surviving: entry.surviving }),
      }
    : verifiedFactOf({
        source: entry.tool,
        passed: entry.passed,
        total: entry.total,
        failedSuites: entry.failedSuites,
      })

// verifiedFactsContract always sets its recordRule; the shared JsonlContract type leaves it optional.
const { schema: entrySchema, recordRule: entryRule } = verifiedFactsContract as Required<
  Pick<JsonlContract, 'schema' | 'recordRule'>
>

// readJsonl's check of one line, run on the document already parsed. readJsonl splits on '\n'
// and drops one trailing empty line, so a '\n' before the last character makes more than one line.
const isVerifiedFactsLine = (text: string, document: unknown): boolean =>
  !text.slice(0, -1).includes('\n') &&
  firstViolation(entrySchema, document) === undefined &&
  entryRule(document) === undefined

// Each entry is parsed once (CWE-400): the line check reuses that document.
const outcomeOfEntry = (text: string, location: number): EntryOutcome => {
  if (text.length > MAX_TEXT_LENGTH) return entryError(location, null, `exceeds ${MAX_TEXT_LENGTH} characters`)
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    return entryError(location, null, 'is not valid JSON')
  }
  if (!isVerifiedFactsLine(text, document)) {
    return entryError(location, null, 'is not a verified-facts.jsonl entry')
  }
  const entry = document as UnattachedEntry
  return entry.step === null ? { fact: factOfEntry(entry) } : entryError(location, 'step', 'must be null')
}

type ReadUnattached = {
  readonly facts: readonly SnapshotFact[]
  readonly omitted: number
  readonly errors: readonly ContractError[]
}

// At most MAX_UNATTACHED_FACTS errors, under MAX_ERRORS: no capErrors needed.
const readUnattached = (entries: readonly string[]): ReadUnattached => {
  const omitted = Math.max(0, entries.length - MAX_UNATTACHED_FACTS)
  const outcomes = entries.slice(omitted).map((text, index) => outcomeOfEntry(text, omitted + index + 1))
  return {
    facts: outcomes.filter((outcome) => 'fact' in outcome).map((outcome) => outcome.fact),
    omitted,
    errors: outcomes.filter((outcome) => 'error' in outcome).map((outcome) => outcome.error),
  }
}

const ciStatusFile = 'ci-status'

type ReadCi = {
  readonly ci: CiFact | null
  readonly errors: readonly ContractError[]
}

const readCi = (text: string | undefined): ReadCi => {
  if (typeof text !== 'string') return { ci: null, errors: [] }
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
  const unattached = readUnattached(files.unattachedEntries ?? [])
  if (!result.accepted) {
    return {
      issue: null,
      title: null,
      steps: [],
      currentStepId: null,
      currentAgent: null,
      ci,
      unattachedFacts: unattached.facts,
      omittedUnattachedFacts: unattached.omitted,
      errors: [...result.errors, ...unattached.errors, ...ciErrors, ...agentErrors],
    }
  }
  const { plan } = result
  const { perStep, errors } = groupDecisions(plan.steps, files.decisions)
  const testReports = readReports(testReportFile, readTestReportFact, plan.steps, files.testReports ?? [])
  const mutationReports = readReports(mutationReportFile, readMutationReportFact, plan.steps, files.mutationReports ?? [])
  const factLines = readReports(verifiedFactEntryLabel, readFactLineFact, plan.steps, files.verifiedFacts?.entries ?? [])
  const verified = [...testReports.verified, ...mutationReports.verified, ...factLines.verified]
  const ranSteps = new Set([...testReports.ranSteps, ...mutationReports.ranSteps, ...factLines.ranSteps])
  const current = currentStepOf(plan.steps)
  return {
    issue: plan.issue,
    title: plan.title,
    steps: perStep.map(({ step, bucket }) => toSnapshotStep(step, now, bucket, verified, ranSteps)),
    currentStepId: current?.id ?? null,
    currentAgent: currentAgentOf(current, status),
    ci,
    unattachedFacts: unattached.facts,
    omittedUnattachedFacts: unattached.omitted,
    errors: [
      ...errors,
      ...testReports.errors,
      ...mutationReports.errors,
      ...(files.verifiedFacts?.errors ?? []),
      ...factLines.errors,
      ...unattached.errors,
      ...ciErrors,
      ...agentErrors,
    ],
  }
}
