---
id: "request-scope-contracts"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-10-31"
relations:
  depends-on: ["decisions-jsonl-schema", "scope-origin"]
  related: ["paseo-messaging", "host-adapter-boundary", "workspace-layout-core-boundary"]
answers:
  - "What is frozen in requests.jsonl, responses.jsonl and scope.json, and how is each versioned?"
  - "What charset and length bound a request or response id, and why is it frozen in the schema?"
  - "Why are request ids unique per file while response ids may repeat?"
  - "Why do requests and responses carry no provenance, tamper or widening-approval field?"
  - "Which glob dialect do scope.json path entries use (scope-origin open question)?"
  - "Which path entries does scope.json refuse, in which order, and with what error shape?"
  - "How do the three .jsonl contracts share line framing, error cap and flood guard?"
  - "What may the epic #6 scope matcher do, and never do, with a scope.json entry?"
decided_in:
  - "#24"
---

# Frozen requests, responses and scope contracts

> **One-liner**: `requests.jsonl`, `responses.jsonl` and `scope.json` are frozen v1 contracts versioned by `$id` (`urn:agent-flow:schema:{request,response,scope}:1`), validated by pure never-throwing core validators; ids are bounded to `^[A-Za-z0-9._:-]{1,64}$`; `scope.json` entries use a literal-first glob dialect (T5) behind six ordered refusal rules.
> **Links**: [[decisions-jsonl-schema]] (versioning, framing, error shape, cap and flood guard, inherited here unchanged), [[scope-origin]] (who writes `scope.json`, and what #24 had to freeze), [[paseo-messaging]] (the wake needs a bounded id), [[host-adapter-boundary]] (pure core, provenance outside the worktree), [[workspace-layout-core-boundary]] (where `core/src/contracts` lives).

## Context

Agents write `requests.jsonl` (`docs/plan.md:127`); the host's human-answer path appends `responses.jsonl`; a confined writer produces `scope.json` ([[scope-origin]]). Readers (daemon, panel, epic #6 drift detection, the Paseo wake) do not control the writers, so the shape froze at #24.

Settled here and not re-edited there (closed records): the glob dialect left open at `scope-origin.md:102`, and the "bounded charset and length" id that `messaging.md:77` and `:169` waited on. The schema subset now supports `pattern` and `boolean`; this does not reopen `decisions:1`, whose `MUST NOT` at `decisions-jsonl-schema.md:64` stands. Tightening that schema is a `decision:2`.

## Decision / Specification

| Concern | Decision | Rationale |
|---|---|---|
| Versioning | version in `$id` only, `…:1`; a change is a new `$id` | [[decisions-jsonl-schema]] precedent |
| Field sets | the `docs/plan.md:110` and `:114` drafts, verbatim; strings `minLength: 1`; `additionalProperties: false`; field sets live in `schemas/*.schema.json`, not restated here | writers and readers key on the draft names |
| Request `type` | closed enum of the four deviation/question types (`docs/plan.md:117`) | a new type is a `request:2` |
| `blocking` | required boolean | Phase 4 stops on it (`plan.md:127`); optional would mean silently non-blocking |
| Id bound | request and response `id` match `^[A-Za-z0-9._:-]{1,64}$`, expressed as a schema `pattern` | the id becomes the wake `messageId` ([[paseo-messaging]]); a bound only in code would leave the frozen schema silent |
| Request id uniqueness | unique within `requests.jsonl`; checked after the schema, on schema-valid lines only; duplicate → `field: id`, `must be unique`, line not counted | it is the response correlation key; adding uniqueness later would break writers already emitting duplicates |
| Response id repetition | allowed | append-only answer log; which answer counts is Phase 4's rule |
| Provenance fields | none in any of the three files | provenance must not live in an agent-writable file (`scope-origin.md:89`) |
| `.jsonl` reading | one shared line reader (`core/src/contracts/jsonl.ts`) parameterised per contract; framing, one error per bad line, cap and flood guard exactly as [[decisions-jsonl-schema]]; the flood-guard minimum length is per contract, pinned by test | one DoS-hardened loop instead of three copies |
| `scope.json` shape | `issue` = `#<n>`, `paths` = array of entries; empty `paths` is schema-valid | "names the issue it derives from" (`scope-origin.md:58`); empty-versus-refusal is epic #6 story 1 (`scope-origin.md:104`) |
| `scope.json` error flow | size ceiling → not JSON → schema errors → path-entry errors only if the schema is clean; entry errors carry `location: paths[i]`, `field: paths`, a fixed message, never the entry text | `plan.ts` precedent; an echoed entry would carry agent text into errors |
| Public surface | validate-only (`validateRequests`, `validateResponses`, `validateScope`); no record reader, no serializer | no caller yet; a reader is an additive core API |

### Glob dialect T5 (decides `scope-origin.md:102`)

| Element | Meaning |
|---|---|
| separator | `/` only, repo-relative |
| `*` | any run of characters inside one segment |
| `**` | zero or more whole segments; valid only as a whole segment |
| every other character | literal: no `?`, `[]`, `{}`, `!` negation, `:` magic |

Neither minimatch nor gitignore: both give `!`, `[]` or `{}` a meaning an agent-influenced entry could exploit, and their semantics drift across versions.

### Path-entry rules (first failing rule per entry wins)

| Order | Refuses | Why |
|---|---|---|
| R1 | a `\` anywhere | one separator, no platform ambiguity |
| R2 | a leading `/` or a drive letter `^[A-Za-z]:` | absolute paths widen to the disk (`scope-origin.md:51`); so `a:b` is refused, `ab:c` is not |
| R3 | an empty, `.` or `..` segment | traversal and non-canonical forms |
| R4 | `**` glued inside a segment | the dialect has no partial `**` |
| R6 | a leading `!` or `:`, or any C0 or DEL control character | `!`/`:` are negation or magic prefixes in common matchers and pathspecs; control characters break logs, prompts and the panel |
| R5 | an entry made only of `*` and `/` | every all-wildcard entry is the bare `**` catch-all in disguise |

R6 sits between R4 and R5 in code (`scope.ts:48-57`); its order against R5 is unobservable, since no input can reach both.

### Considered and rejected

| Option | Why rejected |
|---|---|
| Path rules as a schema `pattern` | unreadable regex, the message leaks the regex, R5 needs look-aheads |
| Id bound checked in code only | the frozen schema would not carry the bound the wake depends on |
| minimatch or gitignore dialect | extra semantics on an agent-influenced string; version drift |
| `paths` on `out_of_scope` requests, provenance or widening-approval fields now | chosen by epic #6 stories 1-2; additive as `request:2` |
| Copying the decisions line loop per contract | three copies of a hardened loop and three times the mutation surface |

## Consequences / Constraints

- **MUST**: a change to any of these shapes is a new `$id` (`…:2`); a changed decision is a new node superseding this one.
- **MUST**: the epic #6 scope matcher implements T5 natively on the validated entry: literal by default, `*` in-segment, `**` whole-segment.
- **MUST NOT**: hand a raw entry to minimatch, picomatch, git pathspec or any other glob engine, or normalise, decode or resolve it before matching (Security carry-over, #24 barrier).
- **MUST**: the panel, prompts and logs output-encode `scope.json` entries and request text; a validated entry is still agent-influenced text.
- **MUST**: use a request id as a wake `messageId` only after `validateRequests` accepted its line.
- **MUST NOT**: put provenance, tamper or invoker evidence into these files; it lives in host state outside the worktree ([[scope-origin]]).
- **Out of scope**: writers and serializers, record readers, glob matching, drift detection (epic #6), which response counts (Phase 4).

## Open questions / Gaps

- [ ] `out_of_scope` request paths, widening-approval request type: epic #6 stories 1-2, as `request:2`.
- [ ] `at` as an ISO-8601 instant in these files: left `minLength: 1`, like `decision:1`.
