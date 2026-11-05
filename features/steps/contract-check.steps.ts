import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { After, Given, Then, When } from '@cucumber/cucumber'

type CheckWorld = {
  root: string
  worktree: string
  status: number | null
  stdout: string
  stderr: string
}

type Layout = (directory: string) => void

const launcher = fileURLToPath(new URL('../../capture/shared/bin/agent-flow-check.mjs', import.meta.url))

const plan = JSON.stringify({
  issue: '#17',
  title: 'Contract check',
  steps: [
    {
      id: 's1',
      title: 'Implementation',
      role: 'dev-a',
      status: 'in_progress',
      origin: 'planned',
      startedAt: '2026-01-01T10:00:00.000Z',
      endedAt: null,
    },
  ],
})

const decision = JSON.stringify({
  at: '2026-01-01T10:05:00.000Z',
  step: 's1',
  role: 'dev-a',
  kind: 'decision',
  title: 'Use a factory',
  why: 'It keeps the seam narrow',
  confidence: 'high',
})

const layouts: Readonly<Record<string, Layout>> = {
  'a symlinked contract file': (directory) => {
    writeFileSync(join(directory, '..', 'target.json'), plan)
    symlinkSync(join(directory, '..', 'target.json'), join(directory, 'plan.json'))
  },
  'a file that is not a contract': (directory) => writeFileSync(join(directory, 'notes.txt'), 'x'),
  'a leftover temporary file': (directory) => writeFileSync(join(directory, '.plan.json.x.tmp'), plan),
}

const openWorktree = (world: CheckWorld): string => {
  world.root = realpathSync(mkdtempSync(join(tmpdir(), 'contract-check-')))
  world.worktree = join(world.root, 'worktree')
  mkdirSync(world.worktree)
  return world.worktree
}

const openAgentFlow = (world: CheckWorld): string => {
  const directory = join(openWorktree(world), '.agent-flow')
  mkdirSync(directory)
  return directory
}

const errorsOf = (world: CheckWorld): readonly Record<string, unknown>[] => {
  const report = JSON.parse(world.stderr)
  assert.ok(Array.isArray(report.errors), 'stderr must carry an errors array')
  return report.errors
}

Given(
  'a worktree whose .agent-flow holds a valid plan.json and a valid decisions.jsonl',
  function (this: CheckWorld): void {
    const directory = openAgentFlow(this)
    writeFileSync(join(directory, 'plan.json'), plan)
    writeFileSync(join(directory, 'decisions.jsonl'), `${decision}\n`)
  },
)

Given(
  'a worktree whose .agent-flow holds a decisions.jsonl with a malformed second line',
  function (this: CheckWorld): void {
    const directory = openAgentFlow(this)
    writeFileSync(join(directory, 'decisions.jsonl'), `${decision}\n{nope\n`)
  },
)

Given('a worktree whose .agent-flow has {}', function (this: CheckWorld, layout: string): void {
  if (layout === 'no .agent-flow directory') {
    openWorktree(this)
    return
  }
  const build = layouts[layout]
  assert.ok(build !== undefined, `unknown layout: ${layout}`)
  build(openAgentFlow(this))
})

When('the contract check runs on the worktree', function (this: CheckWorld): void {
  const result = spawnSync(process.execPath, [launcher, this.worktree], { cwd: this.root, encoding: 'utf8' })
  this.status = result.status
  this.stdout = result.stdout
  this.stderr = result.stderr
})

Then(
  'it reports plan.json and decisions.jsonl as checked and exits with status 0',
  function (this: CheckWorld): void {
    assert.equal(this.status, 0, this.stderr)
    assert.deepEqual(JSON.parse(this.stdout), { checked: ['decisions.jsonl', 'plan.json'] })
    assert.equal(this.stderr, '')
  },
)

Then(
  'it reports an error naming decisions.jsonl and line 2 and exits with status 1',
  function (this: CheckWorld): void {
    assert.equal(this.status, 1)
    assert.equal(this.stdout, '')
    const [first] = errorsOf(this)
    assert.equal(first?.file, 'decisions.jsonl')
    assert.equal(first?.location, 2)
  },
)

const expectedError: Readonly<Record<string, Record<string, unknown>>> = {
  'a symlinked contract file': { file: 'plan.json', message: 'must be a regular file, not a link' },
  'a file that is not a contract': { file: '.agent-flow', location: 'notes.txt', message: 'is not a contract file' },
  'a leftover temporary file': {
    file: '.agent-flow',
    location: '.plan.json.x.tmp',
    message: 'is not a contract file',
  },
  'no .agent-flow directory': { file: '.agent-flow', message: '.agent-flow is missing' },
}

Then('it reports an error for {} and exits with status 1', function (this: CheckWorld, layout: string): void {
  assert.equal(this.status, 1)
  assert.equal(this.stdout, '')
  const expected = expectedError[layout]
  assert.ok(expected !== undefined, `unknown layout: ${layout}`)
  const errors = errorsOf(this)
  assert.equal(errors.length, 1)
  assert.partialDeepStrictEqual(errors[0], expected)
})

After(function (this: CheckWorld): void {
  if (this.root !== undefined) rmSync(this.root, { recursive: true, force: true })
})
