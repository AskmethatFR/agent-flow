---
id: "snapshot-agent-state"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-11-07"
relations:
  depends-on: ["snapshot-contract", "host-adapter-boundary", "paseo-agent-state"]
  related: ["snapshot-rpc", "snapshot-decisions"]
answers:
  - "How does a host hand core an agent's status, and where does the current agent's role come from?"
  - "Which raw host statuses map to which display state, and what is unknown?"
  - "When is the snapshot's current agent null?"
  - "Why is the status mapping internal to core, and why does the raw status never reach the snapshot?"
  - "What must #41 pass when the host has no status reading?"
  - "What does the current agent mean when several steps are in progress?"
decided_in:
  - "#40"
---

# Snapshot agent state: raw host status in, display state out

> **One-liner**: The host passes only the raw agent status, as the optional third argument of `buildSnapshot`. Core takes the role from the current plan step and maps the status onto the closed set `running | stopped | unknown`. The snapshot carries `currentAgent: { role, state }`, or `null` when there is no status, no current step or no usable plan. The raw status never enters the snapshot.
> **Links**: [[snapshot-contract]] (frozen entry `:36`, frozen fields `:37`, additive-only `:38`, untrusted display text `:66`), [[host-adapter-boundary]] (agent-state capability `:83`, local host `:106`, panel never computes `:128`), [[paseo-agent-state]] (status set `:69`, null handle `:55`, null reading `:97`, role from the plan `:121`), [[snapshot-rpc]] (wire mirror pinned by type equality `:55`), [[snapshot-decisions]] (sibling additive slice). Consumers: #41 (first host caller), #21 (rendering).

## Context

[[host-adapter-boundary]] planned a raw status → display state mapping for #40 (`:57`). Paseo reports status per agent session, and role subagents are not Paseo agents, so the role can only come from the plan ([[paseo-agent-state]] `:121`). Core already picks the current step, and the daemon is barred from doing so (`daemon/src/snapshot/boundary.test.ts`).

Corrected here, not edited there (closed records):
- `snapshot-contract.md:36`: the entry is now `buildSnapshot(files, now, agentStatus?)`. The third parameter is optional, so a two-argument call is unchanged.
- `snapshot-contract.md:37`: the frozen top-level fields gain `currentAgent`, frozen under `:38`.
- `snapshot-contract.md:66`: #21 is a consumer of that rule too. `currentAgent.role` is copied from `plan.json`, so #21 renders it as plain text, strips bidi and control characters and truncates it, exactly as for step roles.
- `host-adapter-boundary.md:73` ("the raw agent status plus role"): the host passes only the raw status. The role enters through the plan text, as `:83` already says.
- `host-adapter-boundary.md:106` ("omits `currentAgent`"): the key is present and `null` (`snapshot-contract.md:37`).

## Decision / Specification

| Concern | Decision | Rationale |
|---|---|---|
| Input | optional third parameter `agentStatus?: string`, the raw host status. It is not a field of the files argument | additive to the frozen entry; the files type stays files |
| Role source | the `role` of the current step, the step `currentStepId` names (same scan, same tie rule) | Paseo status is per session ([[paseo-agent-state]] `:121`); the current-step rule lives only in core |
| Output | one top-level field `currentAgent: { role, state } \| null` | additive under `snapshot-contract.md:38`; the panel reads it without a lookup |
| Absence | `currentAgent` is `null` when no status is passed, no step is in progress, or the plan is unusable. It is never an omitted key | `snapshot-contract.md:37` |
| Mapping | `running`, `initializing` → `running`; `idle`, `error`, `closed` → `stopped`; anything else → `unknown` | the five typed statuses ([[paseo-agent-state]] `:69`). A launching agent is working, not halted. `error` has no display state of its own, and its detail belongs to #21 |
| `unknown` | means exactly "a status core does not know": an exact, case-sensitive lookup with no trimming, which never throws on any runtime value | a listed status never shows as unknown; normalising would guess at host text |
| Lookup | a `ReadonlyMap`, never a plain object | prototype keys (`constructor`, `__proto__`) would match ([[snapshot-decisions]] `:70`) |
| Not exposed | the raw status, `turnActive`, `requiresAttention`, `attentionReason` | no reader needs them; attention is sticky ([[paseo-agent-state]] `:76`) |
| Module surface | the mapping sits in its own core module. Only the `AgentDisplayState` type is exported, and the mapping function stays internal | hosts and the panel never map ([[host-adapter-boundary]] `:128`); mirrors the internal plan reader (`snapshot-contract.md:45`) |
| Cost | `currentStepId` and `currentAgent` derive from one current-step scan | the linear bound of `snapshot-contract.md:44` holds |

### Known limits

| Limit | Effect | Why it stands |
|---|---|---|
| One status per session, several steps in progress | `role` names the latest-started step, while `state` describes the whole session | Paseo has no per-role status ([[paseo-agent-state]] `:121`); per-step agent state is not scheduled |

### Considered and rejected

| Option | Why rejected |
|---|---|
| The host passes `{ role, status }` | the daemon would need the current-step rule, which it may not hold |
| `initializing` or `error` → `unknown` | blurs `unknown` for statuses that are listed |
| `initializing` → `stopped` | shows a launching agent as halted |
| An optional `currentAgent?` key | breaks the `null` convention of `snapshot-contract.md:37` |
| `agentStatus` inside the files argument | a non-file value in a type named for files |
| A `Record` or `switch` lookup | prototype-key exposure (`Record`); same result with more mutants (`switch`) |
| Case-insensitive or trimmed match | guesses at host text |
| Exporting the mapping function | invites mapping outside core |

## Consequences / Constraints

- **MUST**: `currentAgent` and its `role`/`state` fields fall under the additive-only rule of [[snapshot-contract]].
- **MUST**: the display-state set `running | stopped | unknown` is closed. Adding a value breaks an exhaustive reader (the wire `z.enum`), so it is a new node superseding this one.
- **MUST**: a host with no status reading passes `undefined`, never `null`. A `PaseoAgentHandle.status` is `null` until its first snapshot, and a `refresh()` reading can be `null` ([[paseo-agent-state]] `:55`, `:97`). #41 passes `status ?? undefined`, because a runtime `null` reads as `unknown`, not as no current agent.
- **MUST**: the raw host status never enters the snapshot. Only the mapped state crosses to the UI.
- **MUST** (#21 and every other consumer): `currentAgent.role` is agent-written display text (`snapshot-contract.md:66`).
- **Out of scope**: reading the status through the SDK (#41), choosing among several agents in one worktree (#21), rendering (#21), and per-step agent state.
