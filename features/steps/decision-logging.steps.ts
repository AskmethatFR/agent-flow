import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { After, Given, Then, When } from '@cucumber/cucumber'
import { validateDecisions } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { assertShimsMirror, opencodeShim, opencodeShimPath, repo, rulesReachedBy, runtimes } from './rule-shims'
import type { Runtime } from './rule-shims'

type Shell = 'sh' | 'bash'

type Run = {
  worktree: string
  cwd: string
  env: NodeJS.ProcessEnv
}

type Choice = {
  role: string
  title: string
  why: string
  rejected: readonly string[]
  confidence: string
  shell: Shell
  rawTitle?: string
}

type Launch = {
  status: number | null
  stdout: string
  stderr: string
}

type LoggingWorld = {
  root: string
  runs: Map<Runtime, Run>
  logged: Choice[]
  results: Map<Runtime, ValidationResult>
  home: string | undefined
  launch: Launch
  record: string
  sent: readonly string[]
}

const ruleFile = join(repo, 'rules', 'decision-logging.md')
const roleIds: Readonly<Record<string, string>> = {
  PM: 'pm',
  Architect: 'architect',
  'Dev A': 'dev-a',
  'Dev B': 'dev-b',
  QA: 'qa',
  Security: 'security',
}
const roles: readonly string[] = Object.values(roleIds)
const clockStamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
const forgedAt = '1999-01-01T00:00:00Z'

const ruleTextFor = (runtime: Runtime): string => {
  assertShimsMirror()
  assert.ok(rulesReachedBy(runtime).includes(realpathSync(ruleFile)), `${runtime} must load rules/decision-logging.md`)
  return readFileSync(ruleFile, 'utf8')
}

const commandTemplateFor = (runtime: Runtime): string => {
  const blocks = [...ruleTextFor(runtime).matchAll(/^```sh\n([\s\S]*?)\n```$/gm)]
  assert.equal(blocks.length, 1, 'the rule must hold exactly one sh command template')
  return blocks[0]?.[1] as string
}

const jsonText = (value: string): string => JSON.stringify(value).slice(1, -1)

const filled = (template: string, choice: Choice): string =>
  template
    .replace('<role>', () => jsonText(choice.role))
    .replace('<title>', () => choice.rawTitle ?? jsonText(choice.title))
    .replace('<why>', () => jsonText(choice.why))
    .replace('<rejected>', () => choice.rejected.map((item) => JSON.stringify(item)).join(','))
    .replace('<confidence>', () => jsonText(choice.confidence))

const choiceBy = (role: string, overlays: Partial<Choice> = {}): Choice => ({
  role,
  title: `${role} picks a seam`,
  why: 'It keeps the change small',
  rejected: [],
  confidence: 'high',
  shell: 'sh',
  ...overlays,
})

const inProgressStep = (id: string, role: string, startedAt: string): Record<string, unknown> => ({
  id,
  title: 'Implementation',
  role,
  status: 'in_progress',
  origin: 'planned',
  startedAt,
  endedAt: null,
})

const planOf = (...steps: readonly Record<string, unknown>[]): string =>
  JSON.stringify({ issue: '#16', title: 'Decision logging', steps })

const planWith = (id: string): string => planOf(inProgressStep(id, 'dev-a', '2026-01-01T10:00:00.000Z'))

