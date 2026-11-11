import * as fs from 'node:fs'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGetSnapshot } from './get-snapshot'
import type { AgentEntry, AgentListOptions, AgentSource } from './agent-status'
import type { WorkspaceReading, WorkspaceSource } from './get-snapshot'
import type { ReadIo } from './read-agent-flow-file'

const now = new Date('2026-11-01T10:00:00.000Z')

let root: string
let opened: string[]
let resolved: string[]
let listed: AgentListOptions[]

const io: ReadIo = {
  ...fs,
  realpathSync: ((path: fs.PathLike) => {
    resolved.push(String(path))
    return fs.realpathSync(path)
  }) as ReadIo['realpathSync'],
  openSync: ((path: fs.PathLike, ...rest: unknown[]) => {
    opened.push(String(path))
    return (fs.openSync as (p: fs.PathLike, ...r: unknown[]) => number)(path, ...rest)
  }) as ReadIo['openSync'],
}

const handler = createGetSnapshot({ io, now: () => now })

const agentsOf = (entries: readonly AgentEntry[]): AgentSource => ({
  list: async (options) => {
    listed.push(options)
    return { entries }
  },
})

const noAgents = agentsOf([])

const getSnapshot = (request: unknown, workspaces: WorkspaceSource, agents: AgentSource = noAgents) =>
  handler(request, workspaces, agents)

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'get-snapshot-')))
  opened = []
  resolved = []
  listed = []
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const planWith = (issue: string, status: 'todo' | 'in_progress' | 'done'): string =>
  JSON.stringify({
    issue,
    title: `Plan ${issue}`,
    steps: [
      {
        id: 's1',
        title: 'Implementation',
        role: 'dev-a',
        status,
        origin: 'planned',
        startedAt: status === 'todo' ? null : '2026-11-01T09:00:00.000Z',
        endedAt: status === 'done' ? '2026-11-01T09:30:00.000Z' : null,
      },
    ],
  })

const worktreeWith = (name: string, plan: string): string => {
  const worktree = join(root, name)
  mkdirSync(join(worktree, '.agent-flow'), { recursive: true })
  writeFileSync(join(worktree, '.agent-flow', 'plan.json'), plan)
  return worktree
}

const sourceOf = (
  readings: Record<string, WorkspaceReading | null | Error>,
): WorkspaceSource => ({
  ref: (workspaceId) => ({
    refresh: async () => {
      const reading = readings[workspaceId]
      if (reading instanceof Error) throw reading
      return reading ?? null
    },
  }),
})

const at = (worktreeRoot: string | null | undefined): WorkspaceReading => ({
  project: { checkout: { worktreeRoot } },
})

const refused = { kind: 'refused', reason: 'unknown-worktree' }

