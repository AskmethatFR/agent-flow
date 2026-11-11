---
id: "snapshot-facts"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-11-11"
relations:
  depends-on: ["snapshot-contract", "snapshot-decisions", "verified-facts"]
  related: ["snapshot-rpc", "decisions-jsonl-schema"]
answers:
  - "What is the shape of a fact in the snapshot, and where does it sit?"
  - "How does the snapshot derive declared facts from decisions.jsonl, and how many does a step carry?"
  - "In what order are a step's facts given, and where do verified facts go when they arrive?"
  - "What separates a fact's origin from the frozen step origin?"
  - "Which parts of the facts design were deferred, and to which slice?"
  - "Where does the issue-level CI fact sit in the snapshot, and why not on a step?"
decided_in:
  - "#109"
  - "#114"
---

# Snapshot facts: per-step shape, declared facts first

> **One-liner**: Each snapshot step carries a required `facts` list of `{ origin, source, label }`, `origin` being `verified` or `declared`. Today every fact is declared: one per decision the step keeps, `source` `decisions.jsonl`, `label` the decision title. Declared facts come first; verified facts append after them. The step's frozen `origin` is untouched. CI is the one issue-level fact: a top-level `ci`, `null` when absent (#114).
> **Links**: [[snapshot-contract]] (additive-only rule `:38`, cost bound `:44`, untrusted display text `:66`), [[snapshot-decisions]] (per-step bucket, cap `:43`, read failures `:49-51`), [[verified-facts]] (separator is the source, S4 `:86-91`; per-slice split `:126-131`), [[snapshot-rpc]] (wire mirror rule `:55`, `:114`), [[decisions-jsonl-schema]] (the source of every declared fact). Consumers: #110, #111 (verified producers), #113 (display).

## Context

[[verified-facts]] put the verified/declared separator in the snapshot as a per-fact `origin` inside `steps[].facts[]`, shape owned by #109 (`verified-facts.md:90`). No verified-fact producer exists yet (#110, #111). The only facts available today are declared: the decisions the snapshot already groups per step ([[snapshot-decisions]]).

Corrected here, not edited there (closed records):
- `verified-facts.md:127` and `:124` give #109 "an issue-level place for unattached facts and CI" and "lists the sixth `.agent-flow` file". #109 ships neither: see Deferred.
- `snapshot-rpc.md:55` pins type equality at `panel/shared/snapshot-rpc.test.ts:36-39`; it is now `:42-44`.

## Decision / Specification

| Concern | Decision | Rationale |
|---|---|---|
| Placement | one per-step field `facts`, after `omittedDecisions`, in core `SnapshotStep` (`core/src/snapshot/snapshot.ts:49`) and in the wire `SnapshotStepSchema` (`panel/shared/snapshot-rpc.ts:34`); no top-level field | additive under `snapshot-contract.md:38`; a step reader needs no lookup, as for decisions (`snapshot-decisions.md:41`) |
| Required | `facts` is always present, `[]` when empty, never `null` or omitted; the wire schema has no `.default` | the `omittedDecisions` precedent; a wire that defaults would hide a daemon/panel skew the type pin exists to catch |
| Fact shape | `SnapshotFact = { origin: 'verified' \| 'declared', source: string, label: string }` (`snapshot.ts:34-38`, `snapshot-rpc.ts:19-23`) | the minimum #113 shows: which side, from where, what. Extra metadata (`why`, `role`, `confidence`, instants) is not copied: the step's `decisions` already carry it, and no placeholder ships before its slice |
| Origin | fact-level `origin` only; the step field `origin: planned \| proposed` keeps its frozen meaning and type | `verified-facts.md:90`; `snapshot-contract.md:37`, `:62`; approved by the Security lane on #109 |
| Declared facts | one fact per decision the step **keeps** (`snapshot.ts:66-70`, `:85`): `origin` `declared`, `source` the `decisionsFile` constant (`:146`), `label` the decision title verbatim | one source of truth: a fact is a view of a kept decision, never a second parse of `decisions.jsonl` |
| Count | a step has at most `MAX_DECISIONS_PER_STEP` declared facts; no `omittedFacts`, no second cap | derived from the already-capped bucket; the dropped decisions are already counted in `omittedDecisions` (`snapshot-decisions.md:43`) |
| Empty and failures | `facts: []` when the step has no decision, when `decisions.jsonl` is absent, `missing`, `unreadable` or `too-large`; no step when the plan is unusable | the [[snapshot-decisions]] rows `:49-51` apply unchanged; facts add no error |
| Bad lines | a malformed or orphan line stays the reader's `ContractError` and yields no fact; derivation never throws | `buildSnapshot` never throws (`snapshot-contract.md:36`) |
| Order | declared facts first, in the step's decision order; step-level verified facts (#110, #111) append after them | "declared first" (`verified-facts.md:127`, #109); appending keeps every declared fact's position stable when a verified producer lands |
| Cost | one map over the capped bucket per step | linear, `snapshot-contract.md:44` |

