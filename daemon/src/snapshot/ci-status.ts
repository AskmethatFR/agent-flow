import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'
import { MAX_TEXT_LENGTH } from '@agent-flow/core/contracts'
import type { ContractError } from '@agent-flow/core/contracts'

export type ExecFileOptions = {
  readonly cwd: string
  readonly timeout: number
  readonly maxBuffer: number
  readonly encoding: 'utf8'
  readonly env: NodeJS.ProcessEnv
}

export type ExecFile = (
  file: string,
  args: readonly string[],
  options: ExecFileOptions,
  callback: (error: (Error & { code?: unknown }) | null, stdout: string) => void,
) => unknown

export type CiStatusUnavailable = { readonly unavailable: 'gh-missing' | 'gh-failed' }

export type CiStatusRead = { readonly status: string } | CiStatusUnavailable

export type CiStatusSource = (worktree: string) => Promise<CiStatusRead>

const GH_ARGS = ['pr', 'view', '--json', 'headRefOid,statusCheckRollup'] as const
const GH_TIMEOUT_MS = 10_000

const failureOf = (error: { code?: unknown }): CiStatusUnavailable =>
  ({ unavailable: error.code === 'ENOENT' ? 'gh-missing' : 'gh-failed' })

const runGh = (execFile: ExecFile, gh: string, options: ExecFileOptions): Promise<CiStatusRead> =>
  new Promise((resolve) => {
    try {
      execFile(gh, GH_ARGS, options, (error, stdout) => {
        resolve(error === null ? { status: stdout } : failureOf(error))
      })
    } catch {
      resolve({ unavailable: 'gh-failed' })
    }
  })

const unavailableMessages: Record<CiStatusUnavailable['unavailable'], string> = {
  'gh-missing': 'gh is not installed',
  'gh-failed': 'cannot be read from gh',
}

export const ciStatusErrorOf = ({ unavailable }: CiStatusUnavailable): ContractError => ({
  file: 'ci-status',
  location: null,
  field: null,
  message: unavailableMessages[unavailable],
})

export const ciStatusOf = async (source: CiStatusSource, worktree: string): Promise<CiStatusRead> => {
  try {
    return await source(worktree)
  } catch {
    return { unavailable: 'gh-failed' }
  }
}

const absolutePathEntries = (path: string | undefined): string[] =>
  (path ?? '').split(delimiter).flatMap((entry) => (isAbsolute(entry) ? [entry] : []))

const isExecutableFile = (path: string): boolean => {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
  } catch {
    return false
  }
}

export const resolveGh = (env: NodeJS.ProcessEnv): string | null => {
  for (const directory of absolutePathEntries(env.PATH)) {
    const candidate = join(directory, 'gh')
    if (isExecutableFile(candidate)) return candidate
  }
  return null
}

export const createGhRunner =
  (execFile: ExecFile, gh: string | null, env: NodeJS.ProcessEnv = process.env): CiStatusSource =>
  (worktree) =>
    gh === null
      ? Promise.resolve({ unavailable: 'gh-missing' })
      : runGh(execFile, gh, {
          cwd: worktree,
          timeout: GH_TIMEOUT_MS,
          maxBuffer: MAX_TEXT_LENGTH + 1,
          encoding: 'utf8',
          env: { ...env, PATH: absolutePathEntries(env.PATH).join(delimiter), GH_PROMPT_DISABLED: '1' },
        })
