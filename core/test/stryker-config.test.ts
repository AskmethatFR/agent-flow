import { readFileSync } from 'node:fs'
import { matchesGlob } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const config = JSON.parse(readFileSync(`${repoRoot}stryker.config.json`, 'utf8'))

const isMutated = (path: string): boolean => {
  const patterns: string[] = config.mutate
  const matches = (pattern: string) => matchesGlob(path, pattern)
  const included = patterns.filter((pattern) => !pattern.startsWith('!')).some(matches)
  const excluded = patterns.filter((pattern) => pattern.startsWith('!')).some((pattern) => matches(pattern.slice(1)))
  return included && !excluded
}

describe('stryker config', () => {
  it('runs through the vitest runner', () => {
    expect(config.testRunner).toBe('vitest')
  })

  it.each([
    ['core/src/placeholder/index.ts', true],
    ['core/src/deep/nested/module.ts', true],
    ['core/src/placeholder/add.test.ts', false],
    ['core/test/stryker-config.test.ts', false],
    ['spikes/capture/probe.ts', false],
    ['daemon/src/index.ts', false],
    ['capture/shared/src/plan-writer/plan-writer.ts', true],
    ['capture/shared/src/plan-writer/plan-writer.test.ts', false],
    ['capture/claude-code/src/index.ts', false],
  ])('mutates %s: %s', (path, mutated) => {
    expect(isMutated(path)).toBe(mutated)
  })

  it('fails the run on a single surviving mutant', () => {
    expect(config.thresholds.break).toBe(100)
  })
})
