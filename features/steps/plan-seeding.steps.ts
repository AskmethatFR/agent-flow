import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { After, Given, Then, When } from '@cucumber/cucumber'
import { seedPlan } from '@agent-flow/capture-shared/plan-seed'
import { validatePlan } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { runHook, taskUpdateOf } from './step-timing-claude-code.steps.ts'
import { changeTodo, installStepTimingPlugin } from './opencode-plugin'
import type { Fire, Todo } from './opencode-plugin'
import { assertShimsMirror, ruleFileNamed, rulesReachedBy } from './rule-shims'
import type { Runtime } from './rule-shims'
import { snapshotOf } from './snapshot-of'

type PlanSeedingWorld = {
  todos?: Todo[]
  fire?: Fire
  loadedRules?: string[]
  root: string
  worktree: string
  before: Map<string, string>
  result: ValidationResult
  exitCode: number | null
  stderr: string
  runtime: ItemRuntime
  item: string
  taskIds: Map<string, string>
}

type PlanStep = {
  id: string
  title: string
  role: string
  status: string
  origin: string
  startedAt: string | null
  endedAt: string | null
}

type ItemRuntime = {
  create: (world: PlanSeedingWorld, title: string) => void
  start: (world: PlanSeedingWorld, title: string) => void
  finish: (world: PlanSeedingWorld, title: string) => void
}

const runtimes = new Map<string, ItemRuntime>()

const taskIdOf = (world: PlanSeedingWorld, title: string): string => {
  const id = world.taskIds.get(title)
  assert.ok(id !== undefined, `no Claude Code task for "${title}"`)
  return id
}

runtimes.set('Claude Code', {
  create: (world, title) => {
    const id = String(world.taskIds.size + 1)
    world.taskIds.set(title, id)
    runHook(world.worktree, {
      tool_name: 'TaskCreate',
      tool_input: { subject: title },
      tool_response: { task: { id, subject: title } },
    })
  },
  start: (world, title) => runHook(world.worktree, taskUpdateOf(taskIdOf(world, title), 'in_progress')),
  finish: (world, title) => runHook(world.worktree, taskUpdateOf(taskIdOf(world, title), 'completed')),
})

const todoChange = (world: PlanSeedingWorld, title: string, status: Todo['status']): void => {
  assert.ok(world.fire !== undefined && world.todos !== undefined, 'the OpenCode plugin is not installed')
  changeTodo(world.fire, world.todos, title, status)
}

const installPlugin = (world: PlanSeedingWorld): void => {
  if (world.fire !== undefined) return
  world.fire = installStepTimingPlugin(world.worktree)
  world.todos = []
}

runtimes.set('OpenCode v2', {
  create: (world, title) => {
    installPlugin(world)
    world.todos?.push({ content: title, status: 'pending' })
    todoChange(world, title, 'pending')
  },
  start: (world, title) => todoChange(world, title, 'in_progress'),
  finish: (world, title) => todoChange(world, title, 'completed'),
})

const planText = (world: PlanSeedingWorld): string =>
  readFileSync(join(world.worktree, '.agent-flow', 'plan.json'), 'utf8')

const stepsOf = (world: PlanSeedingWorld): PlanStep[] => JSON.parse(planText(world)).steps

const stepTitled = (world: PlanSeedingWorld, title: string, role: string): PlanStep => {
  const step = stepsOf(world).find((candidate) => candidate.title === title)
  assert.ok(step !== undefined, `step "${title}" is missing from plan.json`)
  assert.equal(step.role, role)
  return step
}

const freshWorktree = (world: PlanSeedingWorld): void => {
  world.root = realpathSync(mkdtempSync(join(tmpdir(), 'plan-seeding-')))
  world.worktree = join(world.root, 'worktree')
  mkdirSync(world.worktree)
  world.taskIds = new Map()
}

Given('a worktree without a plan.json', function (this: PlanSeedingWorld): void {
  freshWorktree(this)
})

Given(
  'a worktree seeded with issue {string} and title {string}',
  function (this: PlanSeedingWorld, issue: string, title: string): void {
    freshWorktree(this)
    assert.deepEqual(seedPlan(this.worktree, issue, title), { accepted: true })
  },
)

Given(
  /^a (.+) agent creates the item "([^"]+)"$/,
  function (this: PlanSeedingWorld, name: string, title: string): string | void {
    const runtime = runtimes.get(name)
    if (runtime === undefined) return 'pending'
    this.runtime = runtime
    this.item = title
    runtime.create(this, title)
  },
)

Given('the agent starts the item', function (this: PlanSeedingWorld): void {
  this.runtime.start(this, this.item)
})

When('the agent marks the item as done', function (this: PlanSeedingWorld): void {
  this.runtime.finish(this, this.item)
})

When('the agent creates the item {string}', function (this: PlanSeedingWorld, title: string): void {
  this.runtime.create(this, title)
})

Then(
  'plan.json has the step {string} with role {string}, origin planned, a startedAt and an endedAt',
  function (this: PlanSeedingWorld, title: string, role: string): void {
    const step = stepTitled(this, title, role)
    assert.equal(step.origin, 'planned')
    assert.equal(step.status, 'done')
    assert.equal(typeof step.startedAt, 'string')
    assert.equal(typeof step.endedAt, 'string')
  },
)

