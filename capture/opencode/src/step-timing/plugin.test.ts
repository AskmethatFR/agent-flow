import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createStepTimingPlugin } from './plugin'

const instant = new Date('2026-01-01T10:00:00.000Z')

const stepOf = (id: string) => ({
  id,
  title: id,
  role: 'dev-a',
  status: 'todo',
  origin: 'planned',
  startedAt: null,
  endedAt: null,
})

type Callback = (event: unknown) => unknown

const hostDouble = () => {
  const hooks: { name: string; callback: Callback }[] = []
  return { hooks, ctx: { tool: { hook: (name: string, callback: Callback) => void hooks.push({ name, callback }) } } }
}

const inProgress = (content: string) => ({
  tool: 'todowrite',
  status: 'completed',
  input: { todos: [{ content, status: 'in_progress' }] },
})

let root: string
let worktree: string
let planPath: string

const stepsNow = (): Record<string, unknown>[] => JSON.parse(readFileSync(planPath, 'utf8')).steps

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'opencode-plugin-')))
  worktree = join(root, 'worktree')
  mkdirSync(join(worktree, '.agent-flow'), { recursive: true })
  planPath = join(worktree, '.agent-flow', 'plan.json')
  writeFileSync(planPath, JSON.stringify({ issue: '#15', title: 'Step timing', steps: [stepOf('Implementation')] }))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('createStepTimingPlugin', () => {
  it('has a stable id', () => {
    expect(createStepTimingPlugin({ worktree, now: () => instant }).id).toBe('agent-flow.step-timing')
  })

  it('registers exactly one hook, execute.after', async () => {
    const { hooks, ctx } = hostDouble()
    await createStepTimingPlugin({ worktree, now: () => instant }).setup(ctx)
    expect(hooks.map((hook) => hook.name)).toEqual(['execute.after'])
  })

  it('records a step through the registered hook with the injected time', async () => {
    const { hooks, ctx } = hostDouble()
    await createStepTimingPlugin({ worktree, now: () => instant }).setup(ctx)
    hooks[0]?.callback(inProgress('Implementation'))
    expect(stepsNow()[0]).toMatchObject({ status: 'in_progress', startedAt: instant.toISOString() })
  })

  it.each([undefined, ''])('is inert when the worktree is %j', async (empty) => {
    const { hooks, ctx } = hostDouble()
    const disposer = await createStepTimingPlugin({ worktree: empty, now: () => instant }).setup(ctx)
    expect(hooks).toEqual([])
    expect(disposer).toBeUndefined()
    expect(stepsNow()[0]).toMatchObject({ status: 'todo' })
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['without tool', {}],
    ['a null tool', { tool: null }],
    ['a tool without hook', { tool: {} }],
    ['a non-function hook', { tool: { hook: 'execute.after' } }],
  ])('registers nothing and does not throw for a ctx of %s', async (_name, ctx) => {
    const plugin = createStepTimingPlugin({ worktree, now: () => instant })
    await expect(Promise.resolve(plugin.setup(ctx as never))).resolves.toBeUndefined()
    expect(stepsNow()[0]).toMatchObject({ status: 'todo' })
  })

  it('swallows a throwing event getter, silently', async () => {
    const { hooks, ctx } = hostDouble()
    await createStepTimingPlugin({ worktree, now: () => instant }).setup(ctx)
    const hostile = {
      get tool(): string {
        throw new Error('boom')
      },
    }
    const writes: string[] = []
    const out = process.stdout.write
    const err = process.stderr.write
    process.stdout.write = ((chunk: string) => void writes.push(String(chunk))) as never
    process.stderr.write = ((chunk: string) => void writes.push(String(chunk))) as never
    try {
      expect(hooks[0]?.callback(hostile)).toBeUndefined()
    } finally {
      process.stdout.write = out
      process.stderr.write = err
    }
    expect(writes).toEqual([])
  })

  it('swallows a throwing clock', async () => {
    const { hooks, ctx } = hostDouble()
    const clock = (): Date => {
      throw new Error('clock')
    }
    await createStepTimingPlugin({ worktree, now: clock }).setup(ctx)
    expect(hooks[0]?.callback(inProgress('Implementation'))).toBeUndefined()
    expect(stepsNow()[0]).toMatchObject({ status: 'todo' })
  })

  it('writes nothing after the disposer ran', async () => {
    const { hooks, ctx } = hostDouble()
    const disposer = await createStepTimingPlugin({ worktree, now: () => instant }).setup(ctx)
    expect(typeof disposer).toBe('function')
    ;(disposer as () => void)()
    hooks[0]?.callback(inProgress('Implementation'))
    expect(stepsNow()[0]).toMatchObject({ status: 'todo', startedAt: null })
  })
})
