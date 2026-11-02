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

const worktreeRootOf = (reading: WorkspaceReading | null | undefined): string | null => {
  const root = reading?.project?.checkout.worktreeRoot
  return typeof root === 'string' && isAbsolute(root) ? root : null
}

const realPathOf = (io: ReadIo, path: string): string | null => {
  try {
    return io.realpathSync(path)
  } catch {
    return null
  }
}

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
  async (request: unknown, workspaces: WorkspaceSource): Promise<SnapshotReply> => {
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
    return { kind: 'snapshot', snapshot: buildSnapshot({ plan }, now()) }
  }
