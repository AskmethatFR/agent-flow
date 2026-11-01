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
import { appendDecision } from '@agent-flow/capture-shared/decision-append'
import type { ValidationResult } from '@agent-flow/core/contracts'

type DecisionWorld = {
  root: string
  worktree: string
  worktreeArgument: string
  decision: Record<string, unknown>
  before: Map<string, string>
  result: ValidationResult
}

const existingLines = (count: number): string =>
  Array.from({ length: count }, (_, index) =>
    JSON.stringify({ ...validDecision(), title: `Earlier decision ${index + 1}` }),
  )
    .map((line) => `${line}\n`)
    .join('')

const validDecision = (): Record<string, unknown> => ({
  at: '2026-01-01T10:05:00.000Z',
  step: 's1',
  role: 'dev-a',
  kind: 'decision',
  title: 'Use a factory',
  why: 'It keeps the seam narrow',
  confidence: 'high',
})

const planWith = (steps: readonly unknown[]): string =>
  JSON.stringify({ issue: '#35', title: 'Decisions appender', steps })

const stepOf = (id: string, overlays: Record<string, unknown>): Record<string, unknown> => ({
  id,
  title: 'Implementation',
  role: 'dev-a',
  status: 'todo',
  origin: 'planned',
  startedAt: null,
  endedAt: null,
  ...overlays,
})

const agentFlowOf = (world: DecisionWorld): string => join(world.worktree, '.agent-flow')
const decisionsFile = (world: DecisionWorld): string => join(agentFlowOf(world), 'decisions.jsonl')
const outsideOf = (world: DecisionWorld): string => join(world.root, 'outside')

const openWorktree = (world: DecisionWorld): void => {
  world.root = mkdtempSync(join(tmpdir(), 'decision-append-'))
  world.worktree = join(world.root, 'worktree')
  world.worktreeArgument = world.worktree
  world.decision = validDecision()
  mkdirSync(agentFlowOf(world), { recursive: true })
  mkdirSync(outsideOf(world))
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

const redirections: Record<string, (world: DecisionWorld) => void> = {
  'a worktree path going through ..': (world) => {
    mkdirSync(join(outsideOf(world), '.agent-flow'))
    writeFileSync(join(outsideOf(world), '.agent-flow', 'decisions.jsonl'), existingLines(3))
    world.worktreeArgument = `${world.worktree}/../outside`
  },
  '.agent-flow symlinked to an outside folder': (world) => {
    const moved = join(outsideOf(world), 'agent-flow')
    renameSync(agentFlowOf(world), moved)
    symlinkSync(moved, agentFlowOf(world))
  },
  'decisions.jsonl symlinked to an outside file': (world) => {
    const moved = join(outsideOf(world), 'decisions.jsonl')
    renameSync(decisionsFile(world), moved)
    symlinkSync(moved, decisionsFile(world))
  },
}

const append = (world: DecisionWorld): void => {
  world.before = snapshotOf(world.root)
  world.result = appendDecision(world.worktreeArgument, world.decision)
}

Given(
  'a worktree whose decisions.jsonl has {int} lines',
  function (this: DecisionWorld, count: number): void {
    openWorktree(this)
    writeFileSync(decisionsFile(this), existingLines(count))
  },
)

Given(
  'the plan has step {string} in progress',
  function (this: DecisionWorld, id: string): void {
    writeFileSync(
      join(agentFlowOf(this), 'plan.json'),
      planWith([stepOf(id, { status: 'in_progress', startedAt: '2026-01-01T10:00:00.000Z' })]),
    )
  },
)

Given('a decision that fails the decisions contract', function (this: DecisionWorld): void {
  this.decision = { ...validDecision(), confidence: 'certain' }
})

Given('a worktree whose plan has no step in progress', function (this: DecisionWorld): void {
  openWorktree(this)
  writeFileSync(join(agentFlowOf(this), 'plan.json'), planWith([stepOf('s1', {})]))
})

Given('no step is given for the decision', function (this: DecisionWorld): void {
  const { step: _step, ...withoutStep } = validDecision()
  this.decision = withoutStep
})

Given(
  'the decisions target is redirected outside .agent-flow by {string}',
  function (this: DecisionWorld, redirection: string): void {
    const redirect = redirections[redirection]
    assert.ok(redirect !== undefined, `unknown redirection: ${redirection}`)
    redirect(this)
  },
)

When('a valid decision is appended', function (this: DecisionWorld): void {
  append(this)
})

When('the decision is appended', function (this: DecisionWorld): void {
  append(this)
})

When('a decision is appended', function (this: DecisionWorld): void {
  append(this)
})

Then(
  'the decisions.jsonl has {int} lines',
  function (this: DecisionWorld, count: number): void {
    assert.deepEqual(this.result, { accepted: true })
    assert.equal(readFileSync(decisionsFile(this), 'utf8').split('\n').length - 1, count)
  },
)

Then(
  'the first {int} lines are byte for byte unchanged',
  function (this: DecisionWorld, count: number): void {
    const before = this.before.get(join('worktree', '.agent-flow', 'decisions.jsonl'))
    assert.ok(before !== undefined)
    const unchanged = before.replace(/^file:/, '')
    assert.equal(unchanged.split('\n').length - 1, count)
    assert.ok(readFileSync(decisionsFile(this), 'utf8').startsWith(unchanged))
  },
)

Then('the decision is refused with an error', function (this: DecisionWorld): void {
  assert.ok(!this.result.accepted, 'expected the decision to be refused')
  assert.ok(this.result.errors.length > 0)
})

Then('the decision is refused', function (this: DecisionWorld): void {
  assert.equal(this.result.accepted, false)
})

Then(
  'the decision is refused with a message saying no step is in progress',
  function (this: DecisionWorld): void {
    assert.ok(!this.result.accepted, 'expected the decision to be refused')
    assert.ok(this.result.errors.some((error) => error.message === 'no step is in progress'))
  },
)

Then('the decisions.jsonl is unchanged', function (this: DecisionWorld): void {
  assert.deepEqual(snapshotOf(this.root), this.before)
})

Then(
  'the outside content and the decisions.jsonl are unchanged',
  function (this: DecisionWorld): void {
    assert.deepEqual(snapshotOf(this.root), this.before)
  },
)

After(function (this: DecisionWorld): void {
  if (this.root !== undefined) rmSync(this.root, { recursive: true, force: true })
})
