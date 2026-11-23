import { readJsonl } from '../contracts/jsonl'
import { verifiedFactsContract } from '../contracts/verified-facts'
import type { ParsedMutationReport } from './mutation-report'
import type { ParsedTestReport } from './test-report'

export type ReadFactLineResult =
  | { readonly accepted: true; readonly report: ParsedTestReport | ParsedMutationReport }
  | { readonly accepted: false; readonly message: string }

const refused: ReadFactLineResult = { accepted: false, message: 'is not a verified-facts.jsonl line' }

type FactLine = {
  readonly tool: ParsedTestReport['source'] | ParsedMutationReport['source']
  readonly passed: number
  readonly total: number
  readonly failedSuites: number
  readonly detected: number
  readonly surviving: number
}

const reportOf = (line: FactLine): ParsedTestReport | ParsedMutationReport =>
  line.tool === 'stryker'
    ? { source: 'stryker', detected: line.detected, surviving: line.surviving }
    : { source: line.tool, passed: line.passed, total: line.total, failedSuites: line.failedSuites }

// The text is one line of verified-facts.jsonl, validated again here: an entry can be hand-made.
export const readFactLine = (text: string): ReadFactLineResult => {
  const { records, errors } = readJsonl(verifiedFactsContract, text)
  const [only] = records
  if (errors.length > 0 || records.length !== 1) return refused
  return { accepted: true, report: reportOf(only?.record as FactLine) }
}
