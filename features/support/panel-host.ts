import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mock } from 'node:test'
import { After } from '@cucumber/cucumber'
import type { PluginServerContext } from '@getpaseo/plugin/server'
import contribute from '../../panel/index.server.ts'
import { getSnapshotRpc } from '../../panel/shared/snapshot-rpc.ts'
import { renderPanel } from '../../panel/client/testing/render-panel.tsx'
import type { RenderedPanel } from '../../panel/client/testing/render-panel.tsx'

type Handler = (input: unknown, context: { paseo: { workspaces: unknown; agents: unknown } }) => Promise<unknown>

export type PanelWorld = {
  root: string
  panel: RenderedPanel
  texts: string[]
  expectedStep: string
  expectedField: string
  now?: Date
  agentStatus?: string
  snapshotReply?: unknown
}

const workspaceId = 'w1'

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

export const decisionOf = (
  step: string,
  title: string,
  why = `because ${title}`,
  rejected: readonly string[] = [],
  role = 'dev-a',
  confidence = 'high',
): Record<string, unknown> => ({
  at: '2026-10-22T10:00:00Z',
  step,
  role,
  kind: 'decision',
  title,
  why,
  rejected,
  confidence,
})

export const writeDecisions = (world: PanelWorld, lines: readonly Record<string, unknown>[]): void => {
  writeFileSync(
    join(world.root, '.agent-flow', 'decisions.jsonl'),
    lines.map((line) => JSON.stringify(line)).join('\n'),
  )
}

const hostInvoke = (world: PanelWorld) => {
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
  const agents = {
    list: async () => ({
      entries:
        world.agentStatus === undefined
          ? []
          : [{ agent: { status: world.agentStatus }, project: { checkout: { worktreeRoot: world.root } } }],
    }),
  }
  return async (_method: string, input: unknown) => handler!(input, { paseo: { workspaces, agents } })
}

type Invoke = (method: string, input: unknown) => Promise<unknown>

const openWith = async (world: PanelWorld, invoke: Invoke): Promise<void> => {
  if (world.now === undefined) mock.timers.enable({ apis: ['setTimeout'] })
  else mock.timers.enable({ apis: ['setTimeout', 'Date'], now: world.now })
  world.panel = await renderPanel(invoke, { workspaceId })
  world.texts = world.panel.texts()
}

export const openPanel = (world: PanelWorld): Promise<void> => openWith(world, hostInvoke(world))

export const openPanelOnReply = (world: PanelWorld, reply: unknown): Promise<void> => {
  const parsed = getSnapshotRpc.output.parse(reply)
  return openWith(world, async () => parsed)
}

export const selectStep = async (world: PanelWorld, rowText: string): Promise<void> => {
  await world.panel.press(rowText)
  world.texts = world.panel.texts()
}

After(async function (this: PanelWorld) {
  mock.timers.reset()
  await this.panel?.unmount()
  if (this.root) rmSync(this.root, { recursive: true, force: true })
})
