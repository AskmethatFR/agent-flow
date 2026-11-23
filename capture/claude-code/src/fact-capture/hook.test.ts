import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const repo = fileURLToPath(new URL('../../../../', import.meta.url))
const tsx = join(repo, 'node_modules/.bin/tsx')
const hook = join(repo, 'capture/claude-code/src/fact-capture/hook.ts')
const settings = JSON.parse(readFileSync(join(repo, 'capture/claude-code/settings.json'), 'utf8'))

const factEntry = {
  matcher: 'Bash',
  hooks: [
    {
      type: 'command',
      command:
        '"${AGENT_FLOW_HOME:?}/node_modules/.bin/tsx" --no-cache --tsconfig "${AGENT_FLOW_HOME:?}/tsconfig.json" "${AGENT_FLOW_HOME:?}/capture/claude-code/src/fact-capture/hook.ts"',
      timeout: 10,
    },
  ],
}

const literal = 'npx vitest run --reporter=json --outputFile=reports/vitest/vitest.json'

const eventOf = (hookEventName: string, ending: Record<string, unknown>) =>
  JSON.stringify({
    hook_event_name: hookEventName,
    cwd: worktree,
    agent_id: 'a1',
    agent_type: 'qa',
    tool_name: 'Bash',
    tool_input: { command: literal, description: 'Run vitest' },
    tool_use_id: 'toolu_01',
    duration_ms: 60_000,
    ...ending,
  })

const passingEvent = () => eventOf('PostToolUse', { tool_response: { stdout: '', stderr: '', interrupted: false } })
const failingEvent = () => eventOf('PostToolUseFailure', { error: 'Exit code 1', is_interrupt: false })

let root: string
let worktree: string
let factsPath: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'fact-capture-hook-')))
  worktree = join(root, 'worktree')
  factsPath = join(worktree, '.agent-flow', 'verified-facts.jsonl')
  mkdirSync(join(worktree, '.agent-flow'), { recursive: true })
  mkdirSync(join(worktree, 'reports', 'vitest'), { recursive: true })
  const step = {
    id: '3',
    title: 'qa: review',
    role: 'qa',
    status: 'in_progress',
    origin: 'planned',
    startedAt: '2026-11-23T11:00:00.000Z',
    endedAt: null,
  }
  writeFileSync(join(worktree, '.agent-flow', 'plan.json'), JSON.stringify({ issue: '#128', title: 'Facts', steps: [step] }))
  writeFileSync(
    join(worktree, 'reports', 'vitest', 'vitest.json'),
    JSON.stringify({ numTotalTests: 4, numPassedTests: 3, numFailedTestSuites: 1 }),
  )
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const runRegistered = (command: string, input: string, env: Record<string, string | undefined> = {}) =>
  spawnSync('sh', ['-c', command], {
    cwd: worktree,
    input,
    timeout: factEntry.hooks[0]!.timeout * 1000,
    encoding: 'utf8',
    env: { ...process.env, AGENT_FLOW_HOME: repo, CLAUDE_PROJECT_DIR: worktree, ...env },
  })

describe('fact hook registration', () => {
  it('registers the fact hook, matcher Bash, on PostToolUse after the step hook and on PostToolUseFailure', () => {
    expect(Object.keys(settings.hooks)).toEqual(['PostToolUse', 'PostToolUseFailure'])
    expect(settings.hooks.PostToolUse.slice(1)).toEqual([factEntry])
    expect(settings.hooks.PostToolUseFailure).toEqual([factEntry])
  })
})

describe('fact hook process', { timeout: 30_000 }, () => {
  it.each([
    ['PostToolUse', 'a passing run', passingEvent],
    ['PostToolUseFailure', 'a failing run', failingEvent],
  ])('writes one fact through the command registered on %s for %s, silently, with exit 0', (event, _label, input) => {
    const result = runRegistered(settings.hooks[event].at(-1).hooks[0].command, input())
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')
    expect(JSON.parse(readFileSync(factsPath, 'utf8'))).toMatchObject({ step: '3', role: 'qa', passed: 3, total: 4 })
  })

  it.each<[string, () => string, Record<string, string | undefined>]>([
    ['garbage on stdin', () => 'garbage', {}],
    ['a refused run (no plan.json)', () => (rmSync(join(worktree, '.agent-flow', 'plan.json')), passingEvent()), {}],
    ['CLAUDE_PROJECT_DIR unset', passingEvent, { CLAUDE_PROJECT_DIR: undefined }],
  ])('stays silent with exit 0 and writes nothing on %s', (_label, input, env) => {
    const result = runRegistered(factEntry.hooks[0]!.command, input(), env)
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')
    expect(existsSync(factsPath)).toBe(false)
  })

  it('stays silent with exit 0 when the module cannot be imported', () => {
    const lone = join(root, 'lone')
    mkdirSync(lone)
    writeFileSync(join(lone, 'package.json'), '{"type":"module"}')
    copyFileSync(hook, join(lone, 'hook.ts'))
    const result = spawnSync(tsx, ['--tsconfig', join(repo, 'tsconfig.json'), join(lone, 'hook.ts')], {
      cwd: lone,
      input: passingEvent(),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: worktree },
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')
    expect(existsSync(factsPath)).toBe(false)
  })
})
