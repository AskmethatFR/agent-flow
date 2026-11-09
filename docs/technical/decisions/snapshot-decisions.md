---
id: "snapshot-decisions"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-11-09"
relations:
  depends-on: ["snapshot-contract", "decisions-jsonl-schema"]
  related: ["snapshot-rpc", "host-adapter-boundary", "glossary"]
answers:
  - "How does the snapshot attach decisions.jsonl lines to plan steps, and what does a step expose of a decision?"
  - "What happens to a decision whose step names no plan step (cross-file integrity)?"
  - "How does a missing, unreadable or oversize decisions.jsonl show in the snapshot, and why is missing not an error?"
  - "What does the snapshot hold when plan.json is unusable and decisions.jsonl is present?"
  - "In what order are a step's decisions and the snapshot's errors given?"
  - "How many decisions does a step carry, and how does the snapshot say some were left out?"
  - "What does reading plan.json and decisions.jsonl separately not guarantee?"
decided_in:
  - "#39"
  - "#101"
---

# Snapshot decisions: per-step grouping, cross-file integrity, decisions-file failures

> **One-liner**: Each snapshot step carries its own `decisions`, in file order, `[]` when none. A line whose `step` names no plan step goes to no step and becomes one `ContractError`. A missing `decisions.jsonl` is not an error. Any other read failure is exactly one error and never removes a plan step. An unusable plan wins, and the decisions are not read.
> **Links**: [[snapshot-contract]] (additive-only rule `:38`, Unusable plan, cost bound, untrusted display text `:66`), [[decisions-jsonl-schema]] (reader, per-line errors, cap, whole-file bound; its `:66` cross-file item is settled here), [[snapshot-rpc]] (the daemon reads `decisions.jsonl` through its chain, `:116`), [[host-adapter-boundary]] (closed failure codes `:127`), [[glossary]] (`kind`). Consumers: #20 (step detail).

## Context

[[snapshot-contract]] froze the snapshot as additive-only and named #39 as the slice that adds decisions (`:38`). [[decisions-jsonl-schema]] left the cross-file `step` → `plan.steps[].id` integrity to #39 (`:66`). #20 must show a step's decisions without a lookup in the panel, because the panel never computes.

Corrected here, not edited there (closed records):
- `snapshot-contract.md:41` says `decisions` is "accepted and ignored until #39". It is now read under the rules below.
- `snapshot-rpc.md:91` residual (c) and gap `:125`: the daemon now reads `decisions.jsonl` through the same chain and bound as `plan.json` (`daemon/src/snapshot/read-agent-flow-file.ts:51-55`). This applies `snapshot-rpc.md:116` and adds no residual to the chain.
- `decisions-jsonl-schema.md:66` lists cross-file integrity as out of scope. It is settled by the Orphan row below.

## Decision / Specification

| Concern | Decision | Rationale |
|---|---|---|
| Placement | one additive per-step field `decisions`, no top-level field | a step reader needs no lookup; additive under `snapshot-contract.md:38`, and no frozen field moves |
| Frozen fields | per decision: `title`, `why`, `rejected`, `role`, `confidence`. A `rejected` that the file omits is `[]`, never `null` or omitted. A step with no decision has `[]` | the step-detail fields; an absent and an empty `rejected` mean the same, so there is one representation |
| Cap per step | a step keeps its first `MAX_DECISIONS_PER_STEP` (50) decisions in file order. The other lines of that step are dropped from `decisions` and counted in one additive per-step field `omittedDecisions` (a number, `0` when nothing was dropped, never omitted or `null`). The cap is per step: an over-cap step never shortens another step | Security S1 of #20 (CWE-770, A04): thousands of records for one step rendered thousands of nodes on every poll. Core counts, so the panel renders one marker and computes nothing. Same idea as `MAX_ERRORS` in `capErrors` |
| Not exposed | `at`, `kind`, `model`, `step` | no placeholder ships before its slice (`snapshot-contract.md:38`); adding one later is additive |
| Membership | every schema-valid line is a decision, whatever its `kind` | "one line per decision" (`docs/plan.md:67`); the `decision`/`step_event` boundary is still open in [[glossary]] |
| Order | file (append) order within a step | `at` is format-free (`decisions-jsonl-schema.md:39`); append order is write order |
| Bad line | the reader's own per-line `ContractError` (1-based line, cap, flood guard) goes into `snapshot.errors`; valid lines are still grouped | the [[decisions-jsonl-schema]] reader applies unchanged |
| Orphan | a valid line whose `step` names no plan step joins no step and is reported as one `ContractError` on `decisions.jsonl`, with its line, `field` `step` and a fixed message. Orphan errors are capped on their own | a line is never dropped silently; a separate cap keeps the reader's cap marker last in its own list |
| `decisions` absent or `missing` | every step `decisions: []`, no error | having no decision logged yet is the normal state, because the appender creates the file on its first write |
| `unreadable`, `too-large` | steps kept with `decisions: []`; one `ContractError` on `decisions.jsonl` with the same fixed message as for `plan.json`, `location` and `field` `null` | closed codes, no host text ([[host-adapter-boundary]] `:127`); a decisions failure never hides the plan |
| Unusable plan | exactly the [[snapshot-contract]] "Unusable plan" row: decisions are not read, and only plan errors are reported | there is no step to attach to, and every line would be an orphan |
| Error order | plan errors, then decisions read errors, then orphan errors | stable and line-ordered within each source |
| Line locations | the JSONL reader keeps each record's line internally. The located decisions reader is internal to core, and `readDecisions` keeps its public output | the file is parsed once; mirrors the internal plan reader ([[snapshot-contract]] Plan reading row) |
| Cost | one pass over the decisions into a map seeded with the plan step ids | linear, per [[snapshot-contract]]'s cost bound |

