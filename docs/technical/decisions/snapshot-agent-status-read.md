---
id: "snapshot-agent-status-read"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-11-09"
relations:
  depends-on: ["snapshot-agent-state", "paseo-agent-state", "snapshot-rpc", "host-adapter-boundary"]
  related: ["snapshot-contract"]
answers:
  - "Which host call does the daemon use to read the status of a worktree's agent, and why not agents.ref(id).refresh()?"
  - "How is the agent of a worktree picked among the host's agents, and which one wins when several match?"
  - "How far back does the agent lookup reach, and what does it report past that?"
  - "How does a host failure to read agent state reach the snapshot, and why is it not an RPC refusal?"
decided_in:
  - "#41"
---

# Snapshot agent status read: one agents.list page, worktree match, host-error code

> **One-liner**: The daemon reads the agent status of a worktree with one `agents.list` call (100 most recently updated agents), picks the first entry whose worktree root has the same real path as the requested worktree, and passes its raw status to `buildSnapshot`. A failed host call is not a refusal: core receives the closed code `{ unavailable: 'host-error' }`, adds one `agent-state` error and reports no current agent, and the rest of the snapshot is served as usual.
> **Links**: [[snapshot-agent-state]] (the third `buildSnapshot` parameter, mapping, `undefined` for no reading `:75`), [[paseo-agent-state]] (worktree key ruled `:101`, `:106`; real-path equality, no prefix `:107`; `list` filter set `:108`), [[snapshot-rpc]] (`workspaceId` addressing, structural port pattern `:44`, refusal set `:54`), [[host-adapter-boundary]] (host failures as closed codes `:74`, `:127`), [[snapshot-contract]] (`ContractError` shape, additive-only). Scenario file: `features/phase-2/agent-state-rpc.feature` (S1-S4).

## Context

#41 is the first host caller of the agent-status parameter that #40 added. The panel names a worktree by `workspaceId` ([[snapshot-rpc]]); no agent id is known at that point.

Corrected here, not edited there (closed records):
- `agent-state.md:157` ("read state with `agents.ref(id).refresh()` unless a later ticket shows a better call"): for the snapshot, `agents.list` is that better call. `refresh()` needs an agent id, and a workspace gives none, while each list entry carries both `agent.status` and its `project` placement (`agent-state.md:107`). `refresh()` remains the per-id read for the hooks of the #26/#27 spike.
- `agent-state.md:175` ("not exercised: reading `project.checkout.worktreeRoot` live"): still true for a live run. #41 reads the root from list entries, proves `context.paseo.agents` assignable to the port by typecheck (`panel/server/snapshot.ts:6-8`), and runs it only against fake hosts (unit tests, `features/steps/agent-state-rpc.steps.ts`).
- `agent-state.md:176` and `snapshot-agent-state.md:78` leave the tie between several agents on one worktree to #21. For the snapshot, #41 settles it (Identification). #21 can supersede this node if rendering needs another rule.
- `host-adapter-boundary.md:83` (Paseo agent-state cell: `ref(id).refresh()`): the snapshot uses `agents.list` (above).
- `host-adapter-boundary.md:127` ("labelled with the contract file name"): agent state has no contract file. Its label is `agent-state`.
- `snapshot-rpc.md:54`, `:92` (residual d), `:124`: these assign a distinct `host-error` refusal reason to #41. #41 did not add one. A host failure on agent state is an error value inside a served snapshot, and the wire reply (`{kind:'snapshot'} | {kind:'refused', reason:'unknown-worktree'}`, `daemon/src/snapshot/get-snapshot.ts:17-19`) is unchanged. A failed workspace lookup still refuses with `unknown-worktree`.

## Decision / Specification

### Read and identification (`daemon/src/snapshot/agent-status.ts`)

| Concern | Decision | Rationale |
|---|---|---|
| Host call | one `agents.list({ sort: [{ key: 'updated_at', direction: 'desc' }], page: { limit: AGENT_PAGE_LIMIT } })` per snapshot, `AGENT_PAGE_LIMIT = 100` (`:20`, `:24-27`) | no agent id is known from a workspace; one bounded call per poll |
| Port | structural `AgentSource = { list(options) }` (`:16-18`), a structural mirror of `PaseoAgentActions.list`. It is the required third parameter of the handler built by `createGetSnapshot` (`get-snapshot.ts:42-46`), wired with `context.paseo.agents` in `panel/server/snapshot.ts:6-8` | same pattern as `WorkspaceSource` ([[snapshot-rpc]] `:44`): no Paseo import in `daemon`, and the typecheck proves the port is assignable |
| Key | the entry's `project.checkout.worktreeRoot` must be an absolute string, and its real path must equal the real path of the requested worktree (`worktree-root.ts:10-21`, `agent-status.ts:36`). An entry with no project, a null, relative or unresolvable root is skipped | the worktree key ruled in [[paseo-agent-state]] `:101`, `:106`; equality, never a prefix (`:107`) |
| Tie | the first matching entry in the host's order wins, that is the most recently updated agent on the worktree. The order comes from the `sort` passed to the host; the daemon has no tie rule of its own | the host already sorts; a daemon rule would duplicate it |
| Matching entry's status | a string is passed to core as it is (mapping and `unknown` per [[snapshot-agent-state]]). A missing, `null` or non-string status gives no status (`:37-38`), so no current agent, and later matching entries are not consulted | `snapshot-agent-state.md:75`: no reading is `undefined`, never `null` |
| No match | no status, so `currentAgent` is `null` and no error is added | an absent agent is not a failure |

