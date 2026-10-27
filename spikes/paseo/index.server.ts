import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerAgentMessageHooks } from "./server/agent-message-hooks.ts";

export default function contribute(server: PluginServerContext) {
  return registerAgentMessageHooks(server, console.log);
}
