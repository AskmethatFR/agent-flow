---
id: "host-adapter-boundary"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-10-27"
relations:
  depends-on: ["workspace-layout-core-boundary", "paseo-api-version", "paseo-agent-state", "paseo-messaging"]
  related: ["capture-events", "scope-origin"]
answers:
  - "Host-adapter boundary: what does a non-Paseo host (local CLI or web) need from core, and which interfaces does each host implement? (plan.md Q7)"
  - "What does core expose to a host: which functions, data types and events?"
  - "Which host capabilities does Paseo implement, and with which calls?"
  - "What does a local or standalone host implement differently?"
decided_in:
  - "#25"
---

# Host-adapter boundary between core and each host

> **One-liner**: Functional core, host shell: `core` exposes only pure, synchronous functions over plain values (raw `.agent-flow/` text, instants and raw host facts in; values and `ContractError` lists out; nothing throws) and calls nothing on the host, while each host implements six documented capabilities (file access, change notification, agent state, message delivery, clock, snapshot transport).
> **Verdict**: Decided for all six capabilities. Message delivery: the floor is unchanged; its Paseo path is filled from the #27 record (belief holds, [[paseo-messaging]]).
> **Links**: [[workspace-layout-core-boundary]] (what `core` may not import; this node settles its gap at `:68`), [[paseo-api-version]] (#10), [[paseo-agent-state]] (#26), [[capture-events]] (runtime side), [[scope-origin]] (human-answer path, answer provenance), [[paseo-messaging]] (#27). Consumers: #18, #33, #38-#41, epic #8.

## Context

- `docs/plan.md:5` makes Agent Flow host-agnostic: Paseo first, the same `core` elsewhere or standalone; `:58` keeps business rules out of `daemon` and `panel`; `:60` and `:228` (open question 7) defer the host-adapter boundary to Phase 0.
- `.claude/CLAUDE.md:7-9`: `core` is pure TypeScript with no host import; host adapters do file watching, RPCs and SDK calls with no business rule; `panel` displays and takes input only.
- Core today is one module (`core/src/contracts/index.ts:1-2`) whose function takes raw file text (`core/src/contracts/plan.ts:53`). `daemon` and `panel` are empty (`daemon/src/index.ts:1`, `panel/index.client.tsx:1`).
- Planned core surface, not code yet: step lifecycle (#33), snapshot (#38), decisions by step (#39), agent status mapping (#40), validators (#24, #32).

## Decision / Specification

### Adapter families

| Family | Where | Role | Source |
|---|---|---|---|
| Agent-runtime capture | `capture/*` | writes `<worktree>/.agent-flow/*`, confined to that folder | `docs/technical/capture/events.md:66-73`, `:108`; `docs/technical/decisions/scope-origin.md:79` |
| Host | `daemon/` on Paseo; a local host later | reads `.agent-flow/*`, calls `core`, serves the snapshot, writes answers | `.claude/CLAUDE.md:8`; answers: `docs/plan.md:54`, `:127` |
| UI | `panel/` on Paseo | display and user input only, never computes | `.claude/CLAUDE.md:9`, `docs/plan.md:58` |

```
agent runtime (capture/*) ── writes ──► <worktree>/.agent-flow/*        (frozen contracts = the seam)
host adapter ── reads text, clock, agent state ──► core pure functions ──► values + ContractError[]
host adapter ── serves snapshot ──► UI (display only)
host adapter ── appends answer ──► <worktree>/.agent-flow/responses.jsonl ; Paseo: content-free wake (#27)
core ──► calls nothing outside itself (no port, no callback, no subscription)
```

### What core exposes (AC1)

| Functions | Status | Anchor |
|---|---|---|
| `validatePlan(text): ValidationResult` | exists | `core/src/contracts/plan.ts:53` |
| `buildSnapshot(files, now)` | planned | #38 |
| decisions grouped by step | planned | #39 |
| raw status → `{running, stopped, unknown}` + `currentAgent {role, state}` | planned | #40 |
| step start / finish on a given instant — called by the agent-runtime capture writer (#34), never by a host | planned | #33 |
| validators for `decisions.jsonl`, `requests.jsonl`, `responses.jsonl`, `scope.json` | planned | #32, #24 |

Rule: every function is synchronous and pure; raw text and plain values in, values out; it never throws (`core/src/contracts/plan.ts:53-63`).

| Data types | Status | Anchor |
|---|---|---|
| `ValidationResult` | exists | `core/src/contracts/contract-error.ts:29-31` |
| `ContractError` | exists | `core/src/contracts/contract-error.ts:1-6` |
| `Snapshot` | planned | #38 |
| any type above, imported only through `@agent-flow/core/<module>` | exists | `core/package.json:6-8` |

| Events | Decision |
|---|---|
| Emitted by core | none; core offers no subscription and defines no secondary port (it drives no I/O) |
| Boundary "events" | input values the host passes in: the raw agent status plus role (#40, #41) and the clock's `now` (#38 AC1) |
| Host failures | SDK error, permission refusal, unreadable or oversized file enter core or the snapshot as values from a closed set of codes, never as exceptions and never as raw error text (decided here; SDK and permission case: #41 AC4) |
| Change | change notification is a host concern; on a change the host re-invokes core |

### Host capabilities (AC2)

| Capability | Host provides | Paseo implementation | Label | Source |
|---|---|---|---|---|
| File access | raw text of `<worktree>/.agent-flow/*`, read within the resolution and size rules (Consequences); confined write of `responses.jsonl`; admission of known worktrees only | plugin server entry `panel/index.server.ts` → `panel/server/**` → `daemon` package, Node fs in the daemon child; every RPC input schema-parsed via `server.handle(contract, fn)`; unknown worktree refused (#18 AC5) | decided (layout ruled #10) | `docs/technical/paseo/api-version.md:86-103`, `:105-114` |
| Change notification | when to rebuild | MVP: none in the host — the panel polls `getSnapshot` (#18); push via `agents.subscribe` doc-sourced, not used, #21 decides | doc-sourced / decided by #18 | `docs/technical/paseo/agent-state.md:58`; #18 routing |
| Agent state | role (from `plan.json`) + raw status of the item's agent | `context.paseo.agents.ref(id).refresh()` → `agent.status` ∈ `initializing, idle, running, error, closed`; item agent found by worktree: `workspaceId` → `project.checkout.worktreeRoot`, real-path equality in the daemon; `requiresAttention` not a live signal; null reading = "no state" | typed + observed (status idle, running); mapping and null causes doc-sourced, not exercised | `docs/technical/paseo/agent-state.md:54-56`, `:69`, `:76`, `:97`, `:101-109`, `:157-169` |
| Message delivery | floor: append the validated answer to `responses.jsonl` (#24 schema), only through the host's human-answer path, with provenance kept outside the worktree ([[scope-origin]]); optional SDK delivery | floor, then a content-free wake: `context.paseo.agents.ref(id).send(<fixed wake template>, { activeTurnBehavior: "steer", messageId: <request id> })`; the answer is never in the message and the agent acts only on its `responses.jsonl` entry; `<request id>` only after the #24 schema validation, so no wake until #24 exists; no wake to an agent whose `pendingPermissions` is non-empty or whose `attentionReason` is `permission`; a rejected wake falls back to the floor, never a retry; the blocked agent ends its turn and waits for the wake; sending needs `workspace.write` or `hub.execute`; the plugin session is admitted as `owner` with all 9 daemon permissions, none can be narrowed, and it reaches any non-internal agent on the daemon, all projects; one agent id per send, recipient choice needs #21's tie rule; this cell is a summary: `docs/technical/paseo/messaging.md:168-177` apply in full | typed + observed live (idle agent); mid-turn not exercised; steer and wake decided by #27 | `docs/technical/paseo/messaging.md:48`, `:59`, `:75-78`, `:89-91`, `:93`, `:96-103`, `:109-110`, `:160-164`, `:168-177`; `docs/plan.md:208`, `:216`; `docs/technical/decisions/scope-origin.md:56`, `:86`, `:89` |
| Clock | `now` / instants | daemon process clock | decided | #38 AC1 |
| Snapshot transport | snapshot to UI | plugin RPC `server.handle(contract, fn)`, schema in `panel/shared/**`; panel client display only | decided (ruled #10 layout) | `docs/technical/paseo/api-version.md:96`, `:109-110`, `:150-151` |

The capabilities are documented here, not coded: TypeScript interfaces wait for the second implementation (epic #8 story 1).

### What #27 must establish to close message delivery

1. Whether the Paseo SDK delivers a message to a running agent, and the call (Q2, `docs/plan.md:208`).
2. How a blocked agent waits: stop and poll `responses.jsonl`, or a Paseo-native mechanism (Q4, `docs/plan.md:216`).
3. The permissions needed (`docs/technical/paseo/agent-state.md:83-86` shows the read-side grant shape).
4. Which agent receives it when several map to one worktree: this needs #21's tie rule (`docs/technical/paseo/agent-state.md:126`); #27 states only whether delivery depends on it.
5. That an SDK delivery carries only the validated text of an answer that came through the human-answer path, and nothing else from the worktree.

Outcome rule: either answer fills the Paseo cell; the floor and `core` stay unchanged.

### What a local or standalone host implements differently (AC3)

| Capability | Paseo | Local / standalone |
|---|---|---|
| File access | daemon child under Paseo; known worktrees from Paseo workspaces (`docs/technical/paseo/agent-state.md:107`) | same Node fs read and confined write; known worktrees = a user-supplied list of worktree roots (decided default; #8 may add discovery) |
| Change notification | none, UI polls (#18) | free choice: filesystem watch or timer; core call unchanged |
| Agent state | Paseo SDK `refresh()` | no agent registry → supplies no status; snapshot omits `currentAgent` (#40 AC3) |
| Message delivery | floor + content-free wake ([[paseo-messaging]]) | floor only (`responses.jsonl`); no wake, so a blocked agent finds its answer only by re-reading the file on its next wake or poll (restated from `docs/technical/paseo/messaging.md:164`, `:173`; when that happens: epic #8) |
| Clock | daemon process clock | host process clock |
| Snapshot transport | plugin RPC to RN panel | its own UI transport (epic #8 story 2); not decided here |
| Answer authentication | Paseo's connected-client sessions reach the RPCs (`docs/technical/paseo/api-version.md:106`); no Agent Flow-level check is added | the host authenticates its UI transport: no unauthenticated endpoint writes an answer; a web UI also checks the request origin (decided here; epic #8 story 2) |
| Unchanged | `core`, `.agent-flow/` contracts, capture adapters, worktree key (`docs/technical/paseo/agent-state.md:106`) | same |

### Considered options

| Option | Verdict | Reason |
|---|---|---|
| Functional core, host shell: pure functions in core, six capabilities documented per host | Chosen | Matches core today (`core/src/contracts/plan.ts:53-63`) and groomed #38 AC1, #40, #41 AC1; holds under both #27 outcomes |
| Core-owned async ports (`ForReadingAgentFlowFiles`, `ForReadingAgentState`, `ForTellingTime`) + shared `getSnapshot` use case in core | Rejected | Pulls async failure and timeout policy into core; contradicts groomed #38 AC1 / #41 AC1; the shell left per host is a read-then-call sequence with no business rule |
| Core exposes an event bus / subscription API ("step changed", "agent state changed") | Rejected | Needs a runtime and lifecycle in core; Paseo MVP polls (#18); a pure rebuild per change gives the same result |
| A `host-api` package with TS capability interfaces now | Rejected | Single implementation; speculative contract; deferred to epic #8 story 1 |
| Message delivery decided only after #27 (block this ADR) | Rejected | The human gave go; the `responses.jsonl` floor is valid under both #27 outcomes |
| UI talks to core directly, host only proxies files | Rejected | `panel` never computes (`.claude/CLAUDE.md:9`, `docs/plan.md:58`); the RN client holds a full `PaseoApi` (`docs/technical/paseo/api-version.md:82`), so logic stays out of it |

## Consequences / Constraints

- **MUST**: `core` stays pure — raw text and values in, values out, no throw, no port, callback or subscription.
- **MUST**: every host-side failure reaches `core` or the snapshot as a value from a closed set of codes, labelled with the contract file name; never the raw `error.message`, `error.path` or SDK `lastError` (decided here; SDK and permission case: #41 AC4; `lastError` restated from `docs/technical/paseo/agent-state.md:93`). The slice that adds a code names it (#38, #41).
- **MUST**: `panel/` (and any host UI) never calls core logic of its own nor the host SDK for state (`.claude/CLAUDE.md:9`; #21 AC4).
- **MUST NOT**: let a worktree path, `cwd`, `project` or `gitRuntime` leave the host process; UI and logs get host handles and match results only (restated from `docs/technical/paseo/agent-state.md:168`; #18 must conform).
- **MUST**: host writes stay confined to `<worktree>/.agent-flow/` (`docs/technical/capture/events.md:108`).
- **MUST**: the host resolves every `.agent-flow/` path to its real path and refuses it unless it lies inside the real path of an admitted worktree's `.agent-flow/` by path-segment containment, never a string prefix (restated from `docs/technical/paseo/agent-state.md:107`, `:109`); it opens the final component without following a link and refuses anything that is not a regular file; after opening, the host verifies the descriptor is the file it checked (fstat device and inode equal the resolved path's lstat, or the descriptor's real path is re-checked) and refuses it otherwise; a worktree named by a client is admitted only by real-path equality with the host's known set (decided here; both hosts).
- **MUST**: the host bounds every read: it reads at most `4 × MAX_TEXT_LENGTH` bytes plus one (`core/src/contracts/contract-error.ts:8`; UTF-8 bound), and a longer file reaches `core` as a failure value, not as text (decided here).
- **MUST**: answers enter only through the host's human-answer path, with provenance recorded outside the worktree; an agent-written line in `responses.jsonl` never counts as an approval (restated from `docs/technical/decisions/scope-origin.md:56`, `:86`, `:89`, `:107`).
- **MUST**: a second host needing a `core` change means this boundary was wrong (trigger: epic #8 kill criterion); the remedy is a new ADR superseding this one, because an ADR is never amended.
- **Cost**: each host re-implements the read-then-call sequence; accepted because it holds no business rule.
- **Out of scope**: local host implementation (epic #8), `docs/plan.md` edits (#37), Paseo messaging facts (#27), push subscription (#21), packaging of `core` into the Paseo server bundle (`docs/technical/paseo/api-version.md:159`, #18).

## Open questions / Gaps

- [x] #27: message delivery, the five points above — closed by [[paseo-messaging]] (belief holds): points 1-4 as recorded; point 5 narrower on content (no answer text in the message), not on origin: its one worktree value, the request id, comes from agent-writable `requests.jsonl` and is inserted only after the #24 schema validation (`docs/technical/paseo/messaging.md:77`).
- [ ] #18: worktree addressing of the snapshot RPC versus `docs/technical/paseo/agent-state.md:168`.
- [ ] #18: whether Paseo's server bundle resolves TypeScript-source `core` (`docs/technical/paseo/api-version.md:159`).
- [ ] Epic #8 story 1: TypeScript capability interfaces derived from the AC2 table.
