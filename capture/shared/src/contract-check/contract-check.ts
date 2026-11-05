import type * as NodeFs from 'node:fs'
import { join } from 'node:path'
import { capErrors, checkContractFile, contractFileNames } from '@agent-flow/core/contracts'
import type { ContractError, ValidationResult } from '@agent-flow/core/contracts'
import {
  confirmAgentFlowDirectory,
  inspectAgentFlowDirectory,
  isConfinableWorktree,
  readContractFile,
  refusalFor,
  resolveWorktree,
} from '../shared/confinement'
import type { ReadIo, Rejected } from '../shared/confinement'

export type ContractCheckIo = ReadIo & Pick<typeof NodeFs, 'readdirSync'>

export type CheckResult =
  | { readonly accepted: true; readonly checked: readonly string[] }
  | { readonly accepted: false; readonly errors: readonly [ContractError, ...ContractError[]] }

const refuse = refusalFor('.agent-flow')

const isContractName = (name: string): boolean => contractFileNames.includes(name)

const checkStray = (name: string): ValidationResult => checkContractFile(name, '')

const checkEntry = (io: ContractCheckIo, directory: string, name: string): ValidationResult => {
  const file = readContractFile(io, join(directory, name), refusalFor(name))
  return 'accepted' in file ? file : checkContractFile(name, file.text)
}

const listNames = (io: ContractCheckIo, directory: string): readonly string[] | Rejected => {
  try {
    return io.readdirSync(directory).sort()
  } catch {
    return refuse('.agent-flow cannot be read')
  }
}

const errorsOf = (results: readonly ValidationResult[]): ContractError[] =>
  results.flatMap((result) => (result.accepted ? [] : result.errors))

const report = (
  checked: readonly string[],
  results: readonly ValidationResult[],
  strays: readonly ValidationResult[],
): CheckResult => {
  const [first, ...others] = [...errorsOf(results), ...capErrors('.agent-flow', errorsOf(strays))]
  return first === undefined ? { accepted: true, checked } : { accepted: false, errors: [first, ...others] }
}

const checkEntries = (io: ContractCheckIo, directory: string, names: readonly string[]): CheckResult => {
  const contractNames = names.filter(isContractName)
  const results = contractNames.map((name) => checkEntry(io, directory, name))
  const strays = names.filter((name) => !isContractName(name)).map(checkStray)
  return confirmAgentFlowDirectory(directory, refuse) ?? report(contractNames, results, strays)
}

export function createContractCheck(io: ContractCheckIo): (worktree: string) => CheckResult {
  return function checkWorktree(worktree) {
    if (!isConfinableWorktree(worktree)) {
      return refuse('worktree must be an absolute path without . or .. segments')
    }
    const realWorktree = resolveWorktree(worktree, refuse)
    if (typeof realWorktree !== 'string') return realWorktree
    const directory = join(realWorktree, '.agent-flow')
    const directoryRefusal = inspectAgentFlowDirectory(directory, refuse)
    if (directoryRefusal !== undefined) return directoryRefusal
    const names = listNames(io, directory)
    return 'accepted' in names ? names : checkEntries(io, directory, names)
  }
}
