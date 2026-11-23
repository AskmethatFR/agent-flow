import { execFile } from 'node:child_process'
import * as fs from 'node:fs'
import { createGhRunner, resolveGh } from './ci-status'
import { createGetSnapshot } from './get-snapshot'

export type { AgentSource } from './agent-status'
export type { CiStatusRead, CiStatusSource, ExecFile } from './ci-status'
export type { SnapshotReply, WorkspaceSource } from './get-snapshot'
export type { ReadIo } from './read-agent-flow-file'
export { createGetSnapshot, createGhRunner }

export const getSnapshot = createGetSnapshot({
  io: fs,
  now: () => new Date(),
  ciStatus: createGhRunner(execFile, resolveGh(process.env)),
})
