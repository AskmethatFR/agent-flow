---
id: "snapshot-contract"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-10-28"
relations:
  depends-on: ["host-adapter-boundary", "workspace-layout-core-boundary"]
  related: ["decisions-jsonl-schema", "feature-catalog"]
answers:
  - "What is the frozen shape of the snapshot core builds for a host, and how may it evolve?"
  - "How does a host hand core a plan.json it could not read (closed failure codes)?"
  - "When does an agent-written timestamp count as an instant, and why must it carry an offset?"
  - "What cost bound holds when core works over agent-written plan content?"
  - "Where is plan.json parsed for the snapshot, and why is that reader internal to core?"
  - "What must a snapshot consumer do with text that agents wrote?"
decided_in:
  - "#38"
---

# Core snapshot contract

> **One-liner**: `@agent-flow/core/snapshot` exposes one pure, never-throwing `buildSnapshot(files, now: Date)`; its output is a frozen, additive-only contract read by host and UI code core does not control; read failures enter as a closed set of codes; a timestamp gives time only as a whole, offset-bearing ISO-8601 instant; work over agent-written input stays linear.
> **Links**: [[host-adapter-boundary]] (pure-core rule, closed failure codes, host clock), [[workspace-layout-core-boundary]] (one folder per module, subpath export only), [[decisions-jsonl-schema]] (sibling contract; #39 joins it to the snapshot), [[feature-catalog]] (time-spent, label and current-step behavior: not restated here). Consumers: #18 (daemon), #19 and #42 (panel), #39, #40.

## Context

[[host-adapter-boundary]] planned `buildSnapshot`/`Snapshot` for #38 and required #38 to name the host read-failure codes (`:127`, `:132`). `schemas/plan.schema.json:24-25` leaves `startedAt`/`endedAt` format-free, so core needs its own rule for which text is an instant. The snapshot is read by the daemon (#18) and the panel (#19, #42), so its shape freezes at the first reader.

Corrected here, not edited there (the ADR is closed to amendment): `host-adapter-boundary.md:29` ("core today is one module") predates #32 and #38; its `planned` rows for #38 (`:55`, `:67`) record #25's point in time. The current core surface is the code: one `core/src/<module>/index.ts` per module.

## Decision / Specification

| Concern | Decision | Rationale |
|---|---|---|
| Entry | `buildSnapshot(files, now: Date): Snapshot`, synchronous, pure, never throws; an invalid `Date` gives in-progress steps no time, never an error | [[host-adapter-boundary]] `:61`, `:126`; `Date` is unit-unambiguous at the core-host seam |
| Frozen fields | top level: `issue`, `title`, `steps`, `currentStepId`, `errors`; per step: `id`, `title`, `role`, `status`, `origin`, `timeSpent`; `timeSpent`: `milliseconds`, `label`. Absence is `null`, never an omitted key | the panel displays without computing; `null` convention of `ContractError` |
| Evolution | additive only: a later slice adds fields (#39 decisions, #40 agent state); a frozen field is never removed, renamed, re-typed or nested; no placeholder field ships before its slice | a reader the slice does not control must never break |
| Not exposed | raw `startedAt`/`endedAt`; any estimate or budget | nothing displays raw timestamps; v1 has no estimates (#38 AC7) |
| Unusable plan | `issue`, `title`, `currentStepId` `null`, `steps` empty, one or more `ContractError` in the #23 shape | a partial plan is never shown as a whole one |
| Input | `{ plan, decisions? }`, each a file's text or `{ unavailable: <code> }`; `decisions` is accepted and ignored until #39 | the same file type serves `decisions.jsonl` with no type change |
| Failure codes | closed set `missing \| unreadable \| too-large`, each mapped by core to a fixed message on file `plan.json`, `location` and `field` `null`; `too-large` reuses the in-core size-guard text | [[host-adapter-boundary]] `:127` (no raw host error text), `:132` (oversize enters as a value) |
| Instant rule | text counts as an instant only when the **whole** string is `YYYY-MM-DDThh:mm`, optional `:ss` and 1-9 fraction digits, then `Z` or `±hh:mm`, and parses to a finite time; anything else gives no time | offset-less text parses in host local time, making core host-dependent; a bounded whole-string grammar keeps agent-written text out of open-ended parsing |
| Cost bound | work over agent-written plan content is linear in its size: each step's start is parsed once per build, never once per comparison | Security S1 (CWE-407): a crafted plan made the current-step scan quadratic; a ratio test pins the bound |
| Plan reading | a plan reader sits beside the plan contract (`core/src/contracts/plan.ts`) and `validatePlan` derives from it, so the plan is parsed once; the reader and its plan types are internal to core, not exported by `@agent-flow/core/contracts` | mirrors the `decisions.jsonl` reader; no consumer outside core |

### Considered and rejected

| Option | Why rejected |
|---|---|
| Validate, then parse the plan again in the snapshot | two parses; the plan shape cast outside the contract module |
| Export the plan reader from `@agent-flow/core/contracts` | no consumer outside core |
| `plan?: string`, absent meaning missing | cannot express unreadable or too-large, which [[host-adapter-boundary]] assigns to #38 |
| `now` as epoch milliseconds | unit ambiguity at the core-host seam |
| Accept offset-less timestamps | output would depend on the host time zone |
| Suffix-only check ("ends with `Z` or `±hh:mm`", spec D5) | admits unbounded agent-written text to the parser; tightened to the whole-instant rule by Security S1 |
| A start anchor (`^`) on the instant pattern for speed | a speed-only equivalent mutant the break-100 mutation gate cannot exclude; the whole-string check already bounds the match |
| Several in-progress steps as a contract error | the plan schema allows them; the current-step rule picks one ([[feature-catalog]]) |

## Consequences / Constraints

- **MUST**: a snapshot change is additive; removing, renaming or re-typing a frozen field is a new node superseding this one.
- **MUST**: a host hands core a read failure only as a code from the closed set, never as text or a thrown error; a new code is named by the slice that needs it (#41), never a free string.
- **MUST**: core derives time only from instants that pass the instant rule; no host-local reading.
- **MUST**: core work over agent-written content stays linear; no rule re-parses a field per comparison.
- **MUST** (every snapshot consumer: #19, #42, any host UI): text core copies from agent-written files is untrusted display text: render it as plain text, strip bidi and control characters, truncate it. Core passes it through verbatim (Security S2).
- **Out of scope**: `decisions.jsonl` content (#39), agent state (#40), daemon reads and RPC (#18), panel rendering (#19, #42), any `plan.json` schema change (frozen contract).

## Open questions / Gaps

- [ ] `plan.json` timestamps stay format-free in the schema; the instant rule is core's reading of them, so it does not close the `at` format gap of [[decisions-jsonl-schema]] (`:70`), which stays with #24.