### Host failure (`agent-status.ts:49-54`, `core/src/snapshot/snapshot.ts`)

| Concern | Decision | Rationale |
|---|---|---|
| Code | any rejection or throw of `list` gives `AgentStatusUnavailable = { unavailable: 'host-error' }` (`snapshot.ts:17`), the closed set's only member. It is passed as the third `buildSnapshot` argument | host failures enter core as closed codes, never as text ([[host-adapter-boundary]] `:74`, `:127`) |
| One code for SDK error and permission refusal | both give `host-error` | the SDK does not tell them apart without parsing error text, which `:127` forbids |
| Core effect | `currentAgent` is `null`, and exactly one error `{ file: 'agent-state', location: null, field: null, message: 'cannot be read from the host' }` is appended **last** to `errors`, both with a usable plan and with an unusable one (`snapshot.ts:107-121`, `:168-195`) | the steps, decisions and their errors are kept; the panel can tell "no agent" from "agent unreadable" |
| Exact code only | only an object whose `unavailable` is exactly `'host-error'` counts as the code (`:118-121`). Any other object is treated as a raw status and maps to `unknown`, and a runtime `null` also maps to `unknown` ([[snapshot-agent-state]] mapping). The daemon never passes either: it drops a non-string status before core | a closed code, never a duck-typed one |
| Wire | unchanged: the error travels in `Snapshot.errors` (`ContractError.file` is a free string on the wire) | additive-only rule of [[snapshot-contract]]; no reply member added ([[snapshot-rpc]]) |

### Known limits

| Limit | Effect | Status |
|---|---|---|
| One page of 100, no cursor, no `projectKeys` filter | an agent of the worktree that is older than the 100 most recently updated agents on the daemon (all projects) is reported as no agent | deferred (Security S2). The fix is `filter.projectKeys`, which needs the workspace reading to carry `projectKey` first |
| No timeout on `agents.list` | a host call that never settles holds the RPC | deferred (Dev-B O3) |
| No `agent.cwd` fallback | an agent with no workspace (`project` null) is skipped, even though `agent-state.md:109` allows a path-segment containment fallback on `cwd` | not needed while agents are launched in their item worktree (`agent-state.md:164-167`) |

### Considered and rejected

| Option | Why rejected |
|---|---|
| `agents.ref(id).refresh()` | needs an agent id; a workspace gives none |
| Match by `workspaceId` equality | the ruled key is the worktree, not the host's workspace; an agent launched by another agent sits in its caller's workspace (`agent-state.md:111-120`) |
| Path prefix match | `…-t3-2` would match `…-t3-26` (`agent-state.md:107`) |
| A tie rule in the daemon (e.g. prefer `running`) | the host's `updated_at desc` order already decides; a second rule would disagree with it |
| A distinct `host-error` RPC refusal | would drop a readable plan because of the agent read (S2: the rest is kept) |
| Two codes (SDK error vs permission refusal) | not distinguishable without parsing error text |
| Paging through every agent | unbounded host calls per poll; `projectKeys` narrows instead |

## Consequences / Constraints

- **MUST**: identify a worktree's agent only by real-path equality of `project.checkout.worktreeRoot`, never by `workspaceId` or by prefix.
- **MUST**: any new agent-state failure code is a new member of `AgentStatusUnavailable`, labelled `agent-state`, never free text; core appends its error last.
- **MUST NOT**: refuse the RPC because the agent state cannot be read.
- **MUST NOT**: let anything from a list entry reach the reply except the display state core maps from the matched status ([[paseo-agent-state]] `:124`, `:168`; [[snapshot-agent-state]] `:76`).
- **Out of scope**: rendering (#21), live push (#21), the launch convention (`agent-state.md:174`).

## Open questions / Gaps

- [ ] Security S2: add `filter.projectKeys` to the list call; needs `projectKey` in the workspace reading.
- [ ] Dev-B O3: a timeout on `agents.list`.
- [ ] A live run reading `project.checkout.worktreeRoot` from a list entry (`agent-state.md:175`).
