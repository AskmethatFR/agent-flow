import { readFileSync } from 'node:fs'
import { matchesGlob, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import vitestConfig from '../../vitest.config'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const tsconfigInclude: string[] = JSON.parse(readFileSync(`${repoRoot}tsconfig.json`, 'utf8')).include

const projects = (vitestConfig.test?.projects ?? []) as {
  test: { name: string; root: string; include: string[] }
}[]

const expandBraces = (glob: string): string[] => {
  const group = /\{([^}]+)\}/.exec(glob)
  return group ? (group[1] ?? '').split(',').map((option) => glob.replace(group[0], option)) : [glob]
}

const isCovered = (glob: string, includeEntries: string[]) =>
  includeEntries.some((entry) => matchesGlob(glob, entry) || matchesGlob(glob, `${entry}/**`))

const isTypechecked = (glob: string) => isCovered(glob, tsconfigInclude)

describe('include coverage matching', () => {
  it.each([
    ['daemon/src/**/*.test.ts', ['daemon/**/*.ts'], true],
    ['core/src/**/*.test.ts', ['core/src'], true],
    ['capture/shared/src/**/*.test.ts', ['capture/*/src'], true],
    ['panel/**/*.test.tsx', ['panel/**/*.test.tsx'], true],
    ['panel/**/*.test.tsx', ['panel/index.client.tsx'], false],
    ['spikes/capture/x.test.ts', ['daemon/**/*.ts', 'capture/*/src'], false],
    ['core/src-extra/x.test.ts', ['core/src'], false],
  ])('%s against %j is covered: %s', (glob, entries, covered) => {
    expect(isCovered(glob, entries)).toBe(covered)
  })
})

describe('typecheck coverage', () => {
  it.each(projects.map((project) => [project.test.name, project] as const))(
    'typechecks every test file the %s project collects',
    (_name, project) => {
      const collected = project.test.include.flatMap(expandBraces).map((glob) => posix.join(project.test.root, glob))

      expect(collected.length).toBeGreaterThan(0)
      expect(collected.filter((glob) => !isTypechecked(glob))).toEqual([])
    },
  )
})
