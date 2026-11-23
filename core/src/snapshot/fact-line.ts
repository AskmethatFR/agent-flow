import { readJsonl } from '../contracts/jsonl'
import { verifiedFactsContract } from '../contracts/verified-facts'
import type { ParsedTestReport } from './test-report'

export type ReadFactLineResult =
  | { readonly accepted: true; readonly report: ParsedTestReport }
  | { readonly accepted: false; readonly message: string }

const refused: ReadFactLineResult = { accepted: false, message: 'is not a verified-facts.jsonl line' }

type TestLine = {
  readonly tool: ParsedTestReport['source']
  readonly passed: number
  readonly total: number
  readonly failedSuites: number
}

const isTestLine = (record: unknown): record is TestLine => {
  const { tool } = record as { tool: string }
  return tool === 'vitest' || tool === 'cucumber-js'
}

// The text is one line of verified-facts.jsonl, validated again here: an entry can be hand-made.
export const readFactLine = (text: string): ReadFactLineResult => {
  const { records, errors } = readJsonl(verifiedFactsContract, text)
  const [only] = records
  if (errors.length > 0 || records.length !== 1 || !isTestLine(only?.record)) return refused
  const { tool, passed, total, failedSuites } = only.record
  return { accepted: true, report: { source: tool, passed, total, failedSuites } }
}
