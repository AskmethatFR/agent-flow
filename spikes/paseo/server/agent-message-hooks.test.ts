import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PluginHookAgent, PluginLifecycleEvents } from "@getpaseo/plugin/server";
import {
  PING_TEXT,
  registerAgentMessageHooks,
  type AgentMessageHookContext,
  type AgentMessageHookServer,
} from "./agent-message-hooks.ts";
import type { PaseoAgent } from "./read-agent-state.ts";

type Timeline = PluginLifecycleEvents["agent.turn_ended"]["timeline"];
type SendOptions = Parameters<ReturnType<AgentMessageHookContext["paseo"]["agents"]["ref"]>["send"]>[1];
type SentMessage = { agentId: string; text: string; options: SendOptions };

const TARGET_LABELS = { "agent-flow.message-target": "27" };
const SENTINEL = "SENTINEL-DO-NOT-LOG";

function agentSnapshot(id: string, labels: Record<string, string>): PaseoAgent {
  return {
    id,
    provider: "claude",
    cwd: "/work",
    model: null,
    createdAt: "2026-10-27T00:00:00.000Z",
    updatedAt: "2026-10-27T00:00:00.000Z",
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
    labels,
  };
}

function hookAgent(id: string): PluginHookAgent {
  return { id, workspaceId: null, parentAgentId: null, provider: "claude", cwd: "/work", title: null };
}

function startHooks(
  agents: Record<string, PaseoAgent | null | Error>,
  send: () => Promise<void> = async () => {},
) {
  const handlers = new Map<string, Parameters<AgentMessageHookServer["on"]>[1]>();
  const unsubscribed: string[] = [];
  const lines: string[] = [];
  const sent: SentMessage[] = [];
  const server: AgentMessageHookServer = {
    on(name, handler) {
      handlers.set(name, handler);
      return () => {
        unsubscribed.push(name);
      };
    },
  };
  const context: AgentMessageHookContext = {
    paseo: {
      agents: {
        ref(agentId) {
          return {
            refresh: async () => {
              const agent = agents[agentId] ?? null;
              if (agent instanceof Error) {
                throw agent;
              }
              return agent === null ? null : { agent, project: null };
            },
            send: (text, options) => {
              sent.push({ agentId, text, options });
              return send();
            },
          };
        },
      },
    },
  };
  const cleanup = registerAgentMessageHooks(server, (line) => lines.push(line));
  return {
    lines,
    sent,
    unsubscribed,
    cleanup,
    registered: () => [...handlers.keys()],
    logged: () => lines.map((line) => JSON.parse(line)),
    turnEnded: async (agentId: string, timeline: Timeline = []) => {
      const event: PluginLifecycleEvents["agent.turn_ended"] = {
        agent: hookAgent(agentId),
        turnId: "turn-1",
        outcome: { kind: "completed" },
        timeline,
      };
      await handlers.get("agent.turn_ended")?.(event, context);
    },
  };
}

