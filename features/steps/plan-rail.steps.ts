import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { After, Given, Then, When } from '@cucumber/cucumber'
import type { PluginServerContext } from '@getpaseo/plugin/server'
import contribute from '../../panel/index.server.ts'
import { renderPanel } from '../../panel/client/testing/render-panel.tsx'
import type { RenderedPanel } from '../../panel/client/testing/render-panel.tsx'

type Handler = (input: unknown, context: { paseo: { workspaces: unknown } }) => Promise<unknown>

type PlanRailWorld = {
  root: string
  panel: RenderedPanel
  texts: string[]
}

const workspaceId = 'w1'

const stepOf = (id: string, title: string, status = 'todo'): Record<string, unknown> => ({
  id,
  title,
  role: 'dev-a',
  status,
  origin: 'planned',
  startedAt: null,
  endedAt: null,
})

const writePlan = (world: PlanRailWorld, plan: Record<string, unknown>): void => {
  world.root = realpathSync(mkdtempSync(join(tmpdir(), 'plan-rail-')))
  mkdirSync(join(world.root, '.agent-flow'))
  writeFileSync(join(world.root, '.agent-flow', 'plan.json'), JSON.stringify(plan))
}

const hostInvoke = (world: PlanRailWorld) => {
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

Given(
  'the current worktree works on the issue {string} with the steps {string}, {string} and {string} in that order',
  function (this: PlanRailWorld, title: string, first: string, second: string, third: string) {
    writePlan(this, {
      issue: '#42',
      title,
      steps: [stepOf('s1', first), stepOf('s2', second), stepOf('s3', third)],
    })
  },
)

When('the user opens the {string} tab', async function (this: PlanRailWorld, _tab: string) {
  this.panel = await renderPanel(hostInvoke(this), { workspaceId })
  this.texts = this.panel.texts()
})

Then('the panel shows the title {string}', function (this: PlanRailWorld, title: string) {
  assert.ok(this.texts.includes(title), `title "${title}" not in ${JSON.stringify(this.texts)}`)
})

Then(
  'the panel lists the steps {string}, {string} and {string} in that order',
  function (this: PlanRailWorld, first: string, second: string, third: string) {
    const positions = [first, second, third].map((title) => this.texts.findIndex((text) => text.includes(title)))
    assert.ok(positions.every((position) => position >= 0), `steps missing in ${JSON.stringify(this.texts)}`)
    assert.deepEqual([...positions].sort((a, b) => a - b), positions)
  },
)

After(async function (this: PlanRailWorld) {
  await this.panel?.unmount()
  if (this.root) rmSync(this.root, { recursive: true, force: true })
})
