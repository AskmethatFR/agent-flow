import type { AgentStatusUnavailable } from '@agent-flow/core/snapshot'
import type { ReadIo } from './read-agent-flow-file'
import { realPathOf, worktreeRootOf } from './worktree-root'
import type { WorktreeBearing } from './worktree-root'

export type AgentListOptions = {
  sort: { key: 'updated_at'; direction: 'desc' }[]
  page: { limit: number }
}

export type AgentEntry = {
  readonly agent: { readonly status?: string | null }
  readonly project?: WorktreeBearing['project']
}

export type AgentSource = {
  list(options: AgentListOptions): Promise<{ readonly entries: readonly AgentEntry[] }>
}

const AGENT_PAGE_LIMIT = 100

const hostError: AgentStatusUnavailable = { unavailable: 'host-error' }

const listOptions = (): AgentListOptions => ({
  sort: [{ key: 'updated_at', direction: 'desc' }],
  page: { limit: AGENT_PAGE_LIMIT },
})

const firstStatusOnWorktree = (
  entries: readonly AgentEntry[],
  io: ReadIo,
  realWorktree: string,
): string | undefined => {
  for (const entry of entries) {
    const root = worktreeRootOf(entry)
    if (root !== null && realPathOf(io, root) === realWorktree) {
      const { status } = entry.agent
      return typeof status === 'string' ? status : undefined
    }
  }
  return undefined
}

export const agentStatusOf = async (
  agents: AgentSource,
  io: ReadIo,
  realWorktree: string,
): Promise<string | AgentStatusUnavailable | undefined> => {
  try {
    const { entries } = await agents.list(listOptions())
    return firstStatusOnWorktree(entries, io, realWorktree)
  } catch {
    return hostError
  }
}
