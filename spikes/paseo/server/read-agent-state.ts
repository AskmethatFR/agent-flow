import type { PluginHookContext } from "@getpaseo/plugin/server";

type PaseoAgentActions = PluginHookContext["paseo"]["agents"];
type PaseoAgentHandle = ReturnType<PaseoAgentActions["ref"]>;

export type PaseoAgent = NonNullable<Awaited<ReturnType<PaseoAgentHandle["refresh"]>>>["agent"];

export type AgentRefSource = {
  ref(agentId: string): Pick<PaseoAgentHandle, "refresh">;
};

export type AgentStateReading = {
  agentId: string;
  status: PaseoAgent["status"];
  workspaceId: string | null;
  turnActive: boolean;
  requiresAttention: boolean;
  attentionReason: "finished" | "error" | "permission" | null;
  labels: Record<string, string>;
};

const LABEL_PREFIX = "agent-flow.";

function agentFlowLabels(labels: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(labels).filter(([key]) => key.startsWith(LABEL_PREFIX)));
}

export async function readAgentState(
  agents: AgentRefSource,
  agentId: string,
): Promise<AgentStateReading | null> {
  const refreshed = await agents.ref(agentId).refresh();
  if (refreshed === null) {
    return null;
  }
  const { agent } = refreshed;
  return {
    agentId: agent.id,
    status: agent.status,
    workspaceId: agent.workspaceId ?? null,
    turnActive: agent.activeTurn != null,
    requiresAttention: agent.requiresAttention ?? false,
    attentionReason: agent.attentionReason ?? null,
    labels: agentFlowLabels(agent.labels),
  };
}
