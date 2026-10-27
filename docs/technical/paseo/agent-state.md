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
> **State of this record**: verdict "belief holds", live evidence recorded 2026-10-26 (see Evidence and Verdict).

## Context

Spike #26 answers one question: can the daemon side read the state of a running agent through the Paseo TypeScript SDK? The throwaway proof extends the existing `agent-flow-spike` plugin (`spikes/paseo/`) with a server entry, `spikes/paseo/index.server.ts`. It registers two lifecycle hooks, `agent.turn_started` and `agent.turn_ended`. On each event it reads the agent through the SDK, keeps an allowlist of fields and writes one JSON line to stdout, which the daemon stores in the plugin log (`paseo plugin logs agent-flow-spike`). [[paseo-api-version]] says "Server entry: None in the spike"; that sentence described #10 only, and is not edited here.

Labels in this record:
- **typed**: read in the 0.11.4 typings.
- **observed**: seen on the local daemon.
- **doc-sourced**: taken from the daemon source or CLI help, not exercised.
- **not exercised**: would need a model run.
- **ruled**: decided by the human.
- **decided**: decided by the architect in this record, with its reason stated.
- A combined label such as `typed + doc-sourced` or `observed + doc-sourced` means the fact rests on anchors of both kinds.

Automated proof: `spikes/paseo/server/agent-state-hooks.test.ts` (`node:test`, run with `npm test` in `spikes/paseo/`) drives the hook registration with a fake `on` and a fake `agents` port. It proves the status and the allowlist, not the live daemon.

Running the tests needs the repository-root `npm ci` first: the script is `node --import tsx --test`, and `tsx` comes from the root `node_modules`, not from `spikes/paseo`. The reason is the host Node (`/usr/bin/node`, v22.22.1) is built without type stripping (`--experimental-strip-types` fails with `ERR_NO_TYPESCRIPT`), so it cannot run `.ts` files itself. Adding `tsx` to the spike would have changed its lockfile.

Host anchors are doc-sourced from the host's `@getpaseo/server` 0.11.4 package. They are relative to `dist/server/server/`, with these subfolders:
- `plugins/`: `plugin-process.js`, `lifecycle/index.js`, `runtime.js`.
- `agent/`: `agent-manager.js`, `create-agent/intent.js`.
- `authorization/`: `operation-permissions.js`.
- No subfolder: `session.js`, `websocket-server.js`, `workspace-registry-model.js`.

`checkout-git.js` is the exception: it is relative to `dist/server/utils/`.

## SDK calls used (AC2)

