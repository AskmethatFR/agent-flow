import { ScrollView, Text } from 'react-native'
import { useRpc } from '@getpaseo/plugin/client'
import type { PluginWorkspacePanelProps } from '@getpaseo/plugin/client'
import { getSnapshotRpc } from '../shared/snapshot-rpc.ts'
import { PlanRail } from './plan-rail.tsx'
import { useSnapshotPolling } from './use-snapshot-polling.ts'

export const AgentFlowPanel = ({ workspaceId, theme, layout }: PluginWorkspacePanelProps) => {
  const getSnapshot = useRpc(getSnapshotRpc)
  const state = useSnapshotPolling(getSnapshot, workspaceId)
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
      contentContainerStyle={{ padding: layout.compact ? 16 : 24 }}
    >
      {state.kind === 'reply' && state.reply.kind === 'snapshot' ? (
        <PlanRail snapshot={state.reply.snapshot} />
      ) : (
        <Text style={{ color: theme.colors.foregroundMuted }}>Loading the plan…</Text>
      )}
    </ScrollView>
  )
}
