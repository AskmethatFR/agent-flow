---
id: "paseo-agent-state"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-10-26"
links:
  - "paseo-api-version"
  - "capture-events"
answers:
  - "Which Paseo SDK calls read the state of a running agent from the daemon side, and which statuses do they return?"
  - "Which permissions does a Paseo plugin need to read agent state?"
  - "How is the agent working on the current step identified: by agent id, worktree, step or role?"
decided_in:
  - "#26"
---

# Reading agent state through the Paseo SDK

> **One-liner**: the SDK calls a Paseo plugin's server entry uses to read an agent's status, the statuses it returns, the permissions that read needs, and how the agent working on the current step is identified.
> **Links**: [[paseo-api-version]] (plugin layout and trust model), [[capture-events]] (where step and role come from). Scenario file: `features/phase-0/host-agent-state.feature` (S1, `@manual`).
> **State of this record**: DRAFT. The calls, statuses, permissions and identification below are typed or doc-sourced; the live run is "pending S2" (see Evidence).

## Context

Spike #26 answers one question: can the daemon side read the state of a running agent through the Paseo TypeScript SDK? The throwaway proof extends the existing `agent-flow-spike` plugin (`spikes/paseo/`) with a server entry, `spikes/paseo/index.server.ts`. It registers two lifecycle hooks, `agent.turn_started` and `agent.turn_ended`. On each event it reads the agent through the SDK, keeps an allowlist of fields and writes one JSON line to stdout, which the daemon stores in the plugin log (`paseo plugin logs agent-flow-spike`). [[paseo-api-version]] says "Server entry: None in the spike"; that sentence described #10 only, and is not edited here.

Labels in this record: **typed** = read in the 0.11.4 typings, **observed** = seen on the local daemon, **doc-sourced** = taken from the daemon source or CLI help, not exercised, **not exercised** = would need a model run.

Automated proof: `spikes/paseo/server/agent-state-hooks.test.ts` (`node:test`, run with `npm test` in `spikes/paseo/`) drives the hook registration with a fake `on` and a fake `agents` port. It proves the status and the allowlist, not the live daemon.

## SDK calls used (AC2)