const runtimeEnv = (extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({
  ...process.env,
  AGENT_FLOW_HOME: repo,
  AGENT_FLOW_WORKTREE: undefined,
  GIT_DIR: undefined,
  GIT_WORK_TREE: undefined,
  ...extra,
})

const claudeRun = (root: string): Run => {
  const worktree = join(root, 'claude-code')
  const cwd = join(worktree, 'sub')
  mkdirSync(cwd, { recursive: true })
  const init = spawnSync('git', ['init', '-q'], { cwd: worktree, encoding: 'utf8', env: runtimeEnv({}) })
  assert.equal(init.status, 0, init.stderr)
  return { worktree, cwd, env: runtimeEnv({}) }
}

const opencodeRun = (root: string): Run => {
  const worktree = join(root, 'opencode')
  const cwd = join(root, 'elsewhere')
  mkdirSync(worktree)
  mkdirSync(cwd)
  return { worktree, cwd, env: runtimeEnv({ AGENT_FLOW_WORKTREE: worktree }) }
}

const decisionsOf = (run: Run): string => join(run.worktree, '.agent-flow', 'decisions.jsonl')

const openRuns = (world: LoggingWorld, plan: string): void => {
  world.root = realpathSync(mkdtempSync(join(tmpdir(), 'decision-logging-')))
  world.logged = []
  world.runs = new Map([
    ['Claude Code', claudeRun(world.root)],
    ['OpenCode v2', opencodeRun(world.root)],
  ])
  for (const run of world.runs.values()) {
    mkdirSync(join(run.worktree, '.agent-flow'))
    writeFileSync(join(run.worktree, '.agent-flow', 'plan.json'), plan)
  }
}

const runOf = (world: LoggingWorld, runtime: Runtime): Run => {
  const run = world.runs.get(runtime)
  assert.ok(run !== undefined, `no run for ${runtime}`)
  return run
}

const log = (world: LoggingWorld, runtime: Runtime, choice: Choice): void => {
  const run = runOf(world, runtime)
  const result = spawnSync(choice.shell, ['-c', filled(commandTemplateFor(runtime), choice)], {
    cwd: run.cwd,
    encoding: 'utf8',
    env: run.env,
  })
  assert.equal(result.status, 0, `${runtime} command failed: ${result.stderr}`)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, '')
}

const logEverywhere = (world: LoggingWorld, choice: Choice): void => {
  for (const runtime of runtimes) log(world, runtime, choice)
  world.logged.push(choice)
}

const linesOf = (world: LoggingWorld, runtime: Runtime): Record<string, unknown>[] =>
  readFileSync(decisionsOf(runOf(world, runtime)), 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line))

const hostileChoices = (canary: string): Choice[] => [
  choiceBy('dev-a', { why: `It's "quoted" and has a back\\slash`, confidence: 'low', shell: 'sh' }),
  choiceBy('dev-b', { title: 'Two\nlines', why: 'Line one\nline two', rejected: ['A', 'B "b"'], confidence: 'medium', shell: 'bash' }),
  choiceBy('qa', { why: 'Run `touch ' + canary + '` or $(touch ' + canary + ') or ${HOME}', confidence: 'high', shell: 'sh' }),
  choiceBy('security', { title: "it's $(touch " + canary + ')', why: 'DECISION is not a line by itself', rejected: ['x'], shell: 'bash' }),
  choiceBy('pm', { title: 'x', rawTitle: `x","at":"${forgedAt}`, rejected: ['y'], confidence: 'medium' }),
]

const confidences: readonly string[] = ['high', 'medium', 'low']

const assertLoggedAsChosen = (world: LoggingWorld, runtime: Runtime): void => {
  const lines = linesOf(world, runtime)
  const chosen = world.logged
  assert.equal(lines.length, chosen.length)
  assert.deepEqual(lines.map((line) => line.role), chosen.map((choice) => choice.role))
  assert.deepEqual(lines.map((line) => line.title), chosen.map((choice) => choice.title))
  assert.deepEqual(lines.map((line) => line.why), chosen.map((choice) => choice.why))
  assert.deepEqual(lines.map((line) => line.confidence), chosen.map((choice) => choice.confidence))
  assert.deepEqual(lines.map((line) => line.rejected ?? []), chosen.map((choice) => choice.rejected))
  assert.ok(lines.every((line) => line.kind === 'decision'))
}

Given('an agent makes a technical choice', function (this: LoggingWorld): void {
  openRuns(this, planWith('s1'))
  for (const runtime of runtimes) {
    const text = ruleTextFor(runtime)
    for (const [role, id] of Object.entries(roleIds)) {
      assert.ok(text.includes(`| ${role} | \`${id}\` |`), `${runtime} rule must map ${role} to ${id}`)
    }
  }
  roles.forEach((role, index) =>
    logEverywhere(this, choiceBy(role, { confidence: confidences[index % confidences.length] as string })),
  )
})

Then(
  'decisions.jsonl contains a line with step, role, title, why and confidence',
  function (this: LoggingWorld): void {
    for (const runtime of runtimes) {
      const lines = linesOf(this, runtime)
      assert.equal(lines.length, roles.length)
      assertLoggedAsChosen(this, runtime)
      for (const line of lines) {
        assert.equal(line.step, 's1')
        for (const field of ['title', 'why', 'confidence']) {
          assert.equal(typeof line[field], 'string')
          assert.notEqual(line[field], '')
        }
      }
    }
  },
)

