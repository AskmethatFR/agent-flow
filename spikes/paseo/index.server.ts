import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerAgentMessageHooks } from "./server/agent-message-hooks.ts";
import { registerAgentStateHooks } from "./server/agent-state-hooks.ts";

export default function contribute(server: PluginServerContext) {
  const cleanups = [
    registerAgentStateHooks(server, console.log),
    registerAgentMessageHooks(server, console.log),
  ];
  return async () => {
    for (const cleanup of cleanups) {
      await cleanup();
    }
  };
}
