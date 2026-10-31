import assert from 'node:assert/strict'
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { After, Given, Then, When } from '@cucumber/cucumber'
import { applyStepEvent } from '@agent-flow/capture-shared/plan-writer'
import type { StepEvent } from '@agent-flow/capture-shared/plan-writer'
import type { ValidationResult } from '@agent-flow/core/contracts'

type Step = {
  id: string
  title: string
  role: string
  status: string
  origin: string
  startedAt: string | null
  endedAt: string | null
}

type PlanWriterWorld = {
  root: string
  worktree: string
  worktreeArgument: string
  before: Map<string, string>
  result: ValidationResult
}

const stepOf = (id: string, overlays: Partial<Step>): Step => ({
  id,
  title: 'Implementation',
  role: 'dev-a',
  status: 'todo',
  origin: 'planned',
  startedAt: null,
  endedAt: null,
  ...overlays,
})

const planWith = (steps: readonly Step[]): string =>
  JSON.stringify({ issue: '#34', title: 'Plan writer', steps })

const planFile = (world: PlanWriterWorld): string => join(world.worktree, '.agent-flow', 'plan.json')

const outsideOf = (world: PlanWriterWorld): string => join(world.root, 'outside')

const openWorktree = (world: PlanWriterWorld): void => {
  world.root = mkdtempSync(join(tmpdir(), 'plan-writer-'))
  world.worktree = join(world.root, 'worktree')
  world.worktreeArgument = world.worktree
  mkdirSync(world.worktree)
  mkdirSync(outsideOf(world))
}

const writePlan = (world: PlanWriterWorld, plan: string): void => {
  mkdirSync(join(world.worktree, '.agent-flow'), { recursive: true })
  writeFileSync(planFile(world), plan)
}

const stepsOf = (planText: string): Step[] => JSON.parse(planText).steps

const planStep = (world: PlanWriterWorld, id: string): Step => {
  const step = stepsOf(readFileSync(planFile(world), 'utf8')).find((candidate) => candidate.id === id)
  assert.ok(step !== undefined, `step ${id} is missing from plan.json`)
  return step
}

const snapshotOf = (root: string): Map<string, string> => {
  const entries = new Map<string, string>()
  for (const relative of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
    const path = join(root, relative)
    const stats = lstatSync(path)
    if (stats.isSymbolicLink()) entries.set(relative, `link:${readlinkSync(path)}`)
    else if (stats.isDirectory()) entries.set(relative, 'dir')
    else entries.set(relative, `file:${readFileSync(path, 'utf8')}`)
  }
  return entries
}

const redirections: Record<string, (world: PlanWriterWorld) => void> = {
  'a worktree path going through ..': (world) => {
    mkdirSync(join(outsideOf(world), '.agent-flow'))
    writeFileSync(join(outsideOf(world), '.agent-flow', 'plan.json'), readFileSync(planFile(world)))
    world.worktreeArgument = `${world.worktree}/../outside`
  },
  '.agent-flow symlinked to an outside folder': (world) => {
    const moved = join(outsideOf(world), 'agent-flow')
    renameSync(join(world.worktree, '.agent-flow'), moved)
    symlinkSync(moved, join(world.worktree, '.agent-flow'))
  },
  'plan.json symlinked to an outside file': (world) => {
    const moved = join(outsideOf(world), 'plan.json')
    renameSync(planFile(world), moved)
    symlinkSync(moved, planFile(world))
  },
}

const apply = (world: PlanWriterWorld, event: StepEvent): void => {
  world.before = snapshotOf(world.root)
  world.result = applyStepEvent(world.worktreeArgument, event)
}

Given(
  'a worktree whose plan has step {string} todo',
  function (this: PlanWriterWorld, id: string): void {
    openWorktree(this)
    writePlan(this, planWith([stepOf(id, {})]))
  },
)

Given(
  'a worktree whose plan has step {string} in progress since {string}',
  function (this: PlanWriterWorld, id: string, startedAt: string): void {
    openWorktree(this)
    writePlan(this, planWith([stepOf(id, { status: 'in_progress', startedAt })]))
  },
)

Given(
  'a worktree whose plan on disk is {string}',
  function (this: PlanWriterWorld, description: string): void {
    openWorktree(this)
    const [, id, status = 'todo'] = /^step (\S+) (?:with unknown status (\S+)|todo)$/.exec(description) ?? []
    assert.ok(id !== undefined, `unknown plan description: ${description}`)
    writePlan(this, planWith([stepOf(id, { status })]))
  },
)

Given('a worktree without an .agent-flow directory', function (this: PlanWriterWorld): void {
  openWorktree(this)
})

Given(
  'the plan target is redirected outside .agent-flow by {string}',
  function (this: PlanWriterWorld, redirection: string): void {
    const redirect = redirections[redirection]
    assert.ok(redirect !== undefined, `unknown redirection: ${redirection}`)
    redirect(this)
  },
)

When(
  'the plan writer applies a start of step {string} at {string}',
  function (this: PlanWriterWorld, stepId: string, at: string): void {
    apply(this, { kind: 'start', stepId, at })
  },
)

When(
  'the plan writer applies a finish of step {string} at {string}',
  function (this: PlanWriterWorld, stepId: string, at: string): void {
    apply(this, { kind: 'finish', stepId, at })
  },
)

Then(
  "the worktree's .agent-flow plan.json has step {string} in progress since {string}",
  function (this: PlanWriterWorld, id: string, startedAt: string): void {
    assert.deepEqual(this.result, { accepted: true })
    const step = planStep(this, id)
    assert.equal(step.status, 'in_progress')
    assert.equal(step.startedAt, startedAt)
  },
)

Then(
  "the worktree's .agent-flow plan.json has step {string} done with endedAt {string}",
  function (this: PlanWriterWorld, id: string, endedAt: string): void {
    assert.deepEqual(this.result, { accepted: true })
    const step = planStep(this, id)
    assert.equal(step.status, 'done')
    assert.equal(step.endedAt, endedAt)
  },
)

Then('the plan writer refuses the event', function (this: PlanWriterWorld): void {
  assert.equal(this.result.accepted, false)
})

Then(
  'the plan writer refuses the event with an error saying the plan is missing',
  function (this: PlanWriterWorld): void {
    assert.ok(!this.result.accepted, 'expected the event to be refused')
    assert.ok(this.result.errors.some((error) => error.message === 'is missing'))
  },
)

Then(
  'the plan writer returns an error naming {string}',
  function (this: PlanWriterWorld, named: string): void {
    assert.ok(!this.result.accepted, 'expected the event to be refused')
    assert.ok(this.result.errors.some((error) => error.location === named))
  },
)

Then('the outside content and the plan.json are unchanged', function (this: PlanWriterWorld): void {
  assert.deepEqual(snapshotOf(this.root), this.before)
})

Then('the plan.json bytes are unchanged', function (this: PlanWriterWorld): void {
  assert.deepEqual(snapshotOf(this.root), this.before)
})

Then(
  'the worktree has an .agent-flow directory but no plan.json',
  function (this: PlanWriterWorld): void {
    assert.deepEqual(readdirSync(join(this.worktree, '.agent-flow')), [])
  },
)

After(function (this: PlanWriterWorld): void {
  if (this.root !== undefined) rmSync(this.root, { recursive: true, force: true })
})
