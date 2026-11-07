import { registerRuntimeDriver, writePlan } from './step-timing-claude-code.steps.ts'
import type { TimingWorld } from './step-timing-claude-code.steps.ts'
import { changeTodo, installStepTimingPlugin } from './opencode-plugin'
import type { Fire, Todo } from './opencode-plugin'

type OpenCodeWorld = TimingWorld & { todos: Todo[]; fire: Fire }

const titles = ['Architecture', 'Implementation']

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
    opencode.fire = installStepTimingPlugin(world.worktree)
  },
  start: (world, title) => {
    const { fire, todos } = world as OpenCodeWorld
    changeTodo(fire, todos, title, 'in_progress')
  },
  finish: (world, title) => {
    const { fire, todos } = world as OpenCodeWorld
    changeTodo(fire, todos, title, 'completed')
  },
})