| Call | Where | Returns | Label |
|---|---|---|---|
| `server.on("agent.turn_started", handler)` / `server.on("agent.turn_ended", handler)` | `PluginServerContext` (`@getpaseo/plugin/server`, `lifecycle.d.ts:90`) | an unsubscribe function; the handler gets `(event, { paseo, signal })` | typed |
| `context.paseo.agents.ref(id)` | `PaseoAgentActions` (`@getpaseo/client` `index.d.ts:310`) | a `PaseoAgentHandle`; its `status` and `current()` are `null` until a snapshot arrives | typed |
| `handle.refresh()` | `PaseoAgentHandle` (`index.d.ts:281`) | `Promise<{ agent: PaseoAgent; project } \| null>`; `agent.status` is the status | typed; live read pending S2 |
| `agents.list({ filter: { labels, statuses } })` | `PaseoAgentActions` (`messages.d.ts:1155-1168`) | `{ agent, project }` entries; no id filter | doc-sourced alternative, not used |
| `agents.subscribe(handler)` | `PaseoAgentActions` | push stream of agent updates | doc-sourced alternative, not used (#21 decides on push) |
| `workspaces.list` | `PaseoApi` | workspace descriptors with their own status enum (`needs_input`, `failed`, `running`, `attention`, `done`; `PluginWorkspaceSnapshot.status`, `@getpaseo/plugin` `dist/contracts.d.ts:28`) | doc-sourced alternative, not used |

Why `refresh()`: the hook agent (`PluginHookAgent`, `lifecycle.d.ts:15-22`) carries `id`, `workspaceId`, `parentAgentId`, `provider`, `cwd` and `title`, and no status. `refresh()` is the only per-id read in the SDK.

The reader takes a narrow port, `AgentRefSource = { ref(agentId): Pick<PaseoAgentHandle, "refresh"> }`, derived from the SDK types. The server entry passes the real `PluginServerContext` to it, so `npm run typecheck` proves the port is assignable from the real SDK.

### Statuses returned

| Field | Values | Label |
|---|---|---|
| `agent.status` | `initializing`, `idle`, `running`, `error`, `closed` | typed (`messages.d.ts:462-468`); `idle` and `running` observed on the local daemon (`paseo ls --json`: 7 `idle`, 1 `running`, 2026-10-26); `initializing`, `error`, `closed` not exercised |
| `agent.activeTurn` | `{ turnId, startedAt } \| null \| undefined` (set while a turn runs) | typed (`messages.d.ts:469-472`); not exercised live |
| `agent.requiresAttention` | `boolean \| undefined` | typed (`:483`); not exercised live |
| `agent.attentionReason` | `finished`, `error`, `permission`, `null`, `undefined` | typed (`:484-488`); not exercised live |

The logged reading is `{ agentId, status, workspaceId, turnActive, requiresAttention, attentionReason, labels }`: `turnActive` is `activeTurn != null`, absent optionals read as `false` / `null`.

## Permissions to read agent state (AC3)

| Aspect | Value |
|---|---|
| Manifest permission field | None. The manifest declares no permission field ([[paseo-api-version]] § Permissions); declaring one grants or restricts nothing |
| Trust gate | The daemon's global `pluginsEnabled` switch plus an explicit `paseo plugin install`. Nothing else is asked of the plugin |
| What the plugin child holds | A full `PaseoApi` as a `cli` client over `ipc://plugin/<id>` (`@getpaseo/server` `plugin-process.js:221-230`, doc-sourced). Reading needs no extra grant, and nothing limits the plugin to reading: the same object has `agents.create`, `terminals.*` and `config.*` |
| Reach | Lifecycle hooks fire for every agent on the daemon, across projects and workspaces (`lifecycle/index.js:54-61`, doc-sourced). The plugin cannot be scoped to one project |
| Least privilege here | The spike calls `on` and `agents.ref().refresh()` only: no `agents.create`, no `terminals.*`, no `config.*`, no `before` hook, no `server.handle` |

**MUST NOT log** (the allowlist in `spikes/paseo/server/read-agent-state.ts`): `title` (it echoes user prompts), `cwd` (home paths), `pendingPermissions` (tool inputs), `lastError`, `runtimeInfo`, `persistence`, and `turn_ended.timeline` (conversation content). Of `labels`, only keys starting `agent-flow.` are kept. The unit test pins this with a sentinel string planted in each of those fields.

## Identifying the agent working on the current step (AC4)

1. **Agent id.** Paseo identifies an agent by `id` (UUID). `workspaceId`, `cwd`, `parentAgentId` and `labels` are attributes of that agent, not identities (typed: `messages.d.ts:423-493`, `lifecycle.d.ts:15-22`).
2. **Observed.** The Paseo agent behind an issue is the orchestrator session. Its `cwd` is not the issue worktree, and role subagents (architect, dev, QA) run inside that session and are not Paseo agents. Paseo's status is therefore per agent session, not per role or step. **Step and role cannot come from Paseo**; they come from `.agent-flow/plan.json` (`docs/plan.md:62-96`, [[capture-events]]).
3. **Recommended key for #21 / #41 (not exercised).** Labels set at launch (`paseo run --label key=value`, `PaseoAgentCreateOptions.labels`, `index.d.ts:182`), queried with `agents.list({ filter: { labels } })` (`messages.d.ts:1156`). Use a reserved `agent-flow.` key prefix: Paseo itself uses labels (`lifecycle/index.js:48`, doc-sourced), and the spike's allowlist already keeps only that prefix. Not exercised because it needs a model run; the key names are #21's decision.
4. **Matching by worktree is unreliable.** `cwd` and `workspaceId` identify where the session was started, not the step it is on, as observed in (2).

## Evidence

Pending S2. The live read (install of `agent-flow-spike` on the local 0.11.4 daemon, logged lines cross-checked against `paseo inspect <id> --json`, then removal) is recorded here once run.

## Verdict

Pending S2.

## Consequences / Constraints

- **MUST**: read state with `agents.ref(id).refresh()` unless a later ticket shows a better call; a hook agent carries no status.
- **MUST**: log only the allowlisted fields above; add a field only with a matching case in `agent-state-hooks.test.ts`.
- **MUST NOT**: derive step or role from Paseo; read them from `.agent-flow/plan.json`.
- **MUST NOT**: match an agent to a step by `cwd` or worktree.
- **Out of scope**: messaging an agent (#27), push subscriptions (#21), label naming (#21).

## Open questions / Gaps

- [ ] S2: the live status read and its cross-check against `paseo inspect`.
- [ ] #21: the `agent-flow.` label key names and whether the orchestrator launches its session with them.
- [ ] `initializing`, `error` and `closed` statuses, `activeTurn` and `attentionReason` are typed but not exercised live.