| Call | Where | Returns | Label |
|---|---|---|---|
| `server.on("agent.turn_started", handler)` / `server.on("agent.turn_ended", handler)` | `PluginServerContext` (`@getpaseo/plugin/server`, `lifecycle.d.ts:90`) | an unsubscribe function; the handler gets `(event, { paseo, signal })` | typed |
| `context.paseo.agents.ref(id)` | `PaseoAgentActions` (`@getpaseo/client` `dist/index.d.ts:310`) | a `PaseoAgentHandle`; its `status` and `current()` are `null` until a snapshot arrives | typed |
| `handle.refresh()` | `PaseoAgentHandle` (`@getpaseo/client` `dist/index.d.ts:281`) | `Promise<{ agent: PaseoAgent; project } \| null>`; `agent.status` is the status | typed; observed live (see Evidence) |
| `agents.list({ filter: { labels, statuses } })` | `PaseoAgentActions` (`@getpaseo/protocol` `dist/messages.d.ts:1155-1168`) | `{ agent, project }` entries; no id filter | doc-sourced alternative, not used |
| `agents.subscribe(handler)` | `PaseoAgentActions` | push stream of agent updates | doc-sourced alternative, not used (#21 decides on push) |
| `workspaces.list` | `PaseoApi` | workspace descriptors with their own status enum (`needs_input`, `failed`, `running`, `attention`, `done`; `PluginWorkspaceSnapshot.status`, `@getpaseo/plugin` `dist/contracts.d.ts:28`) | doc-sourced alternative, not used |

Why `refresh()`: the hook agent (`PluginHookAgent`, `lifecycle.d.ts:15-22`) carries `id`, `workspaceId`, `parentAgentId`, `provider`, `cwd` and `title`, and no status. `refresh()` is the only per-id read in the SDK.

The reader takes a narrow port, `AgentRefSource = { ref(agentId): Pick<PaseoAgentHandle, "refresh"> }`, derived from the SDK types. The server entry passes the real `PluginServerContext` to it, so `npm run typecheck` proves the port is assignable from the real SDK.

### Statuses returned

| Field | Values | Label |
|---|---|---|
| `agent.status` | `initializing`, `idle`, `running`, `error`, `closed` | typed (`@getpaseo/protocol` `dist/messages.d.ts:462-468`); `idle` and `running` observed on the local daemon (`paseo ls --json`: 7 `idle`, 1 `running`, 2026-10-26) and in the live plugin read (see Evidence); `initializing`, `error`, `closed` typed, not observed |
| `agent.activeTurn` | `{ turnId, startedAt } \| null \| undefined` (set while a turn runs) | typed (same file, `:469-472`); observed live as `turnActive` `true` on `agent.turn_started` and `false` on `agent.turn_ended` |
| `agent.requiresAttention` | `boolean \| undefined` | typed (`:483`); observed live: `true` on both lines, including while `status` was `running` |
| `agent.attentionReason` | `finished`, `error`, `permission`, `null`, `undefined` | typed (same file, `:484-488`); `finished` observed live, `error` and `permission` not observed |

The logged line is `{ source, event, agentId, status, turnActive, attentionReason }` (reduced by #27): `turnActive` is `activeTurn != null`, an absent `attentionReason` reads as `null`. A null or failed read logs no line. `readAgentState` still returns `workspaceId`, `requiresAttention` and `labels`; the hook does not log them.

**Attention is sticky.** `requiresAttention: true` with `attentionReason: "finished"` was still set on the `agent.turn_started` line while `status` was `running` (observed): it carries over from the previous turn and is not a live-state signal. #21 must not read it as "the agent needs the human now".

## Permissions to read agent state (AC3)

| Aspect | Value |
|---|---|
| Manifest permission field | None. The manifest declares no permission field ([[paseo-api-version]] § Permissions); declaring one grants or restricts nothing |
| Daemon permission needed | Reading one agent (`fetch_agent_request`) needs `workspace.read` or `hub.execute` (`authorization/operation-permissions.js:75`). The plugin does not request them: nothing in the manifest or the plugin API selects permissions |
| Trust gate | The daemon's global `pluginsEnabled` switch plus an explicit `paseo plugin install`. Nothing else is asked of the plugin |
| What the plugin child holds | A full `PaseoApi` as a `cli` client over `ipc://plugin/<id>` (`plugins/plugin-process.js:221-230`, doc-sourced). Reading needs no extra grant, and nothing limits the plugin to reading: the same object has `agents.create`, `terminals.*` and `config.*` |
| Session admission | The plugin session is admitted as `owner` with all 9 `DAEMON_PERMISSIONS` (`daemon.read`, `daemon.manage`, `tunnel.manage`, `access.manage`, `workspace.read`, `workspace.write`, `workspace.manage`, `automation.manage`, `hub.execute`), including `access.manage` (pairing) and `daemon.manage` (`websocket-server.js:262-265`, `:601`; `authorization/index.js:14`). The read therefore uses a far wider grant than it needs |
| Environment | The plugin child is forked without an `env` option, so it inherits the daemon's environment (`plugins/runtime.js:103-108`) |
| Reach | Lifecycle hooks fire for every agent on the daemon, across projects and workspaces (`plugins/lifecycle/index.js:54-61`, doc-sourced), except internal agents: the daemon emits the hooks at `agent/agent-manager.js:3564-3565` only for non-internal agents. The plugin cannot be scoped to one project |
| Payload exposure | Each `agent.turn_ended` hands the plugin child the agent's whole in-memory timeline (`agent/agent-manager.js:3565`), for agents of every project. The spike drops it and never logs it; #21 must decide whether it may subscribe to `agent.turn_ended` at all, or must filter the timeline at the source |
| Log persistence | The plugin's stdout is also written to the daemon's own log, `~/.paseo/daemon.log` (mode 0644, size-rotated), as "Plugin output" (`plugins/runtime.js:967`; rotation settings `config.js:96-105`). That copy survives `paseo plugin remove`. Anything the plugin prints stays on disk, so the allowlist below is a hard limit |
| Least privilege here | The spike calls `on` and `agents.ref().refresh()` only: no `agents.create`, no `terminals.*`, no `config.*`, no `before` hook, no `server.handle` |

**MUST NOT log** (the reader's allowlist in `spikes/paseo/server/read-agent-state.ts`, narrowed again by the log line in `spikes/paseo/server/agent-state-hooks.ts`, reduced by #27): `title` (it echoes user prompts), `cwd` (home paths), `pendingPermissions` (tool inputs), `lastError`, `runtimeInfo`, `persistence`, `turn_ended.timeline` (conversation content), and the whole `project` placement that `refresh()` returns next to the agent (`projectKey`, `projectName`, `workspaceName`, `checkout` paths and `checkout.currentBranch`; `session.js:1279-1284`). `labels`, `workspaceId` and `requiresAttention` are not logged either (reduced by #27; the reader still keeps the `agent-flow.`-prefixed labels for the message hook's targeting). The unit test pins this with a sentinel string planted in each of those fields (snapshot: `title`, `cwd`, `lastError`, `runtimeInfo`, `persistence`, `pendingPermissions`, `workspaceId`, `labels`; event: agent `title`, `cwd`, `timeline`) and with a deepEqual on the whole line, so any extra key fails; a failed read's error text is never logged. The spike drops `project`, but its test fake returns `project: null`, so no sentinel pins that yet (open item for #21).

**Never forward a workspace's `gitRuntime`.** `remoteUrl` is `null` in the agent's `project.checkout` on the `refresh()` and `list` paths (`workspace-registry-model.js:101`). The raw `remote.origin.url` git config value, however, is read by `checkout-git.js:855-862` and reaches clients as `gitRuntime.remoteUrl` in `workspaces.list` descriptors (`session.js:4151-4157`, `:4184`). That value can embed credentials, so it must never be logged or forwarded (doc-sourced).

**A null reading has three causes**, not only an unknown agent: the id is unknown, the stored agent is internal, or its provider is not visible to the client (`session.js:3950-3957`, doc-sourced; none exercised). Treat `reading: null` as "no state available", not as "no such agent".

## Identifying the agent working on the current step (AC4)

**Ruled by the human (2026-10-26):** the agent working on an item is identified by its **worktree**. That key does not depend on the host. On Paseo the worktree is reached through the agent's **workspace**. Step and role come from `.agent-flow/plan.json`.

| # | Fact | Label |
|---|---|---|
| 1 | Paseo's own identity for an agent is `id` (UUID). `cwd`, `workspaceId`, `parentAgentId` and `labels` are attributes of that agent (`@getpaseo/protocol` `dist/messages.d.ts:423-493`; the hook agent carries `workspaceId` and `cwd` too, `@getpaseo/plugin` `dist/server/lifecycle.d.ts:15-22`) | typed |
| 2 | **Agent Flow key = the item's worktree**: the absolute path of the git worktree root that holds the item's `.agent-flow/` (`<worktree>`, e.g. `<home>/projects/agent-flow-t<N>-<issue>`). Each item runs in its own worktree (`docs/plan.md:22`, `:65`), so the same key works on Paseo and on a later local host | ruled |
| 3 | **Paseo mapping**: `agent.workspaceId` → workspace → `project.checkout.worktreeRoot`. `handle.refresh()` returns `project` built from the agent's `workspaceId` (`session.js:5760-5762`), and so does each `agents.list` entry (`session.js:4059-4068`). `project.checkout` carries `cwd` and `worktreeRoot` (`messages.d.ts:8531-8608`). For a git workspace, `worktreeRoot` is chosen in three steps (`workspace-registry-model.js:102`, reached from `session.js:1270-1278`): the workspace record's own `worktreeRoot`, else the git repo root of the workspace `cwd`, else the workspace `cwd`. A non-git workspace has `worktreeRoot: null` (`workspace-registry-model.js:90-95`). **Comparison**: resolve both sides to real paths (symlinks resolved) and test for equality. A string prefix test is not allowed, because `…-t3-2` would match `…-t3-26` | typed + doc-sourced; not exercised (the spike's reading did not include `project`) |
| 4 | `agents.list` has no workspace or path filter. Its filter has `labels`, `projectKeys`, `statuses`, `includeArchived`, `requiresAttention` (`messages.d.ts:1155-1168`) and `scope: "active"` (`:1152-1154`). Narrow with those, then compare in the daemon | typed |
| 5 | `project` is `null` when the agent has no `workspaceId` (`session.js:5760-5762`). The only fallback is then `agent.cwd` (`messages.d.ts:426`). It matches only by **path-segment containment**: the real path of `cwd` equals the real path of `<worktree>`, or starts with it followed by a path separator | doc-sourced |
| 6 | The `Worktree` row of `paseo inspect` is the label `paseo.worktree` (CLI `dist/commands/agent/inspect.js:105`). Nothing in the `@getpaseo/server` 0.11.4 or CLI dist sets that label (searched; only the reader found). A `null` there says nothing about the agent's workspace, so it is not a key | doc-sourced |
| 7 | **Precondition exposed by the live run.** The agent that was read is the orchestrator session. Its `cwd` is a shared directory, not the item worktree (`paseo ls --json`, `paseo inspect`, 2026-10-26), so its workspace maps to no item. That agent also has a `ParentAgentId` and shares its parent's `cwd` (observed). This fits Paseo's placement rule (`agent/create-agent/intent.js:18-28`, `session.js:3176-3201`):
<br>- an explicit workspace wins;
<br>- otherwise an agent launched **by another Paseo agent** takes the caller's workspace and `cwd`, and its own `--cwd` is overridden;
<br>- only a launch with no caller creates or resolves a workspace from `--cwd`.
<br>The CLI help says the same: `--workspace` "defaults to the caller workspace when agent-scoped" (`paseo run --help`).
<br>So an item's agent must be launched with its workspace in `<worktree>`:
<br>- **from a shell** (no caller): `paseo run --cwd <worktree>`;
<br>- **by another Paseo agent**: `--workspace <id>` of the workspace registered for `<worktree>`, or `--new-workspace worktree` when Paseo itself creates the item worktree;
<br>- on another host: its own equivalent.
<br>Satisfying this is the launch convention's job, owned by #21 / #41. Until it holds, no Paseo agent state can be attached to an item | observed + doc-sourced |
| 8 | **Step and role**: Paseo's status is per agent session. Role subagents (architect, dev, QA) run inside that session and are not Paseo agents (observed), so step and role come from the current step of `<worktree>/.agent-flow/plan.json` (`docs/plan.md:62-96`, [[capture-events]]) | observed |
| 9 | **Launch labels dropped as the identity key.** The worktree already identifies the item. Labels exist on Paseo only and would need the same launch convention. The spike's allowlist still keeps `agent-flow.`-prefixed labels (a code fact), but no meaning is assigned to them | decided |

**The key is a path, so it stays in the daemon.** #21 resolves and compares it there. **Nothing from `project`, the agent's `cwd` or `<worktree>` leaves the daemon**: the only things logged or sent are `workspaceId` and the match result (allowlist, § Permissions).

**Several agents can map to one worktree.** For example, an agent launched by an item's agent inherits its workspace (fact 7). #21 needs a tie rule (open item).

## Evidence

Run on 2026-10-26 on the local daemon (0.11.4) by the orchestrator; the lane only edits files. Output was redacted before it reached this record.

| Step | Command | Result |
|---|---|---|
| Install | `paseo plugin install "<worktree>/spikes/paseo" --json` (2026-10-26T18:22Z) | exit 0; `{"id":"agent-flow-spike","path":"<worktree>/spikes/paseo","enabled":true,"status":"running"}`; stderr: "Trusting plugin code: server code and preparation commands run unsandboxed on the daemon host; client code runs inside Paseo. Dependencies and future updates are part of the codebase you trust." |
| Plugin load | `paseo plugin logs agent-flow-spike` | `[paseo] Loading plugin` 18:22:50Z, `[paseo] Plugin ready` 18:22:53Z |
| Live read 1 | same | `agent.turn_ended`, agent `d80941c0…` (the orchestrator session), reading `{status:"idle", turnActive:false, requiresAttention:true, attentionReason:"finished", labels:{}}` |
| Live read 2 | same | `agent.turn_started`, agent `d80941c0…`, reading `{status:"running", turnActive:true, requiresAttention:true, attentionReason:"finished", labels:{}}` |
| Reading keys | same | exactly `agentId, status, workspaceId, turnActive, requiresAttention, attentionReason, labels`: the allowlist held live; no title, cwd, timeline or permission field in any line |
| Other agents | same | 0 lines from other agents during the window (2 lines in total) |
| Cross-check | `paseo inspect d80941c0… --json`, during the turn that began with read 2 | `Status = running`, matching read 2; `Worktree = null` for this agent |
| Remove | `paseo plugin remove agent-flow-spike` (2026-10-26T18:24Z) | exit 0 |
| Removal check | `paseo plugin ls --json` | installed: `paseo-github-kanban`, `progress`; `agent-flow-spike` absent |
| Daemon | n/a | not restarted |

Observations:

- Both statuses `running` and `idle` were read live through `agents.ref(id).refresh()`; `initializing`, `error` and `closed` stay typed, not observed.
- `paseo inspect` showed `Worktree = null` for the orchestrator agent (observed). That row reads the label `paseo.worktree`, not the workspace (AC4 fact 6). The observation that matters is the agent's `cwd`: a shared directory, not the item worktree (AC4 fact 7).
- The plugin's output also stays in `~/.paseo/daemon.log` after removal (see Log persistence, § Permissions); that file is not quoted here.

## Verdict

**Belief holds.** The plugin server entry read a running agent's status through the SDK (`agents.ref(id).refresh()`) on a live daemon, with the statuses `running` and `idle` observed, and the `running` reading matched `paseo inspect` (AC1). Scenario S1 of `features/phase-0/host-agent-state.feature` (`@manual`) is satisfied by this evidence: the agent that is running is the orchestrator session, the daemon asks the host SDK through the hook and `refresh()`, and it receives the agent's current status.

## Consequences / Constraints

- **MUST**: read state with `agents.ref(id).refresh()` unless a later ticket shows a better call; a hook agent carries no status.
- **MUST**: log only `agentId`, `status`, `turnActive` and `attentionReason` (reduced by #27); add a field only with a matching case in `agent-state-hooks.test.ts`.
- **MUST**: take step and role from `.agent-flow/plan.json`, never from Paseo.
- **MUST**: identify an item's agent by its worktree.
  - On Paseo, map `workspaceId` → `project.checkout.worktreeRoot` and compare real paths for equality inside the daemon.
  - The `agent.cwd` fallback matches by path-segment containment only.
  - Never identify the agent by the `Worktree` label of `paseo inspect` or by launch labels.
- **MUST** (#21 / #41): launch each item's agent with its workspace in the item worktree.
  - From a shell: `--cwd <worktree>`.
  - By another Paseo agent: `--workspace <id>` or `--new-workspace worktree`, because otherwise the caller's workspace is inherited.
  - An orchestrator running from a shared directory maps to no item.
- **MUST NOT**: let anything from `project`, the agent's `cwd`, `<worktree>` or a workspace's `gitRuntime` leave the daemon; expose only `workspaceId` and the match result.
- **MUST NOT**: read `requiresAttention` / `attentionReason` as a live signal; they are sticky across turns (observed).
- **Out of scope**: messaging an agent (#27), push subscriptions (#21).

## Open questions / Gaps

- [ ] #21 / #41: the launch convention that puts each item's agent in its worktree workspace, and what to show for an orchestrator that serves several items from a shared directory.
- [ ] Not exercised: reading `project.checkout.worktreeRoot` live for an agent launched in an item worktree.
- [ ] #21: the tie rule when several agents map to one worktree, for example a parent and the agents it launched in the same workspace.
- [ ] #21: a sentinel test on a non-null `project` (and on workspace `gitRuntime`, if read) proving that nothing from it leaves the daemon.
- [ ] #21: whether a hook that receives every turn timeline (all projects) is acceptable, or the timeline must be filtered at the source (Payload exposure, § Permissions).
- [ ] `initializing`, `error` and `closed` statuses, and the `error` and `permission` attention reasons, are typed but not observed.