### Deferred (frozen-surface ruling on #109)

| Element | Deferred to | Why not now |
|---|---|---|
| Issue-level place for unattached facts | #112 | no producer of an unattached fact exists yet; a placeholder field would freeze an unused shape (`snapshot-contract.md:38`) |
| CI fact (issue-level, keyed by head commit) | #114 | same: no CI producer yet |
| `omittedFacts` | #110 | only verified facts can exceed the decisions cap; the count is owed by the slice that makes it non-zero |
| Sixth `.agent-flow` fact file | #112 | the capture-side writer and reader own it; its Security-routing requirements are recorded in the Security lane's report on #109 |

### Issue-level CI fact (#114)

Closes the CI row above. Unattached facts stay deferred to #112. Parsing rules: [[verified-facts]] S9.

| Concern | Decision | Rationale |
|---|---|---|
| Placement | one top-level `ci: CiFact \| null` on `Snapshot`, beside `currentAgent` (`core/src/snapshot/snapshot.ts`); never on a step; `steps[].facts` is identical with or without a CI status | a check covers a commit, not a step (`verified-facts.md:85`); the panel reads one field and computes nothing |
| Shape | `CiFact = { origin: 'verified', source: string, headCommit: string, state: 'passed' \| 'failed' \| 'pending' }`; no `label`, no step id | `state` and `headCommit` stay machine-readable for the head comparison owed by #113/#115; `source` is a string, as on `SnapshotFact`, so another forge is additive |
| Absence | `null` when no status was given or it was refused, never an omitted key; the wire mirror `ci: CiFactSchema.nullable()` is required, with no `.default` (`panel/shared/snapshot-rpc.ts`) | `snapshot-contract.md:37`; the Required row above |
| Unusable plan | `ci` is read before the plan branch and kept when `plan.json` is unusable | keyed by commit, it needs no step; step reports, which need step ids, are skipped there |

### Considered and rejected

| Option | Why rejected |
|---|---|
| Replace `steps[].decisions` with `facts` | removes a frozen field (`snapshot-contract.md:62`) |
| Reuse the step `origin` for verified/declared | re-types a frozen field with another meaning |
| A fact referencing its decision by index | the panel would compute a lookup; the panel never computes |
| Copy every decision field into the fact | duplicates `decisions`; freezes metadata no consumer asked for |
| One fact per decision line, capped separately | a second cap and a second count for the same lines |
| `.default([])` on the wire `facts` | masks a missing field instead of failing the parse |
| CI as a `SnapshotFact` (`origin`, `source`, `label`) | needs a label nobody asked for and loses the machine-readable `state` and `headCommit` |
| A `ci` list keyed by commit | one status gives one commit; a list would be a placeholder |

## Consequences / Constraints

- **MUST**: `steps[].facts`, the top-level `ci` and their fields fall under the additive-only rule of [[snapshot-contract]]; the wire follows in the same change ([[snapshot-rpc]] `:114`).
- **MUST**: every fact with `origin: declared` is the view of exactly one kept decision of the same step; no declared fact without its decision, no kept decision without its fact.
- **MUST**: a verified fact is appended after the declared facts of its step; it never enters `decisions.jsonl` (`verified-facts.md:151`).
- **MUST** (every consumer, #113 first): `label` is agent-written display text for declared facts; `snapshot-contract.md:66` (Security S2) applies.
- **Out of scope**: verified-fact parsing (#110, #111, #114: [[verified-facts]]), the `gh` read (#115), the fact file and its reader (#112), display (#113).

## Open questions / Gaps

- [ ] The `source` value of each verified fact kind: owed to #110 and #111.
- [x] Where CI sits at issue level: top-level `ci` (#114, above).
- [ ] Where unattached facts sit at issue level: owed to #112.
