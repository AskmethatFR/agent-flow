import { MAX_TEXT_LENGTH } from '../contracts/contract-error'

export type CiState = 'passed' | 'failed' | 'pending'

export type ParsedCiStatus = {
  readonly source: 'gh'
  readonly headCommit: string
  readonly state: CiState
}

export type ReadCiStatusResult =
  | { readonly accepted: true; readonly status: ParsedCiStatus }
  | { readonly accepted: false; readonly message: string }

const refusedWith = (message: string): ReadCiStatusResult => ({ accepted: false, message })

const failedConclusions: readonly unknown[] = [
  'FAILURE',
  'TIMED_OUT',
  'CANCELLED',
  'ACTION_REQUIRED',
  'STARTUP_FAILURE',
  'STALE',
]
const passedConclusions: readonly unknown[] = ['SUCCESS', 'NEUTRAL', 'SKIPPED']
const runningStatuses: readonly unknown[] = ['REQUESTED', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'PENDING']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isCheckRun = (entry: Record<string, unknown>): boolean =>
  entry.__typename === undefined || entry.__typename === 'CheckRun'

const concludedStateOf = (conclusion: unknown): CiState | null => {
  if (failedConclusions.includes(conclusion)) return 'failed'
  return passedConclusions.includes(conclusion) ? 'passed' : null
}

const stateOfCheck = (entry: unknown): CiState | null => {
  if (!isRecord(entry) || !isCheckRun(entry)) return null
  if (runningStatuses.includes(entry.status)) return 'pending'
  return entry.status === 'COMPLETED' ? concludedStateOf(entry.conclusion) : null
}

const statesOf = (checks: readonly unknown[]): CiState[] | null => {
  const states = checks.map(stateOfCheck)
  const known = states.filter((state) => state !== null)
  return known.length === states.length ? known : null
}

const overallStateOf = (states: readonly CiState[]): CiState => {
  if (states.includes('failed')) return 'failed'
  return states.includes('pending') ? 'pending' : 'passed'
}

export const readCiStatus = (text: string): ReadCiStatusResult => {
  if (text.length > MAX_TEXT_LENGTH) return refusedWith(`exceeds ${MAX_TEXT_LENGTH} characters`)
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    return refusedWith('is not valid JSON')
  }
  if (!isRecord(document) || typeof document.headRefOid !== 'string' || !Array.isArray(document.statusCheckRollup)) {
    return refusedWith('is not a gh check status rollup')
  }
  const states = statesOf(document.statusCheckRollup)
  if (states === null) return refusedWith('is not a gh check status rollup')
  if (states.length === 0) return refusedWith('has no check run')
  return { accepted: true, status: { source: 'gh', headCommit: document.headRefOid, state: overallStateOf(states) } }
}
