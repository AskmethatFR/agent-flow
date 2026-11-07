import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { After, Given, Then, When } from '@cucumber/cucumber'

type Step = {
  id: string
  title: string
  status: string
  startedAt: string | null
  endedAt: string | null
}

export type RuntimeDriver = {
  seedPlan: (world: TimingWorld) => void
  start: (world: TimingWorld, title: string) => void
  finish: (world: TimingWorld, title: string) => void
}

export type TimingWorld = {
  worktree: string
  runtime: RuntimeDriver
  started: string
}

const drivers = new Map<string, RuntimeDriver>()

export const registerRuntimeDriver = (name: string, driver: RuntimeDriver): void => {
  drivers.set(name, driver)
}

const planPathOf = (world: TimingWorld): string => join(world.worktree, '.agent-flow', 'plan.json')

export const writePlan = (world: TimingWorld, steps: readonly unknown[]): void => {
  mkdirSync(join(world.worktree, '.agent-flow'), { recursive: true })
  writeFileSync(planPathOf(world), JSON.stringify({ issue: '#14', title: 'Step timing', steps }))
}

const stepsOf = (world: TimingWorld): Step[] => JSON.parse(readFileSync(planPathOf(world), 'utf8')).steps

const stepTitled = (world: TimingWorld, title: string): Step => {
  const step = stepsOf(world).find((candidate) => candidate.title === title)
  assert.ok(step !== undefined, `step "${title}" is missing from plan.json`)
  return step
}

const useRuntime = (world: TimingWorld, name: string): void => {
  const driver = drivers.get(name)
  assert.ok(driver !== undefined, `no runtime driver registered for ${name}`)
  world.runtime = driver
  world.worktree = realpathSync(mkdtempSync(join(tmpdir(), 'step-timing-bdd-')))
  driver.seedPlan(world)
}

Given(/^a (.+) agent starts the step "([^"]+)"$/, function (this: TimingWorld, name: string, title: string): void {
  useRuntime(this, name)
  this.runtime.start(this, title)
  this.started = title
})

Given(
  /^a (.+) agent has the step "([^"]+)" in progress$/,
  function (this: TimingWorld, name: string, title: string): void {
    useRuntime(this, name)
    this.runtime.start(this, title)
    this.started = title
  },
)

When('the agent marks the step as done', function (this: TimingWorld): void {
  const running = stepsOf(this).find((step) => step.status === 'in_progress')
  assert.ok(running !== undefined, 'no step is in progress')
  this.runtime.finish(this, running.title)
})

When('the agent starts the step {string}', function (this: TimingWorld, title: string): void {
  this.runtime.start(this, title)
  this.started = title
})

Then('plan.json contains startedAt and endedAt for that step', function (this: TimingWorld): void {
  const step = stepTitled(this, this.started)
  assert.equal(step.status, 'done')
  assert.equal(typeof step.startedAt, 'string')
  assert.equal(typeof step.endedAt, 'string')
})

Then('endedAt is not earlier than startedAt', function (this: TimingWorld): void {
  const step = stepTitled(this, this.started)
  assert.ok(Date.parse(step.endedAt as string) >= Date.parse(step.startedAt as string))
})

Then('{string} is done with an endedAt', function (this: TimingWorld, title: string): void {
  const step = stepTitled(this, title)
  assert.equal(step.status, 'done')
  assert.equal(typeof step.endedAt, 'string')
})

Then('{string} is in progress with a startedAt', function (this: TimingWorld, title: string): void {
  const step = stepTitled(this, title)
  assert.equal(step.status, 'in_progress')
  assert.equal(typeof step.startedAt, 'string')
})

After(function (this: TimingWorld): void {
  if (this.worktree !== undefined) rmSync(this.worktree, { recursive: true, force: true })
})

const repo = fileURLToPath(new URL('../../', import.meta.url))
const hook = join(repo, 'capture/claude-code/src/step-timing/hook.ts')
const claudeIds: Readonly<Record<string, string>> = { Architecture: '1', Implementation: '2' }

const idOf = (title: string): string => {
  const id = claudeIds[title]
  assert.ok(id !== undefined, `no Claude Code task id for "${title}"`)
  return id
}

export const runHook = (worktree: string, payload: object): void => {
  const result = spawnSync(join(repo, 'node_modules/.bin/tsx'), [hook], {
    cwd: worktree,
    input: JSON.stringify({ hook_event_name: 'PostToolUse', ...payload }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: worktree },
  })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, '')
}

export const taskUpdateOf = (taskId: string, to: string): object => ({
  tool_name: 'TaskUpdate',
  tool_input: { taskId, status: to },
  tool_response: { success: true, statusChange: { from: 'pending', to } },
})

const taskUpdate = (world: TimingWorld, title: string, to: string): void =>
  runHook(world.worktree, taskUpdateOf(idOf(title), to))

registerRuntimeDriver('Claude Code', {
  seedPlan: (world) =>
    writePlan(
      world,
      Object.entries(claudeIds).map(([title, id]) => ({
        id,
        title,
        role: 'dev-a',
        status: 'todo',
        origin: 'planned',
        startedAt: null,
        endedAt: null,
      })),
    ),
  start: (world, title) => taskUpdate(world, title, 'in_progress'),
  finish: (world, title) => taskUpdate(world, title, 'completed'),
})