Given('the step {string} is in progress', function (this: LoggingWorld, id: string): void {
  openRuns(this, planWith(id))
})

Given(
  'the steps {string} of role {string} and {string} of role {string} are in progress, {string} started last',
  function (
    this: LoggingWorld,
    first: string,
    firstRole: string,
    second: string,
    secondRole: string,
    last: string,
  ): void {
    assert.equal(last, second, 'the second step must be the one started last')
    openRuns(
      this,
      planOf(
        inProgressStep(first, firstRole, '2026-01-01T10:00:00.000Z'),
        inProgressStep(second, secondRole, '2026-01-01T10:05:00.000Z'),
      ),
    )
  },
)

When('the {string} and {string} agents each log a decision', function (this: LoggingWorld, first: string, second: string): void {
  logEverywhere(this, choiceBy(first))
  logEverywhere(this, choiceBy(second))
})

Then(
  'the decision line of role {string} has step {string}',
  function (this: LoggingWorld, role: string, step: string): void {
    for (const runtime of runtimes) {
      const lines = linesOf(this, runtime).filter((line) => line.role === role)
      assert.equal(lines.length, 1)
      assert.equal(lines[0]?.step, step)
    }
  },
)

When('the {string} agent logs a decision', function (this: LoggingWorld, role: string): void {
  logEverywhere(this, choiceBy(role))
})

Then(
  'the decision line has step {string} and role {string}',
  function (this: LoggingWorld, step: string, role: string): void {
    for (const runtime of runtimes) {
      const lines = linesOf(this, runtime)
      assert.equal(lines.length, 1)
      assert.equal(lines[0]?.step, step)
      assert.equal(lines[0]?.role, role)
    }
  },
)

Given('an agent has logged several decisions', function (this: LoggingWorld): void {
  openRuns(this, planWith('s1'))
  for (const choice of hostileChoices(join(this.root, 'canary'))) logEverywhere(this, choice)
})

When('core validates decisions.jsonl', function (this: LoggingWorld): void {
  this.results = new Map(
    runtimes.map((runtime) => [
      runtime,
      validateDecisions(readFileSync(decisionsOf(runOf(this, runtime)), 'utf8')),
    ]),
  )
})

Then('every line is accepted', function (this: LoggingWorld): void {
  assert.equal(existsSync(join(this.root, 'canary')), false, 'agent text must never be executed')
  for (const runtime of runtimes) {
    assert.deepEqual(this.results.get(runtime), { accepted: true })
    assertLoggedAsChosen(this, runtime)
    for (const line of linesOf(this, runtime)) {
      assert.match(String(line.at), clockStamp)
      assert.notEqual(line.at, forgedAt)
    }
  }
})

const tsx = join(repo, 'node_modules', '.bin', 'tsx')

const guardProbe = `
const { default: plugin } = await import(process.argv[2])
await plugin.setup()
process.stdout.write(JSON.stringify({ id: plugin.id }) + '\\n')
`

const openGuardScenario = (world: LoggingWorld): void => {
  world.root = realpathSync(mkdtempSync(join(tmpdir(), 'decision-logging-guard-')))
}

Given(/^OpenCode v2 has AGENT_FLOW_HOME (unset|empty)$/, function (this: LoggingWorld, state: string): void {
  openGuardScenario(this)
  this.home = state === 'unset' ? undefined : ''
})

Given('OpenCode v2 has AGENT_FLOW_HOME naming another checkout', function (this: LoggingWorld): void {
  openGuardScenario(this)
  this.home = join(this.root, 'another-checkout')
  mkdirSync(join(this.home, 'rules'), { recursive: true })
  writeFileSync(join(this.home, 'rules', 'decision-logging.md'), 'another checkout rule\n')
})

Given('OpenCode v2 has AGENT_FLOW_HOME naming a path that does not exist', function (this: LoggingWorld): void {
  openGuardScenario(this)
  this.home = join(this.root, 'no-such-checkout')
})

