import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const repo = fileURLToPath(new URL('../../../../', import.meta.url))
const sourceRoot = join(repo, 'capture/opencode/src')
const lifecycleDirectory = join(repo, 'core/src/lifecycle')

const importsOf = (path: string): string[] =>
  ts.preProcessFile(readFileSync(path, 'utf8'), true, true).importedFiles.map((file) => file.fileName)

const reachesLifecycle = (path: string): string[] =>
  importsOf(path).filter(
    (specifier) =>
      specifier === '@agent-flow/core/lifecycle' ||
      (specifier.startsWith('.') &&
        (resolve(dirname(path), specifier) === lifecycleDirectory ||
          resolve(dirname(path), specifier).startsWith(`${lifecycleDirectory}/`))),
  )

const sources = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sources(path)
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : []
  })

let root: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'opencode-no-lifecycle-')))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('the OpenCode plugin holds no lifecycle rule', () => {
  it('finds the non-test sources', () => {
    expect(sources(sourceRoot).map((path) => relative(sourceRoot, path)).sort()).toEqual([
      'rule-guard/entry.ts',
      'rule-guard/index.ts',
      'rule-guard/rule-guard.ts',
      'step-timing/entry.ts',
      'step-timing/index.ts',
      'step-timing/plugin.ts',
      'step-timing/step-timing.ts',
    ])
  })

  it('imports the lifecycle from no non-test source', () => {
    for (const path of sources(sourceRoot)) {
      expect(reachesLifecycle(path), relative(repo, path)).toEqual([])
    }
  })

  it('flags a relative import that resolves into core/lifecycle', () => {
    const fixture = join(root, 'sneaky.ts')
    writeFileSync(fixture, `import { startStep } from '${relative(root, lifecycleDirectory)}/index'\nvoid startStep\n`)
    expect(reachesLifecycle(fixture)).toHaveLength(1)
    writeFileSync(fixture, `import { startStep } from '${relative(root, lifecycleDirectory)}'\nvoid startStep\n`)
    expect(reachesLifecycle(fixture)).toHaveLength(1)
    writeFileSync(fixture, `import { startStep } from '@agent-flow/core/lifecycle'\nvoid startStep\n`)
    expect(reachesLifecycle(fixture)).toHaveLength(1)
    writeFileSync(fixture, `import { x } from './lifecycle-lookalike'\nvoid x\n`)
    expect(reachesLifecycle(fixture)).toEqual([])
  })

  it('calls the shared plan writer from step-timing.ts', () => {
    expect(importsOf(join(sourceRoot, 'step-timing/step-timing.ts'))).toContain('@agent-flow/capture-shared/plan-writer')
  })
})
