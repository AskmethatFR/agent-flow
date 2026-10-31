import scopeSchema from '../../../schemas/scope.schema.json' with { type: 'json' }
import { MAX_TEXT_LENGTH, capErrors, safeLabel } from './contract-error'
import type { ContractError, ValidationResult } from './contract-error'
import { findViolations } from './schema-subset'
import type { SchemaViolation } from './schema-subset'

const file = 'scope.json'

const rejectedWith = (message: string): ValidationResult => ({
  accepted: false,
  errors: [{ file, location: null, field: null, message }],
})

const toContractError = (violation: SchemaViolation): ContractError => {
  const [name, index] = violation.path
  const location = typeof index === 'number' ? `paths[${index}]` : null
  const label = safeLabel(name)
  if (name !== undefined && label === null) {
    return { file, location, field: null, message: 'has a field whose name cannot be shown' }
  }
  return { file, location, field: label, message: violation.message }
}

function* schemaErrors(document: unknown): Generator<ContractError> {
  for (const violation of findViolations(scopeSchema, document)) {
    yield toContractError(violation)
  }
}

type PathRule = { readonly violatedBy: (entry: string) => boolean; readonly message: string }

const segmentsOf = (entry: string): string[] => entry.split('/')

const pathRules: readonly PathRule[] = [
  { violatedBy: (entry) => entry.includes('\\'), message: 'must use / as the only separator' },
  {
    violatedBy: (entry) => entry.startsWith('/') || /^[A-Za-z]:/.test(entry),
    message: 'must be relative to the repository root',
  },
  {
    violatedBy: (entry) => segmentsOf(entry).some((part) => ['', '.', '..'].includes(part)),
    message: 'must not contain an empty, . or .. segment',
  },
  {
    violatedBy: (entry) => segmentsOf(entry).some((part) => part.includes('**') && part !== '**'),
    message: 'must use ** only as a whole segment',
  },
  {
    violatedBy: (entry) => [...entry].every((character) => character === '*' || character === '/'),
    message: 'must name at least one literal character',
  },
]

function* pathEntryErrors(document: unknown): Generator<ContractError> {
  const { paths } = document as { paths: readonly string[] }
  for (const [index, entry] of paths.entries()) {
    const rule = pathRules.find(({ violatedBy }) => violatedBy(entry))
    if (rule !== undefined) {
      yield { file, location: `paths[${index}]`, field: 'paths', message: rule.message }
    }
  }
}

const errorsOf = (document: unknown): ContractError[] => {
  const invalid = capErrors(file, schemaErrors(document))
  return invalid.length > 0 ? invalid : capErrors(file, pathEntryErrors(document))
}

export function validateScope(text: string): ValidationResult {
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
