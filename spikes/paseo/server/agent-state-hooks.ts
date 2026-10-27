import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginHookAgent } from "@getpaseo/plugin/server";
import { readAgentState, type AgentRefSource } from "./read-agent-state.ts";

export type AgentStateEventName = "agent.turn_started" | "agent.turn_ended";

export type AgentStateEvent = { agent: Pick<PluginHookAgent, "id"> };

export type AgentStateHookContext = { paseo: { agents: AgentRefSource } };

export type AgentStateHookServer = {
  on(
    name: AgentStateEventName,
    handler: (event: AgentStateEvent, context: AgentStateHookContext) => Promise<void>,
  ): () => void;
};

export function registerAgentStateHooks(
  server: AgentStateHookServer,
  log: (line: string) => void,
): PluginCleanup {
  const eventNames: AgentStateEventName[] = ["agent.turn_started", "agent.turn_ended"];
  const unsubscribers = eventNames.map((event) =>
    server.on(event, async (payload, context) => {
      const reading = await readAgentState(context.paseo.agents, payload.agent.id).catch(() => null);
      if (reading === null) {
        return;
      }
      const { status, turnActive, attentionReason } = reading;
      log(
        JSON.stringify({
          source: "agent-flow-spike",
          event,
          agentId: payload.agent.id,
          status,
          turnActive,
          attentionReason,
        }),
      );
    }),
  );
  return () => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  };
}
