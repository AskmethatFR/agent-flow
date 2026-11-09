import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PluginServerContext } from '@getpaseo/plugin/server'
import contribute from '../index.server.ts'
import { getSnapshotRpc } from '../shared/snapshot-rpc.ts'

type Workspaces = { ref(workspaceId: string): { refresh(): Promise<unknown> } }
type Agents = { list(options: unknown): Promise<{ entries: unknown[] }> }
type Handler = (
  input: unknown,
  context: { paseo: { workspaces: Workspaces; agents: Agents } },
) => Promise<unknown>

const noAgents: Agents = { list: async () => ({ entries: [] }) }

let root: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'panel-snapshot-')))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const registeredHandler = (): Handler => {
  const registered: { contract: unknown; handler: Handler }[] = []
  const server = {
    handle: (contract: unknown, handler: Handler) => registered.push({ contract, handler }),
  } as unknown as PluginServerContext
  contribute(server)
  expect(registered).toHaveLength(1)
  expect(registered[0]?.contract).toBe(getSnapshotRpc)
  return registered[0]!.handler
}

const worktreeWithPlan = (status: 'todo' | 'in_progress' = 'todo'): string => {
  mkdirSync(join(root, '.agent-flow'))
  writeFileSync(
    join(root, '.agent-flow', 'plan.json'),
    JSON.stringify({
      issue: '#18',
      title: 'Plan 18',
      steps: [
        {
          id: 's1',
          title: 'Implementation',
          role: 'dev-a',
          status,
          origin: 'planned',
          startedAt: status === 'todo' ? null : '2026-11-01T09:00:00.000Z',
          endedAt: null,
        },
      ],
    }),
  )
  return root
}

describe('snapshot registration', () => {
  it('serves getSnapshotRpc and refuses a workspace the host does not know', async () => {
    const workspaces = { ref: () => ({ refresh: async () => null }) }
    const reply = await registeredHandler()(
      { workspaceId: 'w1' },
      { paseo: { workspaces, agents: noAgents } },
    )
    expect(reply).toEqual({ kind: 'refused', reason: 'unknown-worktree' })
  })

  it('serves the plan of the worktree the host maps the workspace to', async () => {
    const worktreeRoot = worktreeWithPlan()
    const workspaces = {
      ref: (workspaceId: string) => ({
        refresh: async () => (workspaceId === 'w1' ? { project: { checkout: { worktreeRoot } } } : null),
      }),
    }
    const reply = await registeredHandler()(
      { workspaceId: 'w1' },
      { paseo: { workspaces, agents: noAgents } },
    )
    expect(reply).toMatchObject({ kind: 'snapshot', snapshot: { issue: '#18', title: 'Plan 18' } })
  })

  it('reports the host agent on the worktree through the agents the host provides', async () => {
    const worktreeRoot = worktreeWithPlan('in_progress')
    const workspaces = {
      ref: () => ({ refresh: async () => ({ project: { checkout: { worktreeRoot } } }) }),
    }
    const agents: Agents = {
      list: async () => ({
        entries: [{ agent: { status: 'running' }, project: { checkout: { worktreeRoot } } }],
      }),
    }
    const reply = await registeredHandler()({ workspaceId: 'w1' }, { paseo: { workspaces, agents } })
    expect(reply).toMatchObject({
      kind: 'snapshot',
      snapshot: { currentAgent: { role: 'dev-a', state: 'running' } },
    })
  })
})