describe('getSnapshot', () => {
  it('returns the snapshot built from the worktree plan', async () => {
    const worktree = worktreeWith('a', planWith('#1', 'in_progress'))
    const reply = await getSnapshot({ workspaceId: 'w1' }, sourceOf({ w1: at(worktree) }))
    expect(reply).toEqual({
      kind: 'snapshot',
      snapshot: {
        issue: '#1',
        title: 'Plan #1',
        steps: [
          {
            id: 's1',
            title: 'Implementation',
            role: 'dev-a',
            status: 'in_progress',
            origin: 'planned',
            timeSpent: { label: '1 h', milliseconds: 3_600_000 },
            decisions: [],
            omittedDecisions: 0,
            facts: [],
            omittedFacts: 0,
          },
        ],
        currentStepId: 's1',
        currentAgent: null,
        ci: null,
        errors: [],
      },
    })
  })

  it('reflects only the plan of the worktree asked for', async () => {
    const first = worktreeWith('a', planWith('#1', 'done'))
    const second = worktreeWith('b', planWith('#2', 'in_progress'))
    const source = sourceOf({ w1: at(first), w2: at(second) })
    const one = await getSnapshot({ workspaceId: 'w1' }, source)
    const two = await getSnapshot({ workspaceId: 'w2' }, source)
    expect(one).toMatchObject({ kind: 'snapshot', snapshot: { issue: '#1', currentStepId: null } })
    expect(two).toMatchObject({ kind: 'snapshot', snapshot: { issue: '#2', currentStepId: 's1' } })
  })

  it('resolves a symlinked worktree root before reading', async () => {
    const worktree = worktreeWith('a', planWith('#1', 'todo'))
    const link = join(root, 'link')
    symlinkSync(worktree, link)
    const reply = await getSnapshot({ workspaceId: 'w1' }, sourceOf({ w1: at(link) }))
    expect(reply).toMatchObject({ kind: 'snapshot', snapshot: { issue: '#1' } })
  })

  it('serves a snapshot with a contract error when plan.json is missing', async () => {
    const worktree = join(root, 'empty')
    mkdirSync(worktree)
    const reply = await getSnapshot({ workspaceId: 'w1' }, sourceOf({ w1: at(worktree) }))
    expect(reply).toEqual({
      kind: 'snapshot',
      snapshot: {
        issue: null,
        title: null,
        steps: [],
        currentStepId: null,
        currentAgent: null,
        ci: null,
        errors: [{ file: 'plan.json', location: null, field: null, message: 'is missing' }],
      },
    })
  })

  it('uses the clock it is given', async () => {
    const worktree = worktreeWith('a', planWith('#1', 'in_progress'))
    const later = createGetSnapshot({ io, now: () => new Date('2026-11-01T11:00:00.000Z') })
    const reply = await later({ workspaceId: 'w1' }, sourceOf({ w1: at(worktree) }), noAgents)
    expect(reply).toMatchObject({
      snapshot: { steps: [{ timeSpent: { label: '2 h', milliseconds: 7_200_000 } }] },
    })
  })

  describe('decisions', () => {
    const decisionLine = (step: string): string =>
      JSON.stringify({
        at: '2026-11-01T09:10:00Z',
        step,
        role: 'dev-a',
        kind: 'decision',
        title: 'Use a Map',
        why: 'safe keys',
        confidence: 'high',
      })

    const snapshotOf = async (worktree: string) => {
      const reply = await getSnapshot({ workspaceId: 'w1' }, sourceOf({ w1: at(worktree) }))
      if (reply.kind !== 'snapshot') throw new Error('expected a snapshot')
      return reply.snapshot
    }

    it('groups the decisions of decisions.jsonl under their step', async () => {
      const worktree = worktreeWith('a', planWith('#1', 'todo'))
      writeFileSync(join(worktree, '.agent-flow', 'decisions.jsonl'), `${decisionLine('s1')}\n`)
      const snapshot = await snapshotOf(worktree)
      expect(snapshot.errors).toEqual([])
      expect(snapshot.steps[0]?.decisions).toEqual([
        { title: 'Use a Map', why: 'safe keys', rejected: [], role: 'dev-a', confidence: 'high' },
      ])
      expect(snapshot.steps[0]?.facts).toEqual([
        { origin: 'declared', source: 'decisions.jsonl', label: 'Use a Map' },
      ])
    })

    it('gives no decision and no error when decisions.jsonl is missing', async () => {
      const snapshot = await snapshotOf(worktreeWith('a', planWith('#1', 'todo')))
      expect(snapshot.errors).toEqual([])
      expect(snapshot.steps[0]?.decisions).toEqual([])
    })

    it('reports a symlinked decisions.jsonl as unreadable and keeps the steps', async () => {
      const worktree = worktreeWith('a', planWith('#1', 'todo'))
      const target = join(root, 'elsewhere.jsonl')
      writeFileSync(target, `${decisionLine('s1')}\n`)
      symlinkSync(target, join(worktree, '.agent-flow', 'decisions.jsonl'))
      const snapshot = await snapshotOf(worktree)
      expect(snapshot.steps[0]?.decisions).toEqual([])
      expect(snapshot.errors).toEqual([
        { file: 'decisions.jsonl', location: null, field: null, message: 'cannot be read' },
      ])
    })
  })

  describe('agent state', () => {
    const agentAt = (
      worktreeRoot: string | null | undefined,
      status: string | null | undefined = 'running',
    ): AgentEntry => ({ agent: { status }, project: { checkout: { worktreeRoot } } })

    const snapshotWith = async (worktree: string, entries: readonly AgentEntry[]) => {
      const reply = await getSnapshot({ workspaceId: 'w1' }, sourceOf({ w1: at(worktree) }), agentsOf(entries))
      if (reply.kind !== 'snapshot') throw new Error('expected a snapshot')
      return reply.snapshot
    }

    const inProgressWorktree = (name = 'a'): string => worktreeWith(name, planWith('#1', 'in_progress'))

    it('reports a running agent on the worktree as running', async () => {
      const worktree = inProgressWorktree()
      const snapshot = await snapshotWith(worktree, [agentAt(worktree, 'running')])
      expect(snapshot.currentAgent).toEqual({ role: 'dev-a', state: 'running' })
    })

    it('reports an idle agent on the worktree as stopped', async () => {
      const worktree = inProgressWorktree()
      const snapshot = await snapshotWith(worktree, [agentAt(worktree, 'idle')])
      expect(snapshot.currentAgent).toEqual({ role: 'dev-a', state: 'stopped' })
    })

    it('reports no agent when the only agent works on another worktree', async () => {
      const worktree = inProgressWorktree('a')
      const other = inProgressWorktree('b')
      const snapshot = await snapshotWith(worktree, [agentAt(other)])
      expect(snapshot.currentAgent).toBeNull()
    })

    it('reports no agent when the host lists none', async () => {
      const snapshot = await snapshotWith(inProgressWorktree(), [])
      expect(snapshot.currentAgent).toBeNull()
    })

    it('matches an agent whose worktree root is a symlink to the worktree', async () => {
      const worktree = inProgressWorktree()
      const link = join(root, 'link')
      symlinkSync(worktree, link)
      const snapshot = await snapshotWith(worktree, [agentAt(link, 'idle')])
      expect(snapshot.currentAgent).toEqual({ role: 'dev-a', state: 'stopped' })
    })

    it('does not match a sibling directory sharing the worktree path as a prefix', async () => {
      const worktree = inProgressWorktree('claude-t3-2')
      const sibling = inProgressWorktree('claude-t3-26')
      const child = join(worktree, 'child')
      mkdirSync(child)
      const snapshot = await snapshotWith(worktree, [agentAt(sibling), agentAt(child), agentAt(root)])
      expect(snapshot.currentAgent).toBeNull()
    })

    it('takes the first matching entry over a later one', async () => {
      const worktree = inProgressWorktree()
      const snapshot = await snapshotWith(worktree, [agentAt(worktree, 'idle'), agentAt(worktree, 'running')])
      expect(snapshot.currentAgent).toEqual({ role: 'dev-a', state: 'stopped' })
    })

    it('takes the first entry on the worktree even when its status is not mapped', async () => {
      const worktree = inProgressWorktree()
      const snapshot = await snapshotWith(worktree, [agentAt(worktree, 'whatever'), agentAt(worktree, 'idle')])
      expect(snapshot.currentAgent).toEqual({ role: 'dev-a', state: 'unknown' })
    })

    const unusableEntries: [string, AgentEntry][] = [
      ['has no project', { agent: { status: 'running' }, project: null }],
      ['has an absent project', { agent: { status: 'running' } }],
      ['has a null worktree root', agentAt(null)],
      ['has a relative worktree root', agentAt('relative/path')],
      ['has a worktree root that does not exist', agentAt('/nonexistent/af41-worktree')],
    ]
    it.each(unusableEntries)('skips an entry that %s and keeps looking', async (_, unusable) => {
      const worktree = inProgressWorktree()
      const snapshot = await snapshotWith(worktree, [unusable, agentAt(worktree, 'idle')])
      expect(snapshot.currentAgent).toEqual({ role: 'dev-a', state: 'stopped' })
    })

    it.each([
      ['an empty object', {}],
      ['a number', 42],
    ])('reports no agent and no error when the matching entry has %s as its status', async (_, status) => {
      const worktree = inProgressWorktree()
      const entry = { agent: { status }, project: { checkout: { worktreeRoot: worktree } } } as unknown as AgentEntry
      const snapshot = await snapshotWith(worktree, [entry])
      expect(snapshot.currentAgent).toBeNull()
      expect(snapshot.errors).toEqual([])
    })

    it('resolves no path an entry without an absolute worktree root supplies', async () => {
      const worktree = inProgressWorktree()
      const noRoots: AgentEntry[] = [
        agentAt(null),
        agentAt('relative/path'),
        { agent: { status: 'running' }, project: null },
      ]
      await snapshotWith(worktree, noRoots)
      expect(resolved.filter((path) => !path.startsWith(worktree))).toEqual([])
    })

    it.each([
      ['null', { status: null }],
      ['missing', {}],
    ])('reports no agent when the matching entry has a %s status', async (_, agent) => {
      const worktree = inProgressWorktree()
      const entry: AgentEntry = { agent, project: { checkout: { worktreeRoot: worktree } } }
      const snapshot = await snapshotWith(worktree, [entry])
      expect(snapshot.currentAgent).toBeNull()
    })

    it('asks the host once, for the most recently updated agents, one page of 100', async () => {
      const worktree = inProgressWorktree()
      await snapshotWith(worktree, [agentAt(worktree)])
      expect(listed).toEqual([{ sort: [{ key: 'updated_at', direction: 'desc' }], page: { limit: 100 } }])
    })

    it('reports no agent and leaves the plan alone when no step is in progress', async () => {
      const worktree = worktreeWith('a', planWith('#1', 'todo'))
      const snapshot = await snapshotWith(worktree, [agentAt(worktree)])
      expect(snapshot.currentAgent).toBeNull()
      expect(snapshot.errors).toEqual([])
    })

    const failures: [string, AgentSource][] = [
      ['rejects', { list: async () => Promise.reject(new Error('boom /secret/path')) }],
      [
        'throws synchronously',
        {
          list: () => {
            throw new Error('boom /secret/path')
          },
        },
      ],
      ['resolves an empty object', { list: async () => ({}) as { entries: AgentEntry[] } }],
      ['resolves null entries', { list: async () => ({ entries: null }) as unknown as { entries: AgentEntry[] } }],
    ]
    it.each(failures)('keeps the snapshot intact and adds one error when the host list %s', async (_, agents) => {
      const worktree = inProgressWorktree()
      const baseline = await snapshotWith(worktree, [])
      const reply = await getSnapshot({ workspaceId: 'w1' }, sourceOf({ w1: at(worktree) }), agents)
      expect(reply).toEqual({
        kind: 'snapshot',
        snapshot: {
          ...baseline,
          currentAgent: null,
          errors: [{ file: 'agent-state', location: null, field: null, message: 'cannot be read from the host' }],
        },
      })
      expect(JSON.stringify(reply)).not.toContain('secret')
    })

    it('puts nothing but role and state of the host agent in the reply', async () => {
      const worktree = inProgressWorktree()
      const planted = {
        agent: {
          status: 'running',
          title: 'sentinel-title',
          cwd: '/sentinel/cwd',
          lastError: 'sentinel-last-error',
          pendingPermissions: ['sentinel-permission'],
          labels: { sentinel: 'label' },
        },
        project: {
          checkout: {
            worktreeRoot: worktree,
            currentBranch: 'sentinel-branch',
            cwd: '/sentinel/checkout-cwd',
            remoteUrl: 'sentinel-remote',
          },
        },
      }
      const reply = await getSnapshot({ workspaceId: 'w1' }, sourceOf({ w1: at(worktree) }), agentsOf([planted]))
      expect(JSON.stringify(reply)).not.toContain('sentinel')
      expect(reply).toMatchObject({ snapshot: { currentAgent: { role: 'dev-a', state: 'running' } } })
    })
  })

  describe('refusal', () => {
    const cases: [string, Record<string, WorkspaceReading | null | Error>][] = [
      ['the host returns no workspace', { w1: null }],
      ['the workspace has no project', { w1: {} }],
      ['the worktree root is null', { w1: at(null) }],
      ['the worktree root is absent', { w1: at(undefined) }],
      ['the worktree root is empty', { w1: at('') }],
      ['the worktree root is relative', { w1: at('relative/path') }],
      ['the worktree root does not exist', { w1: at('/nonexistent/af18-worktree') }],
      ['the host rejects the lookup', { w1: new Error('boom /secret/path') }],
    ]
    it.each(cases)('refuses with a value when %s, and reads no plan', async (_, readings) => {
      const reply = await getSnapshot({ workspaceId: 'w1' }, sourceOf(readings))
      expect(reply).toEqual(refused)
      expect(opened).toEqual([])
      expect(listed).toEqual([])
      expect(resolved.filter((path) => !path.includes('af18-worktree'))).toEqual([])
    })

    it('refuses when the host resolves undefined', async () => {
      const source: WorkspaceSource = {
        ref: () => ({ refresh: async () => undefined }),
      }
      expect(await getSnapshot({ workspaceId: 'w1' }, source)).toEqual(refused)
    })

    it('refuses when ref itself throws', async () => {
      const exploding: WorkspaceSource = {
        ref: () => {
          throw new Error('no ref')
        },
      }
      expect(await getSnapshot({ workspaceId: 'w1' }, exploding)).toEqual(refused)
    })

    it('refuses an id the host does not know', async () => {
      const reply = await getSnapshot({ workspaceId: 'other' }, sourceOf({ w1: at(root) }))
      expect(reply).toEqual(refused)
    })

    it.each([
      ['a missing id', {}],
      ['an empty id', { workspaceId: '' }],
      ['a non-string id', { workspaceId: 7 }],
      ['an over-long id', { workspaceId: 'x'.repeat(257) }],
      ['an extra key', { workspaceId: 'w1', path: '/etc' }],
      ['null', null],
    ])('refuses %s without calling the host', async (_, input) => {
      let called = false
      const source: WorkspaceSource = {
        ref: () => {
          called = true
          return { refresh: async () => null }
        },
      }
      expect(await getSnapshot(input, source)).toEqual(refused)
      expect(called).toBe(false)
      expect(listed).toEqual([])
    })

    it('accepts an id of exactly 256 characters', async () => {
      const worktree = worktreeWith('a', planWith('#1', 'todo'))
      const id = 'x'.repeat(256)
      const reply = await getSnapshot({ workspaceId: id }, sourceOf({ [id]: at(worktree) }))
      expect(reply).toMatchObject({ kind: 'snapshot' })
    })

    it('passes the workspace id to the host', async () => {
      const seen: string[] = []
      const source: WorkspaceSource = {
        ref: (id) => {
          seen.push(id)
          return { refresh: async () => null }
        },
      }
      await getSnapshot({ workspaceId: 'w-42' }, source)
      expect(seen).toEqual(['w-42'])
    })
  })
})
