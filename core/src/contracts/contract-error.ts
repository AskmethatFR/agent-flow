export type ContractError = {
  readonly file: string
  readonly location: string | number | null
  readonly field: string | null
  readonly message: string
}

export const MAX_TEXT_LENGTH = 1_048_576
export const MAX_ERRORS = 100

export function capErrors(file: string, errors: Iterable<ContractError>): ContractError[] {
  const kept: ContractError[] = []
  for (const error of errors) {
    if (kept.length === MAX_ERRORS) {
      const message = `too many errors, only the first ${MAX_ERRORS} are shown`
      return [...kept, { file, location: null, field: null, message }]
    }
    kept.push(error)
  }
  return kept
}

const safeLabelPattern = /^[A-Za-z0-9._:-]{1,64}$/

export function safeLabel(value: unknown): string | null {
  return typeof value === 'string' && safeLabelPattern.test(value) ? value : null
}

export type ValidationResult =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly errors: readonly [ContractError, ...ContractError[]] }
