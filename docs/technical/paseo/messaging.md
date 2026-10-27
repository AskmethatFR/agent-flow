---
id: "paseo-messaging"
type: "technical"
owner: "architect"
status: "draft"
updated: "2026-10-27"
links:
  - "paseo-api-version"
  - "paseo-agent-state"
  - "host-adapter-boundary"
answers:
  - "Can the Paseo daemon deliver a message to a running agent through the SDK, and with which call (Q2)?"
  - "How does a blocked agent wait for its answer: stop and poll responses.jsonl, or a Paseo-native mechanism (Q4)?"
  - "Which permissions does a Paseo plugin need to message an agent?"
decided_in:
  - "#27"
---

# Messaging a running agent through the Paseo SDK

> **One-liner**: the SDK call a Paseo plugin's server entry uses to deliver a message to an agent, how a blocked agent waits for its answer, and the permissions and side effects of that call.
> **Links**: [[paseo-api-version]] (plugin layout and trust model), [[paseo-agent-state]] (the read side, reach and log persistence), [[host-adapter-boundary]] (capability "Message delivery", points 1-5). Scenario file: `features/phase-0/host-agent-message.feature` (S1, `@manual`).
> **State of this record**: SDK call, permissions and verdict rule written; Evidence and Verdict **pending live capture**.

## Context

Spike #27 answers two questions from `docs/plan.md`: can the daemon deliver a message to a running agent through the Paseo SDK (Q2), and how does a blocked agent wait for its answer (Q4). [[host-adapter-boundary]] left the Paseo cell of "Message delivery" provisional until this record; the floor (`responses.jsonl`, written only through the host's human-answer path) applies whatever this record says.

The throwaway proof gives the `agent-flow-spike` plugin a server registration, `spikes/paseo/server/agent-message-hooks.ts`, wired in `spikes/paseo/index.server.ts`. **The #27 build registers the message hooks only**: the #26 state hooks stay in the repository but are not installed, because they write a reading line for every agent of every project into `~/.paseo/daemon.log` (ruled for #27; Security wins the tie with the original plan of keeping both). The target's status is therefore cross-checked with `paseo inspect` only. On `agent.turn_ended` the hook reads the agent with `readAgentState` ([[paseo-agent-state]]); a failed read counts as "not a target" (no send, no line). If the agent carries the label `agent-flow.message-target=27` and nothing was sent yet in this plugin process, it calls `agents.ref(id).send("ping from agent-flow", { activeTurnBehavior: "steer", messageId })` once and logs `message.sent`. On each later `agent.turn_ended` of that same agent it looks in the event `timeline` for a `user_message` with that `clientMessageId` and that exact text, and logs `message.received`.

Labels in this record (same set as [[paseo-agent-state]]):
- **typed**: read in the 0.11.4 typings.
- **observed**: seen on the local daemon.
- **doc-sourced**: taken from the daemon, client or protocol source, not exercised.
- **not exercised**: would need a model run.
- **decided**: decided in this record, with its reason stated.

`@getpaseo/protocol` ships `dist/*.js` only in `spikes/paseo/node_modules` (no `.d.ts`), and `tsconfig.json` sets `skipLibCheck`. Types the SDK takes from the protocol (`ActiveTurnBehavior`, `AgentTimelineItem`) therefore resolve to `any`, and `npm run typecheck` does not check them. Protocol facts are labelled doc-sourced with their `messages.js` line, never typed.

Automated proof: `spikes/paseo/server/agent-message-hooks.test.ts` (`node:test`, run with `npm test` in `spikes/paseo/`) drives the registration with a fake `on` and a fake `agents` port. It proves the targeting, the single send, the closed outcome on rejection, the receipt match and the log allowlist; it does not prove the live daemon.

Host anchors are doc-sourced from the host's `@getpaseo/server` 0.11.4 package, relative to `dist/server/server/` (same layout as [[paseo-agent-state]]), plus `agent/agent-prompt.js`. Client anchors are relative to `@getpaseo/client/dist/`.

## SDK call (Q2, AC1)

