import assert from 'node:assert/strict'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Runtime = 'Claude Code' | 'OpenCode v2'

export const repo = realpathSync(fileURLToPath(new URL('../../', import.meta.url)))
export const runtimes: readonly Runtime[] = ['Claude Code', 'OpenCode v2']
export const claudeShimPath = join(repo, 'rules', 'claude-code', 'CLAUDE.md')
export const opencodeShimPath = join(repo, 'rules', 'opencode', 'opencode.json')

export const opencodeShim = (): { plugins: string[]; instructions: string[] } =>
  JSON.parse(readFileSync(opencodeShimPath, 'utf8'))

export const ruleFileNamed = (name: string): string => realpathSync(join(repo, 'rules', name))

const claudeRules = (): string[] =>
  readFileSync(claudeShimPath, 'utf8')
    .split('\n')
    .flatMap((line) => /^@(\S+)$/.exec(line)?.[1] ?? [])
    .map((path) => realpathSync(resolve(dirname(claudeShimPath), path)))

const opencodeRules = (home: string): string[] =>
  opencodeShim().instructions.map((instruction) => realpathSync(instruction.replace('{env:AGENT_FLOW_HOME}', home)))

export const rulesReachedBy = (runtime: Runtime, home: string = repo): string[] =>
  (runtime === 'Claude Code' ? claudeRules() : opencodeRules(home)).sort()

export const assertShimsMirror = (): void => {
  assert.deepEqual(
    rulesReachedBy('OpenCode v2'),
    rulesReachedBy('Claude Code'),
    'both shims must reach the same set of rule files',
  )
}
