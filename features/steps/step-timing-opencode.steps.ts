import assert from 'node:assert/strict'
import { createStepTimingPlugin } from '@agent-flow/capture-opencode/step-timing'
import { registerRuntimeDriver, writePlan } from './step-timing-claude-code.steps.ts'
import type { TimingWorld } from './step-timing-claude-code.steps.ts'

type Todo = { content: string; status: 'pending' | 'in_progress' | 'completed' }
type Fire = (event: unknown) => void

type OpenCodeWorld = TimingWorld & { todos: Todo[]; fire: Fire }

const titles = ['Architecture', 'Implementation']

const install = (world: OpenCodeWorld): void => {
  let fire: Fire = () => assert.fail('the plugin registered no execute.after hook')
  const plugin = createStepTimingPlugin({ worktree: world.worktree, now: () => new Date() })
  void plugin.setup({
    tool: {
      hook: (name: string, callback: Fire) => {
        if (name === 'execute.after') fire = callback
      },
    },
  })
  world.fire = fire
}

const change = (world: OpenCodeWorld, title: string, status: Todo['status']): void => {
  const todo = world.todos.find((candidate) => candidate.content === title)
  assert.ok(todo !== undefined, `no todo "${title}"`)
  todo.status = status
  world.fire({ tool: 'todowrite', status: 'completed', sessionID: 'ses_bdd', input: { todos: world.todos } })
}

registerRuntimeDriver('OpenCode v2', {
  seedPlan: (world) => {
    const opencode = world as OpenCodeWorld
    opencode.todos = titles.map((content) => ({ content, status: 'pending' }))
    writePlan(
      world,
      titles.map((title) => ({
        id: title,
        title,
        role: 'dev-a',
        status: 'todo',
        origin: 'planned',
        startedAt: null,
        endedAt: null,
      })),
    )
    install(opencode)
  },
  start: (world, title) => change(world as OpenCodeWorld, title, 'in_progress'),
  finish: (world, title) => change(world as OpenCodeWorld, title, 'completed'),
})
