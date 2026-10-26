import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PluginHookAgent, PluginLifecycleEvents } from "@getpaseo/plugin/server";
import {
  registerAgentStateHooks,
  type AgentStateHookContext,
  type AgentStateHookServer,
} from "./agent-state-hooks.ts";
import type { PaseoAgent } from "./read-agent-state.ts";

function agentSnapshot(overrides: Partial<PaseoAgent> = {}): PaseoAgent {
  return {
    id: "agent-id",
    provider: "claude",
    cwd: "/work",
    model: null,
    createdAt: "2026-10-26T00:00:00.000Z",
    updatedAt: "2026-10-26T00:00:00.000Z",
    lastUserMessageAt: null,
    status: "idle",
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    },
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    title: null,
    labels: {},
    ...overrides,
  };
}

function hookAgent(id: string, overrides: Partial<PluginHookAgent> = {}): PluginHookAgent {
  return {
    id,
    workspaceId: null,
    parentAgentId: null,
    provider: "claude",
    cwd: "/work",
    title: null,
    ...overrides,
  };
}

function startHooks(refreshed: PaseoAgent | null) {
  const handlers = new Map<string, Parameters<AgentStateHookServer["on"]>[1]>();
  const unsubscribed: string[] = [];
  const requestedIds: string[] = [];
  const lines: string[] = [];
  const server: AgentStateHookServer = {
    on(name, handler) {
      handlers.set(name, handler);
      return () => {
        unsubscribed.push(name);
      };
    },
  };
  const context: AgentStateHookContext = {
    paseo: {
      agents: {
        ref(agentId) {
          requestedIds.push(agentId);
          return {
            refresh: async () => (refreshed === null ? null : { agent: refreshed, project: null }),
          };
        },
      },
    },
  };
  const cleanup = registerAgentStateHooks(server, (line) => lines.push(line));
  return {
    lines,
    requestedIds,
    unsubscribed,
    cleanup,
    registered: () => [...handlers.keys()],
    turnStarted: (agentId: string, overrides: Partial<PluginHookAgent> = {}) => {
      const event: PluginLifecycleEvents["agent.turn_started"] = {
        agent: hookAgent(agentId, overrides),
        turnId: "turn-1",
      };
      return handlers.get("agent.turn_started")?.(event, context);
    },
    turnEnded: (
      agentId: string,
      overrides: Partial<PluginHookAgent> = {},
      timeline: PluginLifecycleEvents["agent.turn_ended"]["timeline"] = [],
    ) => {
      const event: PluginLifecycleEvents["agent.turn_ended"] = {
        agent: hookAgent(agentId, overrides),
        turnId: "turn-1",
        outcome: { kind: "completed" },
        timeline,
      };
      return handlers.get("agent.turn_ended")?.(event, context);
    },
  };
}

const SENTINEL = "SENTINEL-DO-NOT-LOG";

describe("agent state hooks", () => {
  const rows = [
    { event: "agent.turn_started", id: "A", status: "running" },
    { event: "agent.turn_ended", id: "B", status: "idle" },
  ] as const;

  for (const row of rows) {
    it(`logs the SDK status of the agent on ${row.event} (${row.status})`, async () => {
      const hooks = startHooks(agentSnapshot({ id: row.id, status: row.status }));

      await (row.event === "agent.turn_started" ? hooks.turnStarted(row.id) : hooks.turnEnded(row.id));

      assert.equal(hooks.lines.length, 1);
      const logged = JSON.parse(hooks.lines[0]);
      assert.equal(logged.event, row.event);
      assert.equal(logged.agentId, row.id);
      assert.equal(logged.reading.status, row.status);
      assert.deepEqual(hooks.requestedIds, [row.id]);
    });
  }

  it("logs a null reading when the SDK knows no such agent", async () => {
    const hooks = startHooks(null);

    await hooks.turnStarted("unknown");

    assert.equal(hooks.lines.length, 1);
    const logged = JSON.parse(hooks.lines[0]);
    assert.equal(logged.agentId, "unknown");
    assert.equal(logged.reading, null);
  });

  it("projects the allowlisted fields and keeps only agent-flow labels", async () => {
    const hooks = startHooks(
      agentSnapshot({
        id: "C",
        status: "running",
        workspaceId: "ws-1",
        activeTurn: { turnId: "turn-1", startedAt: null },
        requiresAttention: true,
        attentionReason: "permission",
        labels: { "agent-flow.step": "s4", other: "x" },
      }),
    );

    await hooks.turnStarted("C");

    assert.deepEqual(JSON.parse(hooks.lines[0]).reading, {
      agentId: "C",
      status: "running",
      workspaceId: "ws-1",
      turnActive: true,
      requiresAttention: true,
      attentionReason: "permission",
      labels: { "agent-flow.step": "s4" },
    });
  });

  it("never logs titles, paths, errors, permission inputs or timeline content", async () => {
    const hooks = startHooks(
      agentSnapshot({
        id: "D",
        title: SENTINEL,
        cwd: SENTINEL,
        lastError: SENTINEL,
        pendingPermissions: [
          { id: "perm-1", provider: "claude", name: SENTINEL, kind: "tool", input: { command: SENTINEL } },
        ],
      }),
    );

    await hooks.turnStarted("D", { title: SENTINEL, cwd: SENTINEL });
    await hooks.turnEnded("D", { title: SENTINEL, cwd: SENTINEL }, [
      { type: "assistant_message", text: SENTINEL },
    ]);

    assert.equal(hooks.lines.length, 2);
    for (const line of hooks.lines) {
      assert.ok(!line.includes(SENTINEL), line);
    }
  });

  it("subscribes to exactly the two turn events and unsubscribes both on cleanup", async () => {
    const hooks = startHooks(null);

    assert.deepEqual(hooks.registered().sort(), ["agent.turn_ended", "agent.turn_started"]);
    assert.deepEqual(hooks.unsubscribed, []);

    await hooks.cleanup();

    assert.deepEqual(hooks.unsubscribed.sort(), ["agent.turn_ended", "agent.turn_started"]);
  });
});
