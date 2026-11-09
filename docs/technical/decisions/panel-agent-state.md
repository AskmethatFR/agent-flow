---
id: "panel-agent-state"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-11-09"
relations:
  depends-on: ["snapshot-agent-state", "snapshot-agent-status-read", "host-adapter-boundary", "snapshot-contract", "snapshot-rpc"]
answers:
  - "How does the panel render the current agent, and why are its role and state two separate elements?"
  - "What does the panel show for an unknown state and for no current agent?"
  - "Does the panel map, label or colour a display state?"
  - "Where is the panel's no-SDK, no-status-mapping rule enforced?"
  - "Which tie, error-detail and push questions left to #21 are settled, and how?"
  - "Which residuals of the agent-state display are known and accepted?"
decided_in:
  - "#21"
---

# Panel agent state: role and state as two elements, no mapping in the panel

> **One-liner**: The panel shows the current agent on the current step only, right after the `Current` marker, as two text elements: `Agent: <role>` (sanitised display text) then the bare display state as it arrived on the wire. It adds no label, colour or icon per state, renders nothing when `currentAgent` is `null`, and refreshes through the existing poll. A boundary test keeps every SDK call and status mapping out of the panel.
> **Links**: [[snapshot-agent-state]] (display-state set and `null` rule `:44`, `error` → `stopped` `:45`, closed set `:74`, role is display text `:77`), [[snapshot-agent-status-read]] (tie `:45`), [[host-adapter-boundary]] (push left to #21 `:82`, panel never computes `:128`), [[snapshot-contract]] (untrusted display text `:66`), [[snapshot-rpc]] (wire schema). Scenario file: `features/phase-2/agent-state.feature` (S1-S3).

## Context

#40 and #41 put `currentAgent: { role, state } | null` on the snapshot and its wire (`panel/shared/snapshot-rpc.ts:34-35`, a closed `z.enum`). #21 renders it. The tech spec asked for one line, `Agent: <role> (<state>)`. The role is free text an agent writes in `plan.json`, so in that one line a role of `dev-a (running)` forges the state (Security S1). This node records the layout that replaced it.

Corrected here, not edited there (closed records):
- `snapshot-agent-state.md:45` ("its detail belongs to #21"): the `error` detail is not on the wire, and #21 shows such an agent as `stopped` with no detail. A detail needs a new wire value, which is a new node superseding [[snapshot-agent-state]] (`:74`).
- `snapshot-agent-state.md:78` and `snapshot-agent-status-read.md:31` (tie and rendering left to #21): rendering needs no tie rule of its own. The panel shows the one `currentAgent` the snapshot carries, so the #41 tie stands.
- `host-adapter-boundary.md:82` ("push via `agents.subscribe` … #21 decides") and `:136`: #21 keeps the panel poll (`panel/client/use-snapshot-polling.ts:5`). Push stays unused.
- `host-adapter-boundary.md:128` (#21 AC4): the rule is now enforced by `panel/client/boundary.test.ts` (Decision, Guard row).

## Decision / Specification

| Concern | Decision | Rationale |
|---|---|---|
| Placement | on the current step only, right after its `Current` marker (`panel/client/plan-rail.tsx:31-37`) | `currentAgent` is the agent of the current step by construction ([[snapshot-agent-state]] Role source) |
| Layout | two text elements: `Agent: <role>`, then the state alone | the role is agent-written text and can contain anything; it never shares an element with the state, so it cannot forge it |
| Role text | passed through `toDisplayText` (`panel/client/display-text.ts:6`), as step roles are | `snapshot-contract.md:66` |
| State text | the wire value verbatim (`running`, `stopped`, `unknown`), in the foreground colour, with no label, colour or icon per value | a per-value label or colour is a status mapping, and the panel never maps (`host-adapter-boundary.md:128`); the wire `z.enum` is the only check the panel relies on |
| `unknown` | shown as the word `unknown` | it is a display state, not an absence |
| `currentAgent: null` | nothing rendered, no placeholder | `null` means there is no current agent (`snapshot-agent-state.md:44`); a placeholder would invent a state |
| Refresh | the existing snapshot poll | it meets S3 with no new host capability |
| Guard (AC4) | `panel/client/boundary.test.ts` scans the client's production files: imports limited to an allow-list; `useRpc` the only value taken from `@getpaseo/plugin/client`, checked on the syntax tree; no host or display status literal, case-insensitive, quoted or as an object key. Each pattern check has its own self-check table | the panel twin of `daemon/src/snapshot/boundary.test.ts`; a self-check stops a pattern from passing everything silently |

### Considered and rejected

| Option | Why rejected |
|---|---|
| One line `Agent: <role> (<state>)` (the tech spec) | a role can forge the state |
| A label, colour or icon per state | a status mapping in the panel |
| A placeholder when there is no current agent | invents a state the snapshot does not carry |
| Push through `agents.subscribe` | the poll already meets S3 |

### Known limits

| Limit | Effect | Why it stands |
|---|---|---|
| Guard scan root is `panel/client` only (`boundary.test.ts:7-14`) | `panel/shared`, `panel/index.client.tsx` and files reached by relative import from outside the folder are not scanned | deferred follow-up |
| Allow-list reads static imports only | a dynamic `import()` or `require` can reach the SDK unseen | deferred follow-up |
| A long role wraps | its last visual line can read like a state | deferred follow-up: one line for the role element (`numberOfLines={1}`) |
| `display-text.ts` strips a fixed set of unsafe code points | U+00AD, U+034F, U+3164 and U+FE00-FE0F pass and stay invisible | deferred follow-up |
| The status check is a pattern | it catches literals, not every way to map a status | a heuristic floor, not a proof |

## Consequences / Constraints

- **MUST**: the role and the state stay in separate elements; no agent-written text shares an element with the state.
- **MUST NOT**: label, colour or otherwise map a display state in the panel. A per-state presentation needs a value computed outside the panel.
- **MUST**: a new production file in the panel client passes `panel/client/boundary.test.ts`; widening its allow-list is a review point (Security lane).
- **Out of scope**: the `error` detail, per-step agent state, push refresh.
