import * as fs from 'node:fs'
import { createGetSnapshot } from './get-snapshot'

export type { SnapshotReply, WorkspaceSource } from './get-snapshot'

export const getSnapshot = createGetSnapshot({ io: fs, now: () => new Date() })
