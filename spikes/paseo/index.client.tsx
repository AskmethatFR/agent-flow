import type { PluginClientContext } from "@getpaseo/plugin/client";
import { AgentFlowPanel } from "./client/agent-flow-panel";

const PANEL_ID = "agent-flow";
const PANEL_ICON = "PanelsTopLeft";

export default function contribute(client: PluginClientContext) {
  const removePanel = client.addWorkspacePanel({
    id: PANEL_ID,
    title: "Agent Flow",
    icon: PANEL_ICON,
    context: "workspace",
    Component: AgentFlowPanel,
  });
  const removeCommand = client.addCommandCenterItem({
    id: "open-agent-flow",
    title: "Open Agent Flow",
    icon: PANEL_ICON,
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel(PANEL_ID);
    },
  });
  return async () => {
    await Promise.all([removePanel(), removeCommand()]);
  };
}
