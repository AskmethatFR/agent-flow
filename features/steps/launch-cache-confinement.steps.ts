import assert from 'node:assert/strict'
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { After, Given, Then, When } from '@cucumber/cucumber'

type ConfinementWorld = {
  root: string
  sharedTemporaryDirectory: string
  worktree: string
}

const repo = fileURLToPath(new URL('../../', import.meta.url))

const registeredHookCommand: string = JSON.parse(
  readFileSync(join(repo, 'capture/claude-code/settings.json'), 'utf8'),
).hooks.PostToolUse[0].hooks[0].command

const taskUpdate = JSON.stringify({
  hook_event_name: 'PostToolUse',
  tool_name: 'TaskUpdate',
  tool_input: { taskId: '1', status: 'in_progress' },
  tool_response: { success: true, statusChange: { from: 'pending', to: 'in_progress' } },
})

const launcherUsageStatus = 2

const hook = (world: ConfinementWorld): SpawnSyncReturns<string> =>
  spawnSync('sh', ['-c', registeredHookCommand], {
    cwd: world.worktree,
    input: taskUpdate,
    encoding: 'utf8',
    env: {
      ...process.env,
      TSX_DISABLE_CACHE: undefined,
      AGENT_FLOW_HOME: repo,
      CLAUDE_PROJECT_DIR: world.worktree,
      TMPDIR: world.sharedTemporaryDirectory,
    },
  })

const launcher =
  (name: string) =>
  (world: ConfinementWorld): SpawnSyncReturns<string> =>
    spawnSync(process.execPath, [join(repo, 'capture/shared/bin', `${name}.mjs`)], {
      cwd: world.worktree,
      encoding: 'utf8',
      env: { ...process.env, TSX_DISABLE_CACHE: undefined, TMPDIR: world.sharedTemporaryDirectory },
    })

const entryPoints: Readonly<Record<string, { run: (world: ConfinementWorld) => SpawnSyncReturns<string>; status: number }>> = {
  'the Claude Code step timing hook': { run: hook, status: 0 },
  'agent-flow-plan': { run: launcher('agent-flow-plan'), status: launcherUsageStatus },
  'agent-flow-decision': { run: launcher('agent-flow-decision'), status: launcherUsageStatus },
  'agent-flow-check': { run: launcher('agent-flow-check'), status: launcherUsageStatus },
}

Given('an empty shared temporary directory', function (this: ConfinementWorld): void {
  this.root = realpathSync(mkdtempSync(join(tmpdir(), 'launch-cache-bdd-')))
  this.sharedTemporaryDirectory = join(this.root, 'shared-tmp')
  this.worktree = join(this.root, 'worktree')
  mkdirSync(this.sharedTemporaryDirectory)
  mkdirSync(this.worktree)
})

When('the operator runs {}', function (this: ConfinementWorld, entryPoint: string): void {
  const entry = entryPoints[entryPoint]
  assert.ok(entry !== undefined, `no entry point named "${entryPoint}"`)
  const result = entry.run(this)
  assert.ifError(result.error)
  assert.equal(result.status, entry.status, result.stderr)
})

Then('the shared temporary directory holds no cached transformed code', function (this: ConfinementWorld): void {
  const cached = readdirSync(this.sharedTemporaryDirectory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
  assert.deepEqual(cached, [])
})

After(function (this: ConfinementWorld): void {
  if (this.root !== undefined) rmSync(this.root, { recursive: true, force: true })
})