| Call / fact | Where | Behavior | Label |
|---|---|---|---|
| `context.paseo.agents.ref(id).send(text, options?)` | `PaseoAgentHandle` (`index.d.ts:282`) | `Promise<void>`; resolves when the daemon accepts the message | typed |
| `options` = `SendMessageOptions` | `index.d.ts:196`, `daemon-client.d.ts:149-158` | `messageId?`, `activeTurnBehavior?`, `images?`, `attachments?`; a random `messageId` is generated when omitted (`daemon-client.js:2111`) | typed + doc-sourced |
| `activeTurnBehavior` | `messages.js:975` | `"interrupt"` or `"steer"`; omitted = `"interrupt"` (`daemon-client.d.ts:151`, `session.js:6172`) | doc-sourced |
| Ack | `session.js:6176-6177`, `:6194-6201`; `agent-prompt.js:144` | when a new turn starts, the daemon waits for the run to start (up to 60 s), then answers `accepted: true` | doc-sourced |
| Rejection | `session.js:6208-6214`; `daemon-client.js:2136-2137` | `accepted: false` with a friendly error text; the client throws `Error(<that text>)` | doc-sourced |
| Idle agent | `agent-prompt.js:20-25`; `agent-manager.js:1835-1840` | steer finds no active turn and falls through to a new turn | doc-sourced |
| Mid-turn agent | `agent-prompt.js:4-19` | steered into the running turn if the provider supports it, otherwise the turn is replaced (`replaceRunning: true`, `agent-prompt.js:203`) | doc-sourced; not exercised |
| Receipt | `agent-prompt.js:199-201`; `agent-manager.js:1532-1533`, `:3324-3337`, `:3564-3565` | the prompt is stored as a timeline item `{ type: "user_message", text, clientMessageId: <messageId> }` (`messages.js:498-504`), and the next `agent.turn_ended` hands the plugin that timeline | doc-sourced |
| Delivery receipt | `message-receipts/index.js:19`, `:31-47`; `websocket-server.js:342` | each send is keyed by (agentId, messageId) and recorded as a file under `~/.paseo/agent-requests/` (`pending`, then `completed`), kept for good: it outlives `paseo plugin remove`. Same key and same request after completion: resolves without sending again. Same key, different request: rejected with `agent_request_key_conflict`. A receipt left `pending` (daemon crash mid-send): every retry is rejected with `agent_request_outcome_unknown` | doc-sourced |
| `handle.run()` / `waitForFinish()` / `respondToPermission()` | `index.d.ts:283-287` | send-and-wait, wait, answer a pending permission | doc-sourced alternatives, not used |

**Decided: steer, never the default.** The default `interrupt` kills in-flight work; Paseo's own system notifications use `steer` (`agent-prompt.js:298`).

**Decided: the target is an idle agent between turns.** A blocked agent in Phase 4 writes its request and stops (`docs/plan.md:127`), so the agent that receives an answer is idle. Mid-turn delivery stays doc-sourced.

## How a blocked agent waits (Q4, AC2)

**Verdict rule, fixed before the live run:**

| Outcome | Condition |
|---|---|
| **Belief holds** | the live plugin log shows `message.sent` with `outcome: "accepted"` AND `message.received` with `received: true` for the target agent id |
| **Kill** | `send` is rejected for a reason the SDK cannot avoid (permission, unsupported). The answer path is then: the blocked agent **stops and polls `responses.jsonl`** |
| **Inconclusive** | anything else; the record states what blocks |

**Recommendation if the belief holds:**

1. The blocked agent writes its request to `requests.jsonl` and **ends its turn**: no polling loop, no sleep.
2. The host's human-answer path appends the answer to `responses.jsonl` (the floor, unchanged, #24 schema).
3. The Paseo adapter then sends a fixed, content-free wake: `send("agent-flow: a response to request <id> is available; read it from responses.jsonl", { activeTurnBehavior: "steer", messageId: <request id> })`. The answer itself is never in the message.
4. The resumed agent re-reads `responses.jsonl` and acts only on its entry there, read under the provenance rule of [[host-adapter-boundary]]. **The message wakes the agent; the file decides.**

