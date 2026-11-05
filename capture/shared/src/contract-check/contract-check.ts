import type * as NodeFs from 'node:fs'
import { join } from 'node:path'
import { checkContractFile, contractFileNames } from '@agent-flow/core/contracts'
import type { ContractError, ValidationResult } from '@agent-flow/core/contracts'
import {
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

const checkEntry = (io: ContractCheckIo, directory: string, name: string): ValidationResult => {
  if (!contractFileNames.includes(name)) return checkContractFile(name, '')
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

const report = (names: readonly string[], results: readonly ValidationResult[]): CheckResult => {
  const [first, ...others] = results.flatMap((result) => (result.accepted ? [] : result.errors))
  return first === undefined ? { accepted: true, checked: names } : { accepted: false, errors: [first, ...others] }
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
    if ('accepted' in names) return names
    return report(names, names.map((name) => checkEntry(io, directory, name)))
  }
}
