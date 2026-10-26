import { readFileSync } from 'node:fs'
import { posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import vitestConfig from '../../vitest.config'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const readJson = (name: string) => JSON.parse(readFileSync(`${repoRoot}${name}`, 'utf8'))

const projects = (vitestConfig.test?.projects ?? []) as {
  test: { root: string; include: string[] }
}[]

const allowedTopLevel = ['core', 'daemon', 'panel', 'capture', 'features', 'vitest.config.ts']

const topLevelOf = (entry: string) => posix.normalize(entry).split('/')[0] ?? ''

describe('workspace perimeter', () => {
  it.each([
    ['workspaces', () => readJson('package.json').workspaces],
    ['tsconfig include', () => readJson('tsconfig.json').include],
    ['vitest project roots', () => projects.map((project) => project.test.root)],
    [
      'vitest project includes',
      () => projects.flatMap((project) => project.test.include.map((glob) => posix.join(project.test.root, glob))),
    ],
  ])('keeps %s inside the allowed top-level folders, so spikes stay out', (_name, entries) => {
    const listed: string[] = entries()

    expect(listed.length).toBeGreaterThan(0)
    expect(listed.filter((entry) => !allowedTopLevel.includes(topLevelOf(entry)))).toEqual([])
  })
})