### Known limits (stated by Security on #39, not defects)

| Limit | Effect | Why it stands |
|---|---|---|
| `plan.json` and `decisions.jsonl` are two separate reads | a plan edit landing between them can produce spurious orphan errors for one build | every poll re-reads both (`snapshot-rpc.md:56`); the writers offer no joint snapshot of the two files |
| one whole-file bound on `decisions.jsonl` | a file over `MAX_TEXT_LENGTH` (1 MiB; the host refuses past 4 × that as `too-large`) drops every step's decisions behind one error | the [[decisions-jsonl-schema]] whole-file rule (`:45`) and the [[snapshot-rpc]] read bound; there is no partial or streaming read |

### Considered and rejected

| Option | Why rejected |
|---|---|
| A top-level decisions list keyed by step | the panel would have to look each step up, and the panel never computes |
| Sorting a step's decisions by `at` | `at` is format-free, so the order would depend on the host |
| Keeping only `kind: decision` lines | contradicts "one line per decision"; the kind boundary is open |
| `missing` reported as an error | a fresh worktree with no logged decision would always show an error |
| Dropping orphan lines silently | hides an agent's mistake |
| One cap over the reader's errors and the orphan errors together | buries the reader's cap marker in the middle of the list |
| A plain object keyed by step id | agent-written ids such as `__proto__` or `constructor` would collide with prototype keys |
| A sentinel entry at the end of `decisions` | it would break the five-field decision shape and force the panel to tell a marker from a decision |
| `omittedDecisions` as `null` when nothing was dropped | a count has a natural zero; one type, no null branch for the panel |
| Reporting dropped decisions as `ContractError`s | they are valid lines, not defects; a flood would fill `errors` and its own cap |
| A cap in the panel | the panel never computes, and the snapshot would still carry every record over the wire |

## Consequences / Constraints

- **MUST**: `steps[].decisions` and its five fields fall under the additive-only rule of [[snapshot-contract]]. Exposing `at`, `kind`, `model` or `step` later is additive.
- **MUST**: `steps[].omittedDecisions` falls under the additive-only rule of [[snapshot-contract]] too.
- **MUST**: every decision line ends up in exactly one step's `decisions`, in exactly one step's `omittedDecisions` count, or in exactly one `ContractError`, never neither. A step's listed decisions plus its `omittedDecisions` equal the valid lines naming that step.
- **MUST**: a missing `decisions.jsonl` is never an error; any other read failure of it is exactly one error and keeps the plan steps.
- **MUST** (every consumer, #20 first): every decision field is agent-written display text; `snapshot-contract.md:66` (Security S2) applies.
- **Out of scope**: rendering a step's decisions (#20), agent state (#40), an `at` format (still #24, `decisions-jsonl-schema.md:70`).

## Open questions / Gaps

- [ ] A joint `plan.json` + `decisions.jsonl` read without the one-build orphan window: not scheduled.
