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
  detected: 2410,
  surviving: 3,
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
