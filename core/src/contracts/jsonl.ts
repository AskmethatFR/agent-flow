import { MAX_ERRORS, MAX_TEXT_LENGTH, capErrors, safeLabel } from './contract-error'
import type { ContractError, ValidationResult } from './contract-error'
import { findViolations } from './schema-subset'
import type { JsonSchema, SchemaViolation } from './schema-subset'

export type JsonlContract = {
  readonly file: string
  readonly schema: JsonSchema
  readonly minimumRecordLength: number
  readonly uniqueKey?: string
}

export type JsonlRead = {
  readonly records: readonly unknown[]
  readonly errors: readonly ContractError[]
}

export const lineError = (file: string, location: number | null, message: string): ContractError => ({
  file,
  location,
  field: null,
  message,
})

export const firstViolation = (schema: JsonSchema, document: unknown): SchemaViolation | undefined => {
  const [violation] = findViolations(schema, document)
  return violation
}

export const violationError = (
  file: string,
  violation: SchemaViolation,
  location: number | null,
): ContractError => ({
  file,
  location,
  field: safeLabel(violation.path[0]),
  message: violation.message,
})

export const readJsonl = (contract: JsonlContract, text: string): JsonlRead => {
  const { file, schema, minimumRecordLength, uniqueKey } = contract
  if (text.length > MAX_TEXT_LENGTH) {
    return { records: [], errors: [lineError(file, null, `exceeds ${MAX_TEXT_LENGTH} characters`)] }
  }
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  const records: unknown[] = []
  const errors: ContractError[] = []
  const seen = new Set<unknown>()
  for (const [index, line] of lines.entries()) {
    const location = index + 1
    if (errors.length > MAX_ERRORS && line.length < minimumRecordLength) continue
    let document: unknown
    try {
      document = JSON.parse(line)
    } catch {
      errors.push(lineError(file, location, 'is not valid JSON'))
      continue
    }
    const violation = firstViolation(schema, document)
    if (violation !== undefined) {
      errors.push(violationError(file, violation, location))
      continue
    }
    if (uniqueKey !== undefined) {
      const key = (document as Record<string, unknown>)[uniqueKey]
      if (seen.has(key)) {
        errors.push({ file, location, field: uniqueKey, message: 'must be unique' })
        continue
      }
      seen.add(key)
    }
    records.push(document)
  }
  return { records, errors: capErrors(file, errors) }
}

export const validateJsonl = (contract: JsonlContract, text: string): ValidationResult => {
  const { errors } = readJsonl(contract, text)
  const [first, ...rest] = errors
  if (first === undefined) return { accepted: true }
  return { accepted: false, errors: [first, ...rest] }
}
