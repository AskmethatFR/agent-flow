import * as fs from 'node:fs'
import { createGetSnapshot } from './get-snapshot'

export type { AgentSource } from './agent-status'
export type { SnapshotReply, WorkspaceSource } from './get-snapshot'
export type { ReadIo } from './read-agent-flow-file'
export { createGetSnapshot }

export const getSnapshot = createGetSnapshot({ io: fs, now: () => new Date() })
