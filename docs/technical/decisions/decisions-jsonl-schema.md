---
id: "decisions-jsonl-schema"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-10-27"
relations:
  depends-on: ["workspace-layout-core-boundary"]
  related: ["host-adapter-boundary", "decisions-serializer-semantics"]
answers:
  - "What is the frozen on-disk shape of decisions.jsonl (fields, enums, line framing, error shape)?"
  - "How is a .agent-flow/ persisted contract versioned, and where does the version live?"
  - "How does a reader frame one record (one JSON object per line) and name a bad line?"
  - "Which decisions.jsonl fields are required versus optional, and what are the kind and confidence enums?"
  - "Why are at, step and role non-empty strings with no format or enum validation?"
decided_in:
  - "#32"
---

# Frozen, versioned decisions.jsonl schema

> **One-liner**: `decisions.jsonl` is a frozen, versioned, line-delimited JSON contract: the version lives in the schema `$id` (`urn:agent-flow:schema:decision:1`), seven required fields and two optional, strict enums for `kind` and `confidence`, unknown fields rejected, one JSON object per line, and one `ContractError` per bad line naming its 1-based line.
> **Links**: [[decisions-serializer-semantics]] (the write side of the same contract), [[workspace-layout-core-boundary]] (where `core/src/contracts` lives), [[host-adapter-boundary]] (the pure-functions, nothing-throws rule these functions honor). Consumers: #35 (append), #39 (group by step), #24/#38 (sibling contracts).

## Context

`decisions.jsonl` records one decision per line (`docs/plan.md:67`); the record shape is `docs/plan.md:98-105`. #32 froze the schema and its reader/serializer so later writers (#34, #35) and readers (daemon, #39) cannot break a file they do not control. The graph had no node settling this contract before #32 — #23 froze `plan.json` the same way and is the governing precedent, not an ADR in its own right. This record fixes the data-model shape so the team does not re-derive it.

## Decision / Specification

| Concern | Decision | Rationale |
|---|---|---|
| Versioning | `$id: urn:agent-flow:schema:decision:1`; no `version` field in the data | #23 precedent (`plan.schema.json:3`): the id is the version marker; a data field would diverge |
| Required fields | `at`, `step`, `role`, `kind`, `title`, `why`, `confidence` | AC1 verbatim; writers (#34/#35) and readers (#39) key on these names |
| Optional fields | `rejected: string[]` (items non-empty), `model: string`; either may be omitted; an empty `rejected` array is valid | `docs/plan.md:101` (`"rejected":[…],"model":"sonnet"`) |
| Unknown fields | `additionalProperties: false` | boundary defense: an unknown key is a schema violation, never silently dropped |
| `kind` | enum `decision \| step_event \| question \| deviation` | `docs/plan.md:104` |
| `confidence` | enum `high \| medium \| low` | `docs/plan.md:105` |
| `at`, `step`, `role` | `type: string, minLength: 1` — no `format`, `pattern` or enum | #23 precedent (`plan.schema.json:19,21,24-25`); `schema-subset` refuses `format`/`pattern` by design (`schema-subset.test.ts:6-14`); tightening is deferred (#38/#24) |
| Framing | one JSON object per line; split on `\n`; exactly one trailing empty segment (the terminal newline) is dropped; an interior blank line is an error, not a silent drop; a trailing `\r` is tolerated as JSON whitespace (CRLF parses) | `docs/plan.md:67` "one line per decision"; #35 appends one line |
| Error shape | one `ContractError` per bad line — the first parse failure, or the first schema violation; `location` = the 1-based line number, `field` = the first violated property (or `null`), `message` from the validator | AC3 "one error per bad line … naming the line number"; #24/#39 consume it |
| Valid lines | every valid line is returned as a decision, regardless of how many other lines error | AC2; a malformed line must not hide the valid ones |
| Error cap | errors are capped at `MAX_ERRORS` (100) plus one marker line; a bad line beyond the cap is still reported, never silently accepted | `capErrors` (`contract-error.ts`); a flood must not erase the signal |
| Flood guard | once the error cap is reached, the reader skips lines too short to be a valid record (`MINIMUM_RECORD_LENGTH` = 91, the shortest schema-valid line) so a flood of short garbage cannot hide a later valid decision; the cap marker is still emitted | differential fuzz (3000 inputs vs an unfiltered reference) showed byte-identical messages and locations before the cap |
| Whole-file bound | reject `text.length > MAX_TEXT_LENGTH` before parsing; no per-line size limit | mirrors `plan.ts`; the host's outer `4 × MAX_TEXT_LENGTH` read bound is the envelope (`host-adapter-boundary.md`) |

### Considered and rejected

| Option | Why rejected |
|---|---|
| A `version` field inside each record | #23 puts the version in `$id` only; a data field would diverge |
| ISO-8601 `format` on `at`, closed vocabulary on `role` | `schema-subset` refuses `format`/`pattern` (`schema-subset.test.ts:6-14`); tightening is a backward-compatible #38/#24 change, not this slice |
| BOM stripping | not required by any AC; strictness (line 1 errors) is simpler and mirrors #23 |
| Duplicate-key detection | `JSON.parse` last-wins, matching `plan.ts`; a duplicate-key-detecting parser is a later concern |
| `maxLength` on content fields | no AC requires it; the whole-file bound is the single envelope |
| Canonical key ordering | reader is order-agnostic; fingerprinting is a later concern |
| Per-line size limit beyond the whole-file cap | redundant while the whole-file bound applies |

## Consequences / Constraints

- **MUST**: a new schema version is a new `$id` (`urn:agent-flow:schema:decision:2`), never an edit of `decision:1`; a changed decision is a new ADR superseding this one.
- **MUST**: any writer of `decisions.jsonl` emits exactly these seven required keys and no unknown key.
- **MUST**: a reader reports one error per bad line with a 1-based `location`, and returns every valid line.
- **MUST NOT**: add `format`/`pattern`/`maxLength` to this schema (the validator refuses them); tightening `at`/`role` is a #38/#24 change, not an edit here.
- **MUST NOT**: tolerate a BOM, detect duplicate keys, or apply a per-field length cap — each matches `plan.json` behavior today.
- **Out of scope**: appending (#35), `requests.jsonl`/`responses.jsonl`/`scope.json` (#24), cross-file `step` → `plan.steps[].id` integrity (#39).

## Open questions / Gaps

- [ ] `at` ISO-8601 format and `role` closed vocabulary — #38/#24.
- [ ] BOM stripping, duplicate-key detection, `maxLength`, canonical key ordering — dropped, no ticket yet.
- [ ] Per-line size limits beyond the whole-file cap — dropped; the whole-file bound stands alone until a consumer needs finer control.