Given(
  /^OpenCode v2 has AGENT_FLOW_HOME naming this checkout (exactly|through a symlink)$/,
  function (this: LoggingWorld, reference: string): void {
    openGuardScenario(this)
    this.home = repo
    if (reference === 'exactly') return
    this.home = join(this.root, 'checkout-link')
    symlinkSync(repo, this.home)
  },
)

When('OpenCode v2 starts with the shim', function (this: LoggingWorld): void {
  const { plugins } = opencodeShim()
  assert.equal(plugins.length, 1, 'the OpenCode shim must enable exactly one plugin')
  const probe = join(this.root, 'probe.mjs')
  writeFileSync(probe, guardProbe)
  const result = spawnSync(
    tsx,
    ['--tsconfig', join(repo, 'tsconfig.json'), probe, join(resolve(dirname(opencodeShimPath), plugins[0] as string), 'index.ts')],
    { cwd: this.root, encoding: 'utf8', env: { ...process.env, AGENT_FLOW_HOME: this.home } },
  )
  this.launch = { status: result.status, stdout: result.stdout, stderr: result.stderr }
})

const launcherPath = join(repo, 'rules', 'opencode', 'agent-flow-opencode')
const launcherArguments: readonly string[] = ['run', '--standalone', 'two words', '', '$HOME', '*', '--', "it's", 'line\nbreak']

When('the OpenCode launcher runs with arguments', function (this: LoggingWorld): void {
  const bin = join(this.root, 'bin')
  const elsewhere = join(this.root, 'elsewhere')
  mkdirSync(bin)
  mkdirSync(elsewhere)
  this.record = join(this.root, 'record')
  this.sent = launcherArguments
  writeFileSync(join(bin, 'opencode'), `#!/bin/sh\n: > '${this.record}'\nfor argument in "$@"; do printf '%s\\0' "$argument" >> '${this.record}'; done\n`, { mode: 0o755 })
  const result = spawnSync(launcherPath, [...launcherArguments], {
    cwd: elsewhere,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, AGENT_FLOW_HOME: this.home },
  })
  assert.ifError(result.error)
  this.launch = { status: result.status, stdout: result.stdout, stderr: result.stderr }
})

Then('OpenCode is not started', function (this: LoggingWorld): void {
  assert.notEqual(this.launch.status, 0, 'the launcher must exit non-zero')
  assert.equal(existsSync(this.record), false, 'OpenCode must not have run')
  assert.equal(this.launch.stdout, '')
})

Then('OpenCode is started with those arguments unchanged', function (this: LoggingWorld): void {
  assert.equal(this.launch.status, 0)
  assert.deepEqual(readFileSync(this.record, 'utf8').split('\0').slice(0, -1), [...this.sent])
})

Then('stderr has one line naming {string}', function (this: LoggingWorld, name: string): void {
  const lines = this.launch.stderr.split('\n')
  assert.equal(lines.length, 2, 'stderr must hold exactly one newline-terminated line')
  assert.equal(lines[1], '')
  assert.ok((lines[0] as string).includes(name), `stderr must name ${name}`)
})

Then('the decision-logging rule is not loaded', function (this: LoggingWorld): void {
  assert.equal(this.launch.status, 1, 'the rule guard must terminate the session with exit code 1')
  assert.equal(this.launch.stdout, '', 'nothing may start after the guard refused')
})

Then('the stderr line does not echo the value of AGENT_FLOW_HOME', function (this: LoggingWorld): void {
  if (this.home === undefined || this.home === '') return
  assert.ok(!this.launch.stderr.includes(this.home))
})

Then('the decision-logging rule is loaded', function (this: LoggingWorld): void {
  assert.equal(this.launch.status, 0, 'the rule guard must let the setup proceed')
  assert.ok(rulesReachedBy('OpenCode v2', this.home).includes(realpathSync(ruleFile)))
})

Then('the shim lists each rule file once', function (this: LoggingWorld): void {
  const reached = rulesReachedBy('OpenCode v2', this.home)
  assert.equal(opencodeShim().instructions.length, new Set(reached).size, 'each instruction must name a distinct rule file')
})

Then('stderr is empty', function (this: LoggingWorld): void {
  assert.equal(this.launch.stderr, '')
})

After(function (this: LoggingWorld): void {
  if (this.root !== undefined) rmSync(this.root, { recursive: true, force: true })
})
