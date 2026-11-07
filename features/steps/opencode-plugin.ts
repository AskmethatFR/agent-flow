import assert from 'node:assert/strict'
import { createStepTimingPlugin } from '@agent-flow/capture-opencode/step-timing'

export type Todo = { content: string; status: 'pending' | 'in_progress' | 'completed' }
export type Fire = (event: unknown) => void

export const installStepTimingPlugin = (worktree: string): Fire => {
  let fire: Fire = () => assert.fail('the plugin registered no execute.after hook')
  const plugin = createStepTimingPlugin({ worktree, now: () => new Date() })
  void plugin.setup({
    tool: {
      hook: (name: string, callback: Fire) => {
        if (name === 'execute.after') fire = callback
      },
    },
  })
  return fire
}

export const changeTodo = (fire: Fire, todos: Todo[], title: string, status: Todo['status']): void => {
  const todo = todos.find((candidate) => candidate.content === title)
  assert.ok(todo !== undefined, `no todo "${title}"`)
  todo.status = status
  fire({ tool: 'todowrite', status: 'completed', sessionID: 'ses_bdd', input: { todos } })
}
