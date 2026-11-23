import verifiedFactsSchema from '../../schemas/verified-facts.schema.json' with { type: 'json' }
import type { ValidationResult } from './contract-error'
import { validateJsonl } from './jsonl'
import type { JsonlContract } from './jsonl'
import type { SchemaViolation } from './schema-subset'

const countsByTool: Readonly<Record<string, readonly string[]>> = {
  vitest: ['passed', 'total', 'failedSuites'],
  'cucumber-js': ['passed', 'total', 'failedSuites'],
  stryker: ['detected', 'surviving'],
}

const allCounts = Object.values(countsByTool).flat()

const isSafeCount = (value: unknown): boolean => Number.isSafeInteger(value) && (value as number) >= 0

// Runs after the schema, so `tool` is one of the keys of countsByTool.
const countRule = (record: unknown): SchemaViolation | undefined => {
  const fact = record as Record<string, unknown>
  const own = countsByTool[fact.tool as string] as readonly string[]
  for (const count of own) {
    if (!Object.hasOwn(fact, count)) return { path: [count], message: 'is required' }
    if (!isSafeCount(fact[count])) return { path: [count], message: 'must be a non-negative integer' }
  }
  const foreign = allCounts.find((count) => !own.includes(count) && Object.hasOwn(fact, count))
  if (foreign !== undefined) return { path: [foreign], message: 'is not allowed' }
  if (fact.tool === 'stryker') {
    return fact.detected === 0 && fact.surviving === 0
      ? { path: ['detected'], message: 'must not be 0 when surviving is 0' }
      : undefined
  }
  return (fact.passed as number) > (fact.total as number)
    ? { path: ['passed'], message: 'must not exceed total' }
    : undefined
}

export const verifiedFactsContract: JsonlContract = {
  file: 'verified-facts.jsonl',
  schema: verifiedFactsSchema,
  minimumRecordLength: 138,
  recordRule: countRule,
}

export const validateVerifiedFacts = (text: string): ValidationResult =>
  validateJsonl(verifiedFactsContract, text)
