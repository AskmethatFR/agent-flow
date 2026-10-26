import planSchema from '../../../schemas/plan.schema.json' with { type: 'json' }
import type { ContractError, ValidationResult } from './contract-error'
import { findViolations } from './schema-subset'
import type { SchemaViolation } from './schema-subset'

const file = 'plan.json'

const stepLocation = (document: unknown, index: number): string => {
  const step = (document as { steps: readonly unknown[] }).steps[index]
  const id = (step as { id?: unknown } | null)?.id
  return typeof id === 'string' ? id : `steps[${index}]`
}

const toContractError = (violation: SchemaViolation, document: unknown): ContractError => {
  const [head, index, field] = violation.path
  const { message } = violation
  if (typeof index === 'number') {
    const location = stepLocation(document, index)
    return { file, location, field: (field as string | undefined) ?? null, message }
  }
  return { file, location: null, field: (head as string | undefined) ?? null, message }
}

export function validatePlan(text: string): ValidationResult {
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    const message = 'is not valid JSON'
    return { accepted: false, errors: [{ file, location: null, field: null, message }] }
  }
  const [first, ...rest] = findViolations(planSchema, document)
  if (first === undefined) return { accepted: true }
  return {
    accepted: false,
    errors: [toContractError(first, document), ...rest.map((v) => toContractError(v, document))],
  }
}
