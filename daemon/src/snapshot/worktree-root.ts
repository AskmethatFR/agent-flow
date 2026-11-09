import { isAbsolute } from 'node:path'
import type { ReadIo } from './read-agent-flow-file'

export type WorktreeBearing = {
  readonly project?: {
    readonly checkout: { readonly worktreeRoot?: string | null }
  } | null
}

export const worktreeRootOf = (bearing: WorktreeBearing | null | undefined): string | null => {
  const root = bearing?.project?.checkout.worktreeRoot
  return typeof root === 'string' && isAbsolute(root) ? root : null
}

export const realPathOf = (io: ReadIo, path: string): string | null => {
  try {
    return io.realpathSync(path)
  } catch {
    return null
  }
}
