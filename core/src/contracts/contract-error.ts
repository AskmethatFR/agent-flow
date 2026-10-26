export type ContractError = {
  readonly file: string
  readonly location: string | number | null
  readonly field: string | null
  readonly message: string
}

export type ValidationResult =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly errors: readonly [ContractError, ...ContractError[]] }
