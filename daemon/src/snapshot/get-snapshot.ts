import { z } from 'zod'
import { buildSnapshot } from '@agent-flow/core/snapshot'
import type { Snapshot } from '@agent-flow/core/snapshot'
import { agentStatusOf } from './agent-status'
import type { AgentSource } from './agent-status'
import { readAgentFlowFile } from './read-agent-flow-file'
import type { ReadIo } from './read-agent-flow-file'
import { realPathOf, worktreeRootOf } from './worktree-root'
import type { WorktreeBearing } from './worktree-root'

export type WorkspaceReading = WorktreeBearing

export type WorkspaceSource = {
  ref(workspaceId: string): { refresh(): Promise<WorkspaceReading | null | undefined> }
}

export type SnapshotReply =
  | { readonly kind: 'snapshot'; readonly snapshot: Snapshot }
  | { readonly kind: 'refused'; readonly reason: 'unknown-worktree' }

export type GetSnapshotDeps = { readonly io: ReadIo; readonly now: () => Date }

const input = z.strictObject({ workspaceId: z.string().min(1).max(256) })

const refused: SnapshotReply = { kind: 'refused', reason: 'unknown-worktree' }

type Lookup = { readonly reading: WorkspaceReading | null | undefined }

const lookupOf = async (
  workspaces: WorkspaceSource,
  workspaceId: string,
): Promise<Lookup | null> => {
  try {
    return { reading: await workspaces.ref(workspaceId).refresh() }
  } catch {
    return null
  }
}

export const createGetSnapshot =
  ({ io, now }: GetSnapshotDeps) =>
  async (
    request: unknown,
    workspaces: WorkspaceSource,
    agents: AgentSource,
  ): Promise<SnapshotReply> => {
    const parsed = input.safeParse(request)
    if (!parsed.success) return refused
    const { workspaceId } = parsed.data
    const found = await lookupOf(workspaces, workspaceId)
    if (found === null) return refused
    const worktreeRoot = worktreeRootOf(found.reading)
    if (worktreeRoot === null) return refused
    const realWorktree = realPathOf(io, worktreeRoot)
    if (realWorktree === null) return refused
    const plan = readAgentFlowFile(io, realWorktree, 'plan.json')
    const decisions = readAgentFlowFile(io, realWorktree, 'decisions.jsonl')
    const agentStatus = await agentStatusOf(agents, io, realWorktree)
    return { kind: 'snapshot', snapshot: buildSnapshot({ plan, decisions }, now(), agentStatus) }
  }
