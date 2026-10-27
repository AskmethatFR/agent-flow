import { randomUUID } from "node:crypto";
import type { PluginCleanup } from "@getpaseo/plugin";
import type {
  PluginHookAgent,
  PluginHookContext,
  PluginLifecycleEvents,
} from "@getpaseo/plugin/server";
import { readAgentState } from "./read-agent-state.ts";

type PaseoAgentActions = PluginHookContext["paseo"]["agents"];
type PaseoAgentHandle = ReturnType<PaseoAgentActions["ref"]>;

export type AgentMessageSource = {
  ref(agentId: string): Pick<PaseoAgentHandle, "refresh" | "send">;
};

export type AgentMessageEvent = {
  agent: Pick<PluginHookAgent, "id">;
  timeline: PluginLifecycleEvents["agent.turn_ended"]["timeline"];
};

export type AgentMessageHookContext = { paseo: { agents: AgentMessageSource } };

export type AgentMessageHookServer = {
  on(
    name: "agent.turn_ended",
    handler: (event: AgentMessageEvent, context: AgentMessageHookContext) => Promise<void>,
  ): () => void;
};

export const PING_TEXT = "ping from agent-flow";
const TARGET_LABEL = "agent-flow.message-target";
const TARGET_VALUE = "27";

function holdsPing(timeline: AgentMessageEvent["timeline"], messageId: string): boolean {
  return timeline.some(
    (item) => item.type === "user_message" && item.text === PING_TEXT && item.clientMessageId === messageId,
  );
}

export function registerAgentMessageHooks(
  server: AgentMessageHookServer,
  log: (line: string) => void,
): PluginCleanup {
  const logLine = (fields: Record<string, unknown>) =>
    log(JSON.stringify({ source: "agent-flow-spike", ...fields }));
  let ping: { agentId: string; messageId: string } | null = null;

  return server.on("agent.turn_ended", async (event, context) => {
    const agentId = event.agent.id;
    if (ping !== null) {
      if (agentId === ping.agentId) {
        logLine({ event: "message.received", agentId, received: holdsPing(event.timeline, ping.messageId) });
      }
      return;
    }
    const reading = await readAgentState(context.paseo.agents, agentId);
    if (ping !== null || reading?.labels[TARGET_LABEL] !== TARGET_VALUE) {
      return;
    }
    ping = { agentId, messageId: randomUUID() };
    const outcome = await context.paseo.agents
      .ref(agentId)
      .send(PING_TEXT, { activeTurnBehavior: "steer", messageId: ping.messageId })
      .then(
        () => "accepted",
        () => "rejected",
      );
    logLine({ event: "message.sent", agentId, outcome });
  });
}
