import type { PluginServerContext } from '@getpaseo/plugin/server'
import { getSnapshot } from '@agent-flow/daemon/snapshot'
import { getSnapshotRpc } from '../shared/snapshot-rpc.ts'

export const registerSnapshot = (server: PluginServerContext): void => {
  server.handle(getSnapshotRpc, (input, context) => getSnapshot(input, context.paseo.workspaces))
}
