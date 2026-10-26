import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const realScripts = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts

const passingFeature = `Feature: Fixture
  Scenario: Passing
    Given a passing step
`

const passingSteps = `import { Given } from '@cucumber/cucumber'

Given('a passing step', function (this: unknown): void {})
`

const manualFeature = `@manual
Feature: Manual fixture
  Scenario: Never run
    Given a step nobody defined
`

const sandboxes: string[] = []

function sandbox(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-runner-'))
  sandboxes.push(dir)
  symlinkSync(join(repoRoot, 'node_modules'), join(dir, 'node_modules'))
  symlinkSync(join(repoRoot, 'cucumber.js'), join(dir, 'cucumber.js'))
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ type: 'module', scripts: { bdd: realScripts.bdd } }),
  )
  for (const [relative, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, relative)), { recursive: true })
    writeFileSync(join(dir, relative), content)
  }
  return dir
}

function runBdd(dir: string) {
  const result = spawnSync('npm', ['run', 'bdd'], { cwd: dir, encoding: 'utf8' })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

afterEach(() => {
  for (const dir of sandboxes.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('npm run bdd', { timeout: 30_000 }, () => {
  it('exits 0 and reports 0 scenarios when no feature file exists', () => {
    const run = runBdd(sandbox({}))

    expect(run.status).toBe(0)
    expect(run.output).toContain('0 scenarios')
  })

  it('skips a @manual feature that has no step definition', () => {
    const run = runBdd(sandbox({ 'features/phase-x/manual.feature': manualFeature }))

    expect(run.status).toBe(0)
    expect(run.output).toContain('0 scenarios')
  })

  it('runs a scenario against TypeScript step definitions from features/steps', () => {
    const run = runBdd(
      sandbox({
        'features/area/passing.feature': passingFeature,
        'features/steps/passing.steps.ts': passingSteps,
      }),
    )

    expect(run.status).toBe(0)
    expect(run.output).toContain('1 scenario (1 passed)')
  })

  it('exits non-zero when a scenario has no step definition', () => {
    const run = runBdd(sandbox({ 'features/area/passing.feature': passingFeature }))

    expect(run.status).not.toBe(0)
    expect(run.output).toContain('1 undefined')
  })

  it('fails with an ambiguity error when two step definitions share the same text', () => {
    const run = runBdd(
      sandbox({
        'features/area/passing.feature': passingFeature,
        'features/steps/first.steps.ts': passingSteps,
        'features/steps/second.steps.ts': passingSteps,
      }),
    )

    expect(run.status).not.toBe(0)
    expect(run.output).toContain('Multiple matching step definitions found')
    expect(run.output).toContain('1 ambiguous')
  })
})
