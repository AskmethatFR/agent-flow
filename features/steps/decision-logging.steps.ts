import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { After, Given, Then, When } from '@cucumber/cucumber'
import { validateDecisions } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'

type Runtime = 'Claude Code' | 'OpenCode v2'
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

type LoggingWorld = {
  root: string
  runs: Map<Runtime, Run>
  logged: Choice[]
  results: Map<Runtime, ValidationResult>
}

const repo = realpathSync(fileURLToPath(new URL('../../', import.meta.url)))
const ruleFile = join(repo, 'rules', 'decision-logging.md')
const runtimes: readonly Runtime[] = ['Claude Code', 'OpenCode v2']
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

const claudeRule = (): string => {
  const shim = join(repo, 'rules', 'claude-code', 'CLAUDE.md')
  const imports = readFileSync(shim, 'utf8')
    .split('\n')
    .flatMap((line) => /^@(\S+)$/.exec(line)?.[1] ?? [])
  assert.equal(imports.length, 1, 'the Claude Code shim must import exactly one file')
  return realpathSync(resolve(dirname(shim), imports[0] as string))
}

const opencodeRule = (): string => {
  const config = JSON.parse(readFileSync(join(repo, 'rules', 'opencode', 'opencode.json'), 'utf8'))
  assert.equal(config.instructions.length, 1, 'the OpenCode shim must list exactly one instruction')
  return realpathSync(config.instructions[0].replace('{env:AGENT_FLOW_HOME}', repo))
}

const ruleLoadedBy: Record<Runtime, () => string> = {
  'Claude Code': claudeRule,
  'OpenCode v2': opencodeRule,
}

const ruleTextFor = (runtime: Runtime): string => {
  const path = ruleLoadedBy[runtime]()
  assert.equal(path, realpathSync(ruleFile), `${runtime} must load rules/decision-logging.md`)
  return readFileSync(path, 'utf8')
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

const planWith = (id: string): string =>
  JSON.stringify({
    issue: '#16',
    title: 'Decision logging',
    steps: [
      {
        id,
        title: 'Implementation',
        role: 'dev-a',
        status: 'in_progress',
        origin: 'planned',
        startedAt: '2026-01-01T10:00:00.000Z',
        endedAt: null,
      },
    ],
  })

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

const openRuns = (world: LoggingWorld, stepId: string): void => {
  world.root = realpathSync(mkdtempSync(join(tmpdir(), 'decision-logging-')))
  world.logged = []
  world.runs = new Map([
    ['Claude Code', claudeRun(world.root)],
    ['OpenCode v2', opencodeRun(world.root)],
  ])
  for (const run of world.runs.values()) {
    mkdirSync(join(run.worktree, '.agent-flow'))
    writeFileSync(join(run.worktree, '.agent-flow', 'plan.json'), planWith(stepId))
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
  openRuns(this, 's1')
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
  openRuns(this, id)
})

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
  openRuns(this, 's1')
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

After(function (this: LoggingWorld): void {
  if (this.root !== undefined) rmSync(this.root, { recursive: true, force: true })
})
