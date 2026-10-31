import responsesSchema from '../../../schemas/responses.schema.json' with { type: 'json' }
import type { ValidationResult } from './contract-error'
import { validateJsonl } from './jsonl'
import type { JsonlContract } from './jsonl'

export const responsesContract: JsonlContract = {
  file: 'responses.jsonl',
  schema: responsesSchema,
  minimumRecordLength: 32,
}

export const validateResponses = (text: string): ValidationResult => validateJsonl(responsesContract, text)
