import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const repo = fileURLToPath(new URL('../../../../', import.meta.url))
const tsx = join(repo, 'node_modules/.bin/tsx')
const entry = join(repo, 'capture/opencode/src/step-timing/entry.ts')

const stepOf = (id: string) => ({
  id,
  title: id,
  role: 'dev-a',
  status: 'todo',
  origin: 'planned',
  startedAt: null,
  endedAt: null,
})

const script = `
const { default: plugin } = await import(${JSON.stringify(entry)})
const hooks = []
await plugin.setup({ tool: { hook: (name, callback) => hooks.push({ name, callback }) } })
for (const hook of hooks) {
  hook.callback({ tool: 'todowrite', status: 'completed', input: { todos: [{ content: 'Implementation', status: 'in_progress' }] } })
}
process.stdout.write(JSON.stringify({ id: plugin.id, hooks: hooks.map((hook) => hook.name) }) + '\\n')
`

let root: string
let probe: string
let worktree: string
let planPath: string

const run = (env: Record<string, string | undefined>, cwd: string = worktree) =>
  spawnSync(tsx, ['--tsconfig', join(repo, 'tsconfig.json'), probe], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, AGENT_FLOW_WORKTREE: undefined, ...env },
  })

const stepsNow = (): Record<string, unknown>[] => JSON.parse(readFileSync(planPath, 'utf8')).steps

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'opencode-entry-')))
  worktree = join(root, 'worktree')
  mkdirSync(join(worktree, '.agent-flow'), { recursive: true })
  planPath = join(worktree, '.agent-flow', 'plan.json')
  probe = join(root, 'probe.mjs')
  writeFileSync(probe, script)
  writeFileSync(planPath, JSON.stringify({ issue: '#15', title: 'Step timing', steps: [stepOf('Implementation')] }))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('entry module', { timeout: 30_000 }, () => {
  it('registers the hook and records the step in the AGENT_FLOW_WORKTREE plan, silently', () => {
    const result = run({ AGENT_FLOW_WORKTREE: worktree })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ id: 'agent-flow.step-timing', hooks: ['execute.after'] })
    expect(stepsNow()[0]).toMatchObject({ status: 'in_progress' })
  })

  it.each([undefined, ''])('registers nothing and writes nothing when AGENT_FLOW_WORKTREE is %j', (value) => {
    const result = run({ AGENT_FLOW_WORKTREE: value })
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual({ id: 'agent-flow.step-timing', hooks: [] })
    expect(stepsNow()[0]).toMatchObject({ status: 'todo' })
  })

  it('writes only under the worktree when the working directory is elsewhere', () => {
    const elsewhere = join(root, 'elsewhere')
    mkdirSync(elsewhere)
    const result = run({ AGENT_FLOW_WORKTREE: worktree }, elsewhere)
    expect(result.status).toBe(0)
    expect(readdirSync(elsewhere)).toEqual([])
    expect(readdirSync(join(worktree, '.agent-flow'))).toEqual(['plan.json'])
    expect(stepsNow()[0]).toMatchObject({ status: 'in_progress' })
  })

  it('stays silent and writes nothing for a relative AGENT_FLOW_WORKTREE', () => {
    const result = run({ AGENT_FLOW_WORKTREE: '../worktree' })
    expect(result.stderr).toBe('')
    expect(stepsNow()[0]).toMatchObject({ status: 'todo' })
  })
})
