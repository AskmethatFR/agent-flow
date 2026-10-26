import planSchema from '../../../schemas/plan.schema.json' with { type: 'json' }
import { MAX_TEXT_LENGTH, capErrors, safeLabel } from './contract-error'
import type { ContractError, ValidationResult } from './contract-error'
import { findViolations } from './schema-subset'
import type { SchemaViolation } from './schema-subset'

const file = 'plan.json'

const rejectedWith = (message: string): ValidationResult => ({
  accepted: false,
  errors: [{ file, location: null, field: null, message }],
})

const stepLocation = (document: unknown, index: number): string => {
  const step = (document as { steps: readonly unknown[] }).steps[index]
  return safeLabel((step as { id?: unknown } | null)?.id) ?? `steps[${index}]`
}

const toContractError = (violation: SchemaViolation, document: unknown): ContractError => {
  const [head, index, field] = violation.path
  const isStepLevel = typeof index === 'number'
  const location = isStepLevel ? stepLocation(document, index) : null
  const name = isStepLevel ? field : head
  const label = safeLabel(name)
  if (name !== undefined && label === null) {
    return { file, location, field: null, message: 'has a field whose name cannot be shown' }
  }
  return { file, location, field: label, message: violation.message }
}

function* schemaErrors(document: unknown): Generator<ContractError> {
  for (const violation of findViolations(planSchema, document)) {
    yield toContractError(violation, document)
  }
}

function* duplicateIdErrors(document: unknown): Generator<ContractError> {
  const seen = new Set<string>()
  const { steps } = document as { steps: readonly { id: string }[] }
  for (const [index, { id }] of steps.entries()) {
    if (seen.has(id)) {
      yield { file, location: stepLocation(document, index), field: 'id', message: 'must be unique' }
    }
    seen.add(id)
  }
}

const errorsOf = (document: unknown): ContractError[] => {
  const invalid = capErrors(file, schemaErrors(document))
  return invalid.length > 0 ? invalid : capErrors(file, duplicateIdErrors(document))
}

export function validatePlan(text: string): ValidationResult {
  if (text.length > MAX_TEXT_LENGTH) return rejectedWith(`exceeds ${MAX_TEXT_LENGTH} characters`)
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    return rejectedWith('is not valid JSON')
  }
  const [first, ...rest] = errorsOf(document)
  if (first === undefined) return { accepted: true }
  return { accepted: false, errors: [first, ...rest] }
}