Why content-free: the daemon treats a plugin send like a human-typed message, so it reaches the model as a `user_message` that cannot be told apart from a human prompt (`session.js:2825-2827`). Any same-user client with `workspace.write`, and any agent on the shared daemon that can reach Paseo's send surface, can send the blocked agent text of its own. If the answer travelled in the message, forged text could pass for an answer or an approval. With a content-free wake, a forged wake only causes a re-read of the file.

A wake can be lost without harm to the answer. The request id is predictable (it is in `requests.jsonl`, which the agent writes), and the delivery receipt is keyed by (agentId, messageId) for good (§ SDK call). A prior send under the same id with other text makes the real wake fail with `agent_request_key_conflict`, and a daemon crash mid-send makes every retry fail with `agent_request_outcome_unknown`. Either way the answer is still in `responses.jsonl`; the agent picks it up on its next wake or poll.

## Permissions to message an agent (AC3)

| Aspect | Value |
|---|---|
| Manifest permission field | None ([[paseo-api-version]] § Permissions) |
| Daemon permission needed to send | `send_agent_message_request` needs `workspace.write` or `hub.execute` (`authorization/operation-permissions.js:164`) |
| Daemon permission needed to read the target | `refresh()` (`fetch_agent_request`) needs `workspace.read` or `hub.execute` (`authorization/operation-permissions.js:75`, [[paseo-agent-state]] § Permissions) |
| What the plugin holds | The plugin session is admitted as `owner` with all 9 daemon permissions ([[paseo-agent-state]] § Permissions), so no grant is requested and none can be narrowed |
| Trust gate | The daemon's `pluginsEnabled` switch plus an explicit `paseo plugin install` |
| Reach | Any non-internal agent on the daemon, all projects ([[paseo-agent-state]] § Permissions, Reach). The spike scopes itself by label and sends at most once per plugin process |
| Least privilege here | `on`, `agents.ref().refresh()`, `agents.ref().send()` only |

Side effects every send carries (doc-sourced):

- **Pending permissions are denied, as if the human refused.** The daemon sends with `clearPendingPermissions: true` (`session.js:6173`, `:2825-2827`), and the providers answer every pending tool permission with a deny on the human's behalf (`agent/providers/claude/agent.js:1877-1878`, `denyPendingPermissionsSupersededBySteer`; `agent/providers/omp/agent.js:656-661`, `behavior: "deny"`, "The user sent a message instead of approving.").
- **An archived agent is unarchived** (`agent-prompt.js:170-180`).
- **The default interrupts a running turn** (`session.js:6172`); hence `steer`.
- **The text can become the agent's title.** An agent with no title and no earlier user message gets a provisional title built from the message text (`session.js:6136-6139`).
- **A receipt file is kept for good.** Each (agentId, messageId) leaves a file under `~/.paseo/agent-requests/` that outlives `paseo plugin remove` (`message-receipts/index.js:19`, `:45-47`).
- **The text can reach the daemon log.** The daemon trace-logs the first 80 characters of the message (`session.js:6159-6164`) and the full stream event (`agent-manager.js:3555-3561`). With trace logging on, the message text may reach `~/.paseo/daemon.log`.

The spike's own log lines carry only `{ source, event: "message.sent", agentId, outcome: "accepted" | "rejected" }` and `{ source, event: "message.received", agentId, received }`. On the send path, never the text, the rejection error text, timeline items or the reading. A failed read of the agent is caught and treated as "not a target": no line, no send, and nothing reaches the host's `Lifecycle hook … failed` error log (`plugins/lifecycle/index.js:162-163`). The unit test pins this with a sentinel string as the read error, the rejection message and as timeline text.

## Host-adapter boundary points 4 and 5

- **Point 4.** Delivery addresses one agent id. When several agents map to one worktree, choosing the recipient depends on #21's tie rule ([[paseo-agent-state]] § AC4); delivery itself does not.
- **Point 5.** The send carries only `text` and `messageId`: never `images`, `attachments` or anything else from the worktree.

## Live capture procedure (planned)

Run by the orchestrator on the shared daemon; each install, run and remove is a separate human approval; no lane runs it.

