import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mock } from 'node:test'
import { After } from '@cucumber/cucumber'
import type { PluginServerContext } from '@getpaseo/plugin/server'
import contribute from '../../panel/index.server.ts'
import type { RenderedPanel } from '../../panel/client/testing/render-panel.tsx'

type Handler = (input: unknown, context: { paseo: { workspaces: unknown } }) => Promise<unknown>

export type PanelWorld = {
  root: string
  panel: RenderedPanel
  texts: string[]
}

export const stepOf = (
  id: string,
  title: string,
  status = 'todo',
  startedAt: string | null = null,
  endedAt: string | null = null,
): Record<string, unknown> => ({
  id,
  title,
  role: 'dev-a',
  status,
  origin: 'planned',
  startedAt,
  endedAt,
})

export const writePlan = (world: PanelWorld, plan: Record<string, unknown>): void => {
  world.root = realpathSync(mkdtempSync(join(tmpdir(), 'plan-rail-')))
  mkdirSync(join(world.root, '.agent-flow'))
  writeFileSync(join(world.root, '.agent-flow', 'plan.json'), JSON.stringify(plan))
}

export const hostInvoke = (world: PanelWorld) => {
  let handler: Handler | undefined
  const server = {
    handle: (_contract: unknown, registered: Handler) => {
      handler = registered
    },
  } as unknown as PluginServerContext
  contribute(server)
  const workspaces = {
    ref: () => ({ refresh: async () => ({ project: { checkout: { worktreeRoot: world.root } } }) }),
  }
  return async (_method: string, input: unknown) => handler!(input, { paseo: { workspaces } })
}

After(async function (this: PanelWorld) {
  mock.timers.reset()
  await this.panel?.unmount()
  if (this.root) rmSync(this.root, { recursive: true, force: true })
})
