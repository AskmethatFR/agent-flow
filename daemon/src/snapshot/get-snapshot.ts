import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { buildSnapshot } from '@agent-flow/core/snapshot'
import type { Snapshot } from '@agent-flow/core/snapshot'
import { readAgentFlowFile } from './read-agent-flow-file'
import type { ReadIo } from './read-agent-flow-file'

export type WorkspaceReading = {
  readonly project?: {
    readonly checkout: { readonly worktreeRoot?: string | null }
  } | null
}

export type WorkspaceSource = {
  ref(workspaceId: string): { refresh(): Promise<WorkspaceReading | null> }
}

export type SnapshotReply =
  | { readonly kind: 'snapshot'; readonly snapshot: Snapshot }
  | { readonly kind: 'refused'; readonly reason: 'unknown-worktree' }

export type GetSnapshotDeps = { readonly io: ReadIo; readonly now: () => Date }

const input = z.strictObject({ workspaceId: z.string().min(1).max(256) })

const refused: SnapshotReply = { kind: 'refused', reason: 'unknown-worktree' }

const worktreeRootOf = async (
  workspaces: WorkspaceSource,
  workspaceId: string,
): Promise<string | null> => {
  try {
    const reading = await workspaces.ref(workspaceId).refresh()
    const root = reading?.project?.checkout.worktreeRoot
    return typeof root === 'string' && isAbsolute(root) ? root : null
  } catch {
    return null
  }
}

const realPathOf = (io: ReadIo, path: string): string | null => {
  try {
    return io.realpathSync(path)
  } catch {
    return null
  }
}

export const createGetSnapshot =
  ({ io, now }: GetSnapshotDeps) =>
  async (request: unknown, workspaces: WorkspaceSource): Promise<SnapshotReply> => {
    const parsed = input.safeParse(request)
    if (!parsed.success) return refused
    const worktreeRoot = await worktreeRootOf(workspaces, parsed.data.workspaceId)
    if (worktreeRoot === null) return refused
    const realWorktree = realPathOf(io, worktreeRoot)
    if (realWorktree === null) return refused
    const plan = readAgentFlowFile(io, realWorktree, 'plan.json')
    return { kind: 'snapshot', snapshot: buildSnapshot({ plan }, now()) }
  }
