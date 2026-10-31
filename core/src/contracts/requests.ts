import requestsSchema from '../../../schemas/requests.schema.json' with { type: 'json' }
import type { ValidationResult } from './contract-error'
import { validateJsonl } from './jsonl'
import type { JsonlContract } from './jsonl'

export const requestsContract: JsonlContract = {
  file: 'requests.jsonl',
  schema: requestsSchema,
  minimumRecordLength: 86,
  uniqueKey: 'id',
}

export const validateRequests = (text: string): ValidationResult => validateJsonl(requestsContract, text)
