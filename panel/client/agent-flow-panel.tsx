import { ScrollView, Text } from 'react-native'
import { useRpc } from '@getpaseo/plugin/client'
import type { PluginWorkspacePanelProps } from '@getpaseo/plugin/client'
import { getSnapshotRpc } from '../shared/snapshot-rpc.ts'
import { PlanRail } from './plan-rail.tsx'
import { useSnapshotPolling } from './use-snapshot-polling.ts'
import type { PanelState } from './use-snapshot-polling.ts'

const NOTICE: Record<'loading' | 'refused' | 'unreachable', string> = {
  loading: 'Loading the plan…',
  refused: 'Agent Flow cannot read this workspace.',
  unreachable: 'The Agent Flow server did not answer. Retrying.',
}

const Body = ({ state, theme }: { state: PanelState; theme: PluginWorkspacePanelProps['theme'] }) => {
  if (state.kind === 'reply' && state.reply.kind === 'snapshot') {
    return (
      <PlanRail
        snapshot={state.reply.snapshot}
        textColor={theme.colors.foreground}
        errorColor={theme.colors.statusDanger}
        accentColor={theme.colors.accent}
      />
    )
  }
  const notice = state.kind === 'reply' ? 'refused' : state.kind
  return <Text style={{ color: theme.colors.foregroundMuted }}>{NOTICE[notice]}</Text>
}

export const AgentFlowPanel = ({ workspaceId, theme, layout }: PluginWorkspacePanelProps) => {
  const getSnapshot = useRpc(getSnapshotRpc)
  const state = useSnapshotPolling(getSnapshot, workspaceId)
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
      contentContainerStyle={{ padding: layout.compact ? 16 : 24 }}
    >
      <Body state={state} theme={theme} />
    </ScrollView>
  )
}
