import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Given, Then } from '@cucumber/cucumber'

// The When step and the cleanup are those of contract-check.steps.ts: the two files share the
// World fields root, worktree, status, stdout and stderr.
type FactCaptureWorld = {
  root: string
  worktree: string
  status: number | null
  stdout: string
  stderr: string
}

const attachedVitestLine = JSON.stringify({
  at: '2026-11-23T12:00:00.000Z',
  tool: 'vitest',
  step: '1',
  attachment: 'role',
  role: 'dev-a',
  roleFrom: 'agent',
  passed: 1791,
  total: 1791,
  failedSuites: 0,
})

const unattachedStrykerLine = JSON.stringify({
  at: '2026-11-23T12:05:00.000Z',
  tool: 'stryker',
  step: null,
  attachment: 'unattached',
  role: null,
  roleFrom: null,
  detected: 47,
  surviving: 1,
})

Given(
  'a worktree whose .agent-flow holds a valid verified-facts.jsonl and a stray verified-facts.json',
  function (this: FactCaptureWorld): void {
    this.root = realpathSync(mkdtempSync(join(tmpdir(), 'fact-capture-')))
    this.worktree = join(this.root, 'worktree')
    const directory = join(this.worktree, '.agent-flow')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'verified-facts.jsonl'), `${attachedVitestLine}\n${unattachedStrykerLine}\n`)
    writeFileSync(join(directory, 'verified-facts.json'), '{}')
  },
)

const failureText = 'AssertionError: expected 1 to be 2 at /home/runner/work/secret/path.test.ts:42'

Given(
  'a worktree whose .agent-flow holds a verified-facts.jsonl whose second line carries {string} with a failure text',
  function (this: FactCaptureWorld, key: string): void {
    this.root = realpathSync(mkdtempSync(join(tmpdir(), 'fact-capture-')))
    this.worktree = join(this.root, 'worktree')
    const directory = join(this.worktree, '.agent-flow')
    mkdirSync(directory, { recursive: true })
    const carrying = JSON.stringify({ ...JSON.parse(unattachedStrykerLine), [key]: [failureText] })
    writeFileSync(join(directory, 'verified-facts.jsonl'), `${attachedVitestLine}\n${carrying}\n`)
  },
)

Then(
  'it reports one error naming verified-facts.jsonl, line {int} and the key {string} as not allowed, and exits with status {int}',
  function (this: FactCaptureWorld, line: number, key: string, status: number): void {
    assert.equal(this.status, status)
    assert.equal(this.stdout, '')
    const report = JSON.parse(this.stderr)
    assert.deepEqual(report.errors, [{ file: 'verified-facts.jsonl', location: line, field: key, message: 'is not allowed' }])
  },
)

Then('the failure text appears in neither its output nor its error output', function (this: FactCaptureWorld): void {
  assert.ok(!this.stdout.includes(failureText), 'the failure text reached stdout')
  assert.ok(!this.stderr.includes(failureText), 'the failure text reached stderr')
})

Then(
  'it reports one error, for verified-facts.json not being a contract file, and exits with status 1',
  function (this: FactCaptureWorld): void {
    assert.equal(this.status, 1)
    assert.equal(this.stdout, '')
    const report = JSON.parse(this.stderr)
    assert.deepEqual(report.errors, [
      { file: '.agent-flow', location: 'verified-facts.json', field: null, message: 'is not a contract file' },
    ])
  },
)