Then(
  'plan.json has the step {string} with role {string}, origin proposed and status todo',
  function (this: PlanSeedingWorld, title: string, role: string): void {
    const step = stepTitled(this, title, role)
    assert.equal(step.origin, 'proposed')
    assert.equal(step.status, 'todo')
  },
)

Given(/^the agent rules installed for (?:Claude Code|OpenCode v2)$/, assertShimsMirror)

When(/^a (Claude Code|OpenCode v2) session loads its rules$/, function (this: PlanSeedingWorld, runtime: Runtime): void {
  this.loadedRules = rulesReachedBy(runtime)
})

Then(/^the rules include rules\/plan-steps\.md$/, function (this: PlanSeedingWorld): void {
  assert.ok(this.loadedRules?.includes(ruleFileNamed('plan-steps.md')))
})

After(function (this: PlanSeedingWorld): void {
  if (this.root !== undefined) rmSync(this.root, { recursive: true, force: true })
})

Given(
  'a worktree whose plan for issue {string} has step {string} todo',
  function (this: PlanSeedingWorld, issue: string, id: string): void {
    freshWorktree(this)
    const step: PlanStep = {
      id,
      title: 'Implementation',
      role: 'dev-a',
      status: 'todo',
      origin: 'planned',
      startedAt: null,
      endedAt: null,
    }
    mkdirSync(join(this.worktree, '.agent-flow'))
    writeFileSync(
      join(this.worktree, '.agent-flow', 'plan.json'),
      JSON.stringify({ issue, title: 'Existing plan', steps: [step] }),
    )
  },
)

Given(
  'a worktree without a plan.json and content outside its .agent-flow directory',
  function (this: PlanSeedingWorld): void {
    freshWorktree(this)
    writeFileSync(join(this.worktree, 'README.md'), 'kept\n')
    mkdirSync(join(this.root, 'neighbour'))
    writeFileSync(join(this.root, 'neighbour', 'notes.txt'), 'kept\n')
  },
)

When(
  'the tower seeds the plan with issue {string} and title {string}',
  function (this: PlanSeedingWorld, issue: string, title: string): void {
    this.before = snapshotOf(this.root)
    this.result = seedPlan(this.worktree, issue, title)
  },
)

When(
  'the tower runs agent-flow-plan on the worktree with issue {string} and title {string}',
  function (this: PlanSeedingWorld, issue: string, title: string): void {
    const launcher = fileURLToPath(new URL('../../capture/shared/bin/agent-flow-plan.mjs', import.meta.url))
    const run = spawnSync(process.execPath, [launcher, this.worktree, issue, title], {
      cwd: this.root,
      encoding: 'utf8',
    })
    assert.equal(run.error, undefined)
    this.exitCode = run.status
    this.stderr = run.stderr
  },
)

Then('the seed reports success so the worker start proceeds', function (this: PlanSeedingWorld): void {
  assert.deepEqual(this.result, { accepted: true })
})

Then('the launcher exits with code {int}', function (this: PlanSeedingWorld, code: number): void {
  assert.equal(this.exitCode, code)
})

Then('the launcher exits with a non-zero code other than 3', function (this: PlanSeedingWorld): void {
  assert.equal(this.exitCode, 1)
  const [refusal] = JSON.parse(this.stderr).errors
  assert.equal(refusal.file, 'plan.json')
  assert.ok(['issue', 'title'].includes(refusal.field), `unexpected refusal field ${refusal.field}`)
})

Then('the worktree has no plan.json', function (this: PlanSeedingWorld): void {
  assert.ok(!existsSync(join(this.worktree, '.agent-flow', 'plan.json')))
})

const outsideAgentFlow = (snapshot: Map<string, string>): Map<string, string> =>
  new Map([...snapshot].filter(([path]) => path !== 'worktree/.agent-flow' && !path.startsWith('worktree/.agent-flow/')))

Then(
  "nothing outside the worktree's .agent-flow directory has changed",
  function (this: PlanSeedingWorld): void {
    assert.deepEqual(this.result, { accepted: true })
    assert.deepEqual(outsideAgentFlow(snapshotOf(this.root)), outsideAgentFlow(this.before))
  },
)

Then(
  "the worktree's .agent-flow plan.json has issue {string}, title {string} and no steps",
  function (this: PlanSeedingWorld, issue: string, title: string): void {
    assert.deepEqual(this.result, { accepted: true })
    assert.deepEqual(JSON.parse(planText(this)), { issue, title, steps: [] })
  },
)

Then('the plan.json passes contract validation', function (this: PlanSeedingWorld): void {
  assert.deepEqual(validatePlan(planText(this)), { accepted: true })
})

Then(
  'the seed is refused with an error saying the plan already exists',
  function (this: PlanSeedingWorld): void {
    assert.ok(!this.result.accepted, 'expected the seed to be refused')
    assert.ok(this.result.errors.some((error) => error.message === 'already exists'))
  },
)
