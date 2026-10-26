import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerAgentStateHooks } from "./server/agent-state-hooks.ts";

export default function contribute(server: PluginServerContext) {
  return registerAgentStateHooks(server, console.log);
}