describe("agent message hooks", () => {
  it("steers the ping once into the labelled agent and logs it as accepted", async () => {
    const hooks = startHooks({ T: agentSnapshot("T", TARGET_LABELS) });

    await hooks.turnEnded("T");

    assert.equal(hooks.sent.length, 1);
    const [message] = hooks.sent;
    assert.equal(message.agentId, "T");
    assert.equal(message.text, PING_TEXT);
    assert.equal(message.options?.activeTurnBehavior, "steer");
    assert.equal(typeof message.options?.messageId, "string");
    assert.notEqual(message.options?.messageId, "");
    assert.deepEqual(hooks.logged(), [
      { source: "agent-flow-spike", event: "message.sent", agentId: "T", outcome: "accepted" },
    ]);
  });

  it("gives each plugin process its own message id", async () => {
    const first = startHooks({ T: agentSnapshot("T", TARGET_LABELS) });
    const second = startHooks({ T: agentSnapshot("T", TARGET_LABELS) });

    await first.turnEnded("T");
    await second.turnEnded("T");

    assert.notEqual(first.sent[0].options?.messageId, second.sent[0].options?.messageId);
  });

  const notTargetRows = [
    { name: "an unlabelled agent", agent: agentSnapshot("U", {}) },
    { name: "an agent labelled for another ticket", agent: agentSnapshot("U", { "agent-flow.message-target": "26" }) },
    { name: "an agent the SDK cannot read", agent: null },
    { name: "an agent whose read fails", agent: new Error(SENTINEL) },
  ];

  for (const row of notTargetRows) {
    it(`does not message ${row.name}`, async () => {
      const hooks = startHooks({ U: row.agent });

      await hooks.turnEnded("U");

      assert.deepEqual(hooks.sent, []);
      assert.deepEqual(hooks.lines, []);
    });
  }
  type Hooks = ReturnType<typeof startHooks>;
  const secondTurnRows: { name: string; drive: (hooks: Hooks) => Promise<unknown> }[] = [
    {
      name: "a later turn of the same agent",
      drive: async (hooks) => {
        await hooks.turnEnded("T");
        await hooks.turnEnded("T");
      },
    },
    {
      name: "a later turn of another labelled agent",
      drive: async (hooks) => {
        await hooks.turnEnded("T");
        await hooks.turnEnded("V");
      },
    },
    {
      name: "two labelled turns ending together",
      drive: (hooks) => Promise.all([hooks.turnEnded("T"), hooks.turnEnded("V")]),
    },
  ];

  for (const row of secondTurnRows) {
    it(`sends at most once per plugin process: ${row.name}`, async () => {
      const hooks = startHooks({
        T: agentSnapshot("T", TARGET_LABELS),
        V: agentSnapshot("V", TARGET_LABELS),
      });

      await row.drive(hooks);

      assert.equal(hooks.sent.length, 1);
    });
  }
  it("logs a rejected send as a closed outcome and never the daemon error text", async () => {
    const hooks = startHooks({ T: agentSnapshot("T", TARGET_LABELS) }, async () => {
      throw new Error(SENTINEL);
    });

    await hooks.turnEnded("T");

    assert.deepEqual(hooks.logged(), [
      { source: "agent-flow-spike", event: "message.sent", agentId: "T", outcome: "rejected" },
    ]);
    for (const line of hooks.lines) {
      assert.ok(!line.includes(SENTINEL), line);
    }
  });
  it("logs the ping as received when the target timeline holds it with the sent message id", async () => {
    const hooks = startHooks({ T: agentSnapshot("T", TARGET_LABELS) });
    await hooks.turnEnded("T");
    const messageId = hooks.sent[0].options?.messageId;

    await hooks.turnEnded("T", [
      { type: "user_message", text: SENTINEL },
      { type: "user_message", text: PING_TEXT, clientMessageId: messageId },
      { type: "assistant_message", text: SENTINEL },
    ]);

    assert.deepEqual(hooks.logged()[1], {
      source: "agent-flow-spike",
      event: "message.received",
      agentId: "T",
      received: true,
    });
    assert.equal(hooks.lines.length, 2);
    assert.ok(!hooks.lines[1].includes(SENTINEL), hooks.lines[1]);
  });
  const notReceivedRows: { name: string; timeline: (messageId: string | undefined) => Timeline }[] = [
    { name: "no user message", timeline: () => [{ type: "assistant_message", text: SENTINEL }] },
    {
      name: "the ping under another message id",
      timeline: () => [{ type: "user_message", text: PING_TEXT, clientMessageId: "another-id" }],
    },
    {
      name: "another text under the sent message id",
      timeline: (messageId) => [{ type: "user_message", text: SENTINEL, clientMessageId: messageId }],
    },
    {
      name: "the ping as an assistant message",
      timeline: (messageId) => [{ type: "assistant_message", text: PING_TEXT, clientMessageId: messageId }],
    },
  ];

  for (const row of notReceivedRows) {
    it(`logs the ping as not received when the target timeline holds ${row.name}`, async () => {
      const hooks = startHooks({ T: agentSnapshot("T", TARGET_LABELS) });
      await hooks.turnEnded("T");

      await hooks.turnEnded("T", row.timeline(hooks.sent[0].options?.messageId));

      assert.deepEqual(hooks.logged()[1], {
        source: "agent-flow-spike",
        event: "message.received",
        agentId: "T",
        received: false,
      });
      assert.ok(!hooks.lines[1].includes(SENTINEL), hooks.lines[1]);
    });
  }
  it("ignores the turns of other agents after the send", async () => {
    const hooks = startHooks({ T: agentSnapshot("T", TARGET_LABELS), O: agentSnapshot("O", {}) });
    await hooks.turnEnded("T");
    const messageId = hooks.sent[0].options?.messageId;

    await hooks.turnEnded("O", [{ type: "user_message", text: PING_TEXT, clientMessageId: messageId }]);

    assert.equal(hooks.lines.length, 1);
  });

  it("subscribes to agent.turn_ended only and unsubscribes it on cleanup", async () => {
    const hooks = startHooks({});

    assert.deepEqual(hooks.registered(), ["agent.turn_ended"]);
    assert.deepEqual(hooks.unsubscribed, []);

    await hooks.cleanup();

    assert.deepEqual(hooks.unsubscribed, ["agent.turn_ended"]);
  });
});
