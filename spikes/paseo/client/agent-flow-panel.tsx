import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { Text, View } from "react-native";

export function AgentFlowPanel({ theme, layout }: PluginWorkspacePanelProps) {
  return (
    <View style={{ flex: 1, padding: layout.compact ? 16 : 24, backgroundColor: theme.colors.surface0 }}>
      <Text style={{ color: theme.colors.foregroundMuted }}>Agent Flow (spike #10): empty panel</Text>
    </View>
  );
}
