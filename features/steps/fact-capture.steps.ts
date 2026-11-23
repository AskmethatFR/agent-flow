import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Given, Then, When } from '@cucumber/cucumber'
import { checkContractFile } from '@agent-flow/core/contracts'

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

const repo = fileURLToPath(new URL('../../', import.meta.url))
const factHook = join(repo, 'capture/claude-code/src/fact-capture/hook.ts')
const factsPathOf = (world: FactCaptureWorld): string => join(world.worktree, '.agent-flow', 'verified-facts.jsonl')

Given('a plan whose step {string} is in progress for the role {word}', function (this: FactCaptureWorld, id: string, role: string): void {
  this.root = realpathSync(mkdtempSync(join(tmpdir(), 'fact-capture-')))
  this.worktree = join(this.root, 'worktree')
  mkdirSync(join(this.worktree, '.agent-flow'), { recursive: true })
  const step = {
    id,
    title: `${role}: work on the slice`,
    role,
    status: 'in_progress',
    origin: 'planned',
    startedAt: '2026-11-23T11:00:00.000Z',
    endedAt: null,
  }
  writeFileSync(
    join(this.worktree, '.agent-flow', 'plan.json'),
    JSON.stringify({ issue: '#128', title: 'Vitest fact capture', steps: [step] }),
  )
})

// The host delivers a passing run as PostToolUse and a failing one as PostToolUseFailure
// (docs/technical/decisions/evidence/verified-facts/capture-128/run.txt).
const endedEventOf = (outcome: string): object =>
  outcome === 'passing'
    ? {
        hook_event_name: 'PostToolUse',
        tool_response: { stdout: 'JSON report written', stderr: '', interrupted: false, isImage: false, noOutputExpected: false },
      }
    : { hook_event_name: 'PostToolUseFailure', error: 'Exit code 1', is_interrupt: false }

// The main session's events carry no agent_type (docs/technical/decisions/verified-facts.md S12 (a)).
const runVitest = (
  world: FactCaptureWorld,
  agentType: string | undefined,
  command: string,
  outcome: string,
  passed: number,
  total: number,
): void => {
  const reportDirectory = join(world.worktree, 'reports', 'vitest')
  mkdirSync(reportDirectory, { recursive: true })
  const failed = total - passed
  writeFileSync(
    join(reportDirectory, 'vitest.json'),
    JSON.stringify({
      numTotalTests: total,
      numPassedTests: passed,
      numFailedTests: failed,
      numFailedTestSuites: failed === 0 ? 0 : 1,
      testResults: [{ name: 'tests/a.test.ts', message: '', assertionResults: [] }],
    }),
  )
  const result = spawnSync(join(repo, 'node_modules/.bin/tsx'), [factHook], {
    cwd: world.worktree,
    input: JSON.stringify({
      ...endedEventOf(outcome),
      cwd: world.worktree,
      agent_id: 'a1b2c3',
      agent_type: agentType,
      tool_name: 'Bash',
      tool_input: { command, description: 'Run vitest' },
      tool_use_id: 'toolu_01',
      duration_ms: 631,
    }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: world.worktree },
  })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, '')
}

When(
  'a subagent of type {string} runs {string} and it ends {word}, {int} of {int} tests passed',
  function (this: FactCaptureWorld, agentType: string, command: string, outcome: string, passed: number, total: number): void {
    runVitest(this, agentType, command, outcome, passed, total)
  },
)

When(
  'the main session runs {string} and it ends {word}, {int} of {int} tests passed',
  function (this: FactCaptureWorld, command: string, outcome: string, passed: number, total: number): void {
    runVitest(this, undefined, command, outcome, passed, total)
  },
)

// A role that the host did not observe is written as null in the file; the feature writes it "null".
const nullable = (word: string): string | null => (word === 'null' ? null : word)

Then(
  'verified-facts.jsonl holds one line on step {string}, attachment {word}, role {word}, roleFrom {word}, with {int} passed of {int} and {int} failed suites',
  function (
    this: FactCaptureWorld,
    step: string,
    attachment: string,
    role: string,
    roleFrom: string,
    passed: number,
    total: number,
    failedSuites: number,
  ): void {
    const lines = readFileSync(factsPathOf(this), 'utf8').split('\n')
    assert.equal(lines.length, 2, 'one line ending with a newline')
    assert.equal(lines[1], '')
    const { at, ...rest } = JSON.parse(lines[0] as string)
    assert.match(at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    assert.deepEqual(rest, {
      tool: 'vitest',
      step,
      attachment,
      role: nullable(role),
      roleFrom: nullable(roleFrom),
      passed,
      total,
      failedSuites,
    })
  },
)

Then(
  'verified-facts.jsonl holds two lines in run order, on step {string}, the first with {int} passed of {int} and the second with {int} passed of {int}',
  function (
    this: FactCaptureWorld,
    step: string,
    firstPassed: number,
    firstTotal: number,
    secondPassed: number,
    secondTotal: number,
  ): void {
    const content = readFileSync(factsPathOf(this), 'utf8')
    assert.ok(content.endsWith('\n'), 'the file ends with a newline')
    const lines = content.slice(0, -1).split('\n')
    assert.equal(lines.length, 2, 'exactly two lines, none empty')
    const facts = lines.map((line) => JSON.parse(line))
    const withoutAt = ({ at: _at, ...rest }: Record<string, unknown>): Record<string, unknown> => rest
    const expected = (passed: number, total: number): Record<string, unknown> => ({
      tool: 'vitest',
      step,
      attachment: 'role',
      role: 'qa',
      roleFrom: 'host',
      passed,
      total,
      failedSuites: total === passed ? 0 : 1,
    })
    assert.deepEqual(facts.map(withoutAt), [expected(firstPassed, firstTotal), expected(secondPassed, secondTotal)])
    assert.ok(facts[0].at <= facts[1].at, 'the second line was written after the first')
  },
)

Then('that line passes the contract check', function (this: FactCaptureWorld): void {
  assert.deepEqual(checkContractFile('verified-facts.jsonl', readFileSync(factsPathOf(this), 'utf8')), { accepted: true })
})

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
