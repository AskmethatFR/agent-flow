import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const repo = fileURLToPath(new URL('../../../../', import.meta.url))
const tsx = join(repo, 'node_modules/.bin/tsx')
const hook = join(repo, 'capture/claude-code/src/step-timing/hook.ts')
const settingsPath = join(repo, 'capture/claude-code/settings.json')
const sourceRoot = join(repo, 'capture/claude-code/src')

const step = (id: string) => ({
  id,
  title: `Step ${id}`,
  role: 'dev-a',
  status: 'todo',
  origin: 'planned',
  startedAt: null,
  endedAt: null,
})

const taskUpdate = (taskId: string, to: string): string =>
  JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'TaskUpdate',
    tool_input: { taskId },
    tool_response: { statusChange: { to } },
  })

let root: string
let worktree: string
let planPath: string

const run = (
  input: string,
  env: Record<string, string | undefined> = { CLAUDE_PROJECT_DIR: worktree },
  cwd: string = worktree,
) =>
  spawnSync(tsx, [hook], {
    cwd,
    input,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: undefined, ...env },
  })

const sources = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sources(path)
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : []
  })

const importsOf = (path: string): string[] =>
  ts.preProcessFile(readFileSync(path, 'utf8'), true, true).importedFiles.map((file) => file.fileName)

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'step-timing-hook-')))
  worktree = join(root, 'worktree')
  mkdirSync(join(worktree, '.agent-flow'), { recursive: true })
  planPath = join(worktree, '.agent-flow', 'plan.json')
  writeFileSync(planPath, JSON.stringify({ issue: '#14', title: 'Step timing', steps: [step('1'), step('2')] }))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('step timing hook process', () => {
  it('records a start from the real process, silently, with exit 0', () => {
    const result = run(taskUpdate('2', 'in_progress'))
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')
    const steps = JSON.parse(readFileSync(planPath, 'utf8')).steps
    expect(steps[1]).toMatchObject({ status: 'in_progress' })
    expect(steps[1].startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
  })

  it('writes only inside the project directory when the working directory is elsewhere', () => {
    const elsewhere = join(root, 'elsewhere')
    mkdirSync(elsewhere)
    const result = run(taskUpdate('2', 'in_progress'), { CLAUDE_PROJECT_DIR: worktree }, elsewhere)
    expect(result.status).toBe(0)
    expect(readdirSync(elsewhere)).toEqual([])
    expect(readdirSync(join(worktree, '.agent-flow'))).toEqual(['plan.json'])
    expect(JSON.parse(readFileSync(planPath, 'utf8')).steps[1].status).toBe('in_progress')
  })

  it.each(['garbage', '', '{"hook_event_name":"PostToolUse"}', taskUpdate('99', 'completed')])(
    'stays silent with exit 0 on %j',
    (input) => {
      const result = run(input)
      expect(result.status).toBe(0)
      expect(result.stdout).toBe('')
      expect(result.stderr).toBe('')
    },
  )

  it('stays silent with exit 0 when CLAUDE_PROJECT_DIR is unset', () => {
    const result = run(taskUpdate('2', 'in_progress'), {})
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')
    expect(JSON.parse(readFileSync(planPath, 'utf8')).steps[1].status).toBe('todo')
  })
})

describe('hook registration', () => {
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))

  it('registers PostToolUse for TaskUpdate only', () => {
    expect(Object.keys(settings.hooks)).toEqual(['PostToolUse'])
    expect(settings.hooks.PostToolUse).toHaveLength(1)
    expect(settings.hooks.PostToolUse[0].matcher).toBe('TaskUpdate')
  })

  it('runs the step timing hook through tsx under AGENT_FLOW_HOME', () => {
    const hooks = settings.hooks.PostToolUse[0].hooks
    expect(hooks).toEqual([
      {
        type: 'command',
        command:
          '"$AGENT_FLOW_HOME/node_modules/.bin/tsx" "$AGENT_FLOW_HOME/capture/claude-code/src/step-timing/hook.ts"',
      },
    ])
    expect(relative(repo, hook)).toBe('capture/claude-code/src/step-timing/hook.ts')
  })
})

describe('hook holds no lifecycle rule', () => {
  it('imports the lifecycle from no non-test source', () => {
    for (const path of sources(sourceRoot)) {
      expect(importsOf(path), relative(repo, path)).not.toContain('@agent-flow/core/lifecycle')
    }
  })

  it('calls the shared plan writer from step-timing.ts', () => {
    const path = join(dirname(hook), 'step-timing.ts')
    expect(importsOf(path)).toContain('@agent-flow/capture-shared/plan-writer')
  })
})