0. Pre-check: list the agents carrying the label `agent-flow.message-target=27`, active and archived. Proceed only if there are none. Labels can be set on any existing agent by any client with `workspace.write` (`update_agent_request`, `authorization/operation-permissions.js:185`), and the first labelled agent to end a turn after install gets the single send.
1. `paseo plugin install "<worktree>/spikes/paseo" --json`, before launching the target, or its first turn end is missed. This build registers the message hooks only; the #26 state hooks are not installed.
2. `paseo run --background --label agent-flow.message-target=27 "Reply with the single word OK."` (one small model run). Paseo may steer a finish notification into the orchestrator; that is expected noise.
3. `paseo plugin logs agent-flow-spike`, waiting for, in order: `message.sent` with `outcome: "accepted"` for the target id, then `message.received` with `received: true`. Post-check: the `message.sent` agentId MUST equal the id printed by `paseo run`. On a mismatch, remove the plugin at once and record the miss.
4. Cross-check: `paseo inspect <target> --json` status (the only status source, since the state hooks are not installed), and the target's activity showing a user message equal to "ping from agent-flow" (recorded as match yes/no only).
5. Archive or kill the target; `paseo plugin remove agent-flow-spike`; `paseo plugin ls --json` shows it absent. The daemon is not restarted.

Redaction rule: quote from `paseo plugin logs agent-flow-spike` only the spike's `message.sent` / `message.received` lines and the `[paseo] Loading plugin` / `Plugin ready` lines, with agent ids truncated to 8 chars + `…`. Never paste:
- any `agent.turn_started` / `agent.turn_ended` reading line of another agent: count them only ("N lines from other agents");
- `workspaceId` values (truncate like ids, or omit);
- the `path` field of `paseo plugin install --json` and any absolute or home path, including user name: use `<worktree>`;
- any `Lifecycle hook … failed` stderr block: record its presence and count only, never the message or stack;
- the finish notification Paseo steers into the orchestrator (target title + last assistant message);
- `paseo inspect --json` beyond `status` and match yes/no; `paseo run` output beyond the truncated id;
- titles, `cwd`, labels other than `agent-flow.*`, timeline text other than the ping constant, `~/.paseo` contents (`daemon.log`, `agent-requests/`), URLs, `messageId` values.

## Evidence

**Pending live capture.**

## Verdict

**Pending live capture.** The verdict follows the rule in § How a blocked agent waits. On kill or inconclusive, scenario S1 of `features/phase-0/host-agent-message.feature` is re-sliced by the PM, never parked.

## Consequences / Constraints

- **MUST**: send with `activeTurnBehavior: "steer"`; never rely on the `interrupt` default.
- **MUST**: send only the fixed, content-free wake template (`agent-flow: a response to request <id> is available; read it from responses.jsonl`) plus its `messageId`; nothing else from the worktree.
- **MUST NOT**: treat the message text as an answer or an approval. The agent acts only on its `responses.jsonl` entry, read under the provenance rule of [[host-adapter-boundary]].
- **MUST**: keep `responses.jsonl` as the source of truth; a delivered message only wakes the agent.
- **MUST**: a rejected or conflicting wake (`agent_request_key_conflict`, `agent_request_outcome_unknown`, any other rejection) falls back to the floor: the agent re-reads `responses.jsonl` on its next wake or poll. Never a retry loop under a fresh id.
- **MUST NOT**: send to an agent whose `pendingPermissions` is non-empty or whose `attentionReason` is `permission`: the send would deny a permission the human has not answered.
- **MUST**: before sending, Phase 4 checks that the daemon log level is not `trace`, or keeps the wake content-free. With the template above the trace log copies only the template and the request id, never an answer.
- **MUST NOT**: log the message text, the send error text, a read error or timeline content; log a closed outcome only.
- **MUST NOT**: send from a lifecycle hook without a target filter and a loop guard: the hook fires for every agent on the daemon, and each send starts a turn whose end fires the hook again.
- **Out of scope**: queue UI, request/response flow (Phase 4), push subscriptions (#21).

## Open questions / Gaps

- [ ] Not exercised: mid-turn delivery, and which providers support steering into a running turn.
- [ ] #21: the tie rule when several agents map to one worktree (point 4).
- [ ] Receipt files under `~/.paseo/agent-requests/` are never cleaned up by the plugin; whether Phase 4 needs a retention rule for them.
