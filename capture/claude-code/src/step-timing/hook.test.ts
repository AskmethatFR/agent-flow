import { spawnSync } from 'node:child_process'
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_TEXT_LENGTH } from '@agent-flow/core/contracts'
import { readBoundedInput } from './bounded-input'

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

const registeredCommand: string = JSON.parse(readFileSync(settingsPath, 'utf8')).hooks.PostToolUse[0].hooks[0].command

const runRegistered = (input: string, cwd: string, env: Record<string, string | undefined> = {}) =>
  spawnSync('sh', ['-c', registeredCommand], {
    cwd,
    input,
    encoding: 'utf8',
    env: { ...process.env, AGENT_FLOW_HOME: repo, CLAUDE_PROJECT_DIR: worktree, ...env },
  })

const lifecycleDirectory = join(repo, 'core/src/lifecycle')

const reachesLifecycle = (path: string): string[] =>
  importsOf(path).filter(
    (specifier) =>
      specifier === '@agent-flow/core/lifecycle' ||
      (specifier.startsWith('.') &&
        (resolve(dirname(path), specifier) === lifecycleDirectory ||
          resolve(dirname(path), specifier).startsWith(`${lifecycleDirectory}/`))),
  )

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

describe('step timing hook process', { timeout: 30_000 }, () => {
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

  it('registers PostToolUse for TaskCreate and TaskUpdate only', () => {
    expect(Object.keys(settings.hooks)).toEqual(['PostToolUse'])
    expect(settings.hooks.PostToolUse).toHaveLength(1)
    expect(settings.hooks.PostToolUse[0].matcher).toBe('TaskCreate|TaskUpdate')
  })

  it('runs the step timing hook through tsx under AGENT_FLOW_HOME', () => {
    const hooks = settings.hooks.PostToolUse[0].hooks
    expect(hooks).toEqual([
      {
        type: 'command',
        command:
          '"${AGENT_FLOW_HOME:?}/node_modules/.bin/tsx" --tsconfig "${AGENT_FLOW_HOME:?}/tsconfig.json" "${AGENT_FLOW_HOME:?}/capture/claude-code/src/step-timing/hook.ts"',
        timeout: 10,
      },
    ])
    expect(relative(repo, hook)).toBe('capture/claude-code/src/step-timing/hook.ts')
  })
})

describe('hook holds no lifecycle rule', () => {
  it('imports the lifecycle from no non-test source', () => {
    for (const path of sources(sourceRoot)) {
      expect(reachesLifecycle(path), relative(repo, path)).toEqual([])
    }
  })

  it('flags a relative import that resolves into core/lifecycle', () => {
    const fixture = join(root, 'sneaky.ts')
    writeFileSync(fixture, `import { startStep } from '${relative(root, lifecycleDirectory)}/index'\nvoid startStep\n`)
    expect(reachesLifecycle(fixture)).toHaveLength(1)
    writeFileSync(fixture, `import { startStep } from '${relative(root, lifecycleDirectory)}'\nvoid startStep\n`)
    expect(reachesLifecycle(fixture)).toHaveLength(1)
    writeFileSync(fixture, `import { x } from './lifecycle-lookalike'\nvoid x\n`)
    expect(reachesLifecycle(fixture)).toEqual([])
  })

  it('calls the shared plan writer from step-timing.ts', () => {
    const path = join(dirname(hook), 'step-timing.ts')
    expect(importsOf(path)).toContain('@agent-flow/capture-shared/plan-writer')
  })
})

describe('registered command hardening', { timeout: 30_000 }, () => {
  it('runs the registered command and records the step', () => {
    const result = runRegistered(taskUpdate('2', 'in_progress'), worktree)
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')
    expect(JSON.parse(readFileSync(planPath, 'utf8')).steps[1].status).toBe('in_progress')
  })

  it('ignores a tsconfig.json in the working directory', () => {
    const hostile = join(root, 'hostile')
    mkdirSync(hostile)
    const marker = join(root, 'marker')
    writeFileSync(join(hostile, 'evil.ts'), `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(marker)}, 'pwned')\nexport const applyStepEvent = () => ({ accepted: true })\nexport const MAX_TEXT_LENGTH = 1\n`)
    writeFileSync(
      join(hostile, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@agent-flow/*': ['./evil.ts'] } } }),
    )
    const result = runRegistered(taskUpdate('2', 'in_progress'), hostile)
    expect(existsSync(marker)).toBe(false)
    expect(result.status).toBe(0)
    expect(JSON.parse(readFileSync(planPath, 'utf8')).steps[1].status).toBe('in_progress')
  })

  it('fails loudly, not silently, when AGENT_FLOW_HOME is unset', () => {
    const result = runRegistered(taskUpdate('2', 'in_progress'), worktree, { AGENT_FLOW_HOME: undefined })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('AGENT_FLOW_HOME')
    expect(JSON.parse(readFileSync(planPath, 'utf8')).steps[1].status).toBe('todo')
  })

  it('stays silent with exit 0 when the module cannot be imported', () => {
    const lone = join(root, 'lone')
    mkdirSync(lone)
    writeFileSync(join(lone, 'package.json'), '{"type":"module"}')
    copyFileSync(hook, join(lone, 'hook.ts'))
    const result = spawnSync(tsx, ['--tsconfig', join(repo, 'tsconfig.json'), join(lone, 'hook.ts')], {
      cwd: lone,
      input: taskUpdate('2', 'in_progress'),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: worktree },
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')
  })
})

describe('readBoundedInput', () => {
  const limit = 4 * MAX_TEXT_LENGTH
  const fdOf = (content: string): number => {
    const path = join(root, 'stdin.txt')
    writeFileSync(path, content)
    return openSync(path, 'r')
  }

  it('returns a short input whole', () => {
    const fd = fdOf('{"a":1}')
    expect(readBoundedInput(fd)).toBe('{"a":1}')
    closeSync(fd)
  })

  it('returns an empty string for an empty input', () => {
    const fd = fdOf('')
    expect(readBoundedInput(fd)).toBe('')
    closeSync(fd)
  })

  it('returns an input of exactly the limit whole', () => {
    const fd = fdOf('x'.repeat(limit))
    expect(readBoundedInput(fd)).toHaveLength(limit)
    closeSync(fd)
  })

  it('stops reading one byte past the limit', () => {
    const fd = fdOf('x'.repeat(limit + 5000))
    expect(readBoundedInput(fd)).toHaveLength(limit + 1)
    closeSync(fd)
  })

  it('exits 0, silent, and leaves the plan alone on oversized stdin', { timeout: 30_000 }, () => {
    const result = run('x'.repeat(8 * limit))
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')
    expect(JSON.parse(readFileSync(planPath, 'utf8')).steps[1].status).toBe('todo')
  })
})
