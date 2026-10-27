---
id: "decisions-serializer-semantics"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-10-27"
relations:
  depends-on: ["decisions-jsonl-schema"]
  related: ["host-adapter-boundary"]
answers:
  - "What must serializeDecision guarantee about the exact emitted bytes, and why?"
  - "Why does the serializer validate the escaped output line by reading it back, and why does it never throw?"
  - "Is a toJSON that substitutes a different but valid record accepted?"
  - "What always holds for a serialized decisions.jsonl line (one line, no raw line separators, bounded length)?"
decided_in:
  - "#32"
---

# Serializer emitted-bytes semantics

> **One-liner**: `serializeDecision` guarantees the exact emitted line, not just the input value: it stringifies, escapes the line-separator characters `JSON.stringify` leaves raw, and validates the escaped line by reading it back — it never throws, never emits an invalid line, and emits exactly one line with no raw `\n`, `\r`, U+2028, U+2029 or U+0085.
> **Links**: [[decisions-jsonl-schema]] (the schema the emitted line must satisfy), [[host-adapter-boundary]] (pure, never-throwing core functions). Consumer: #35 (append uses the serializer).

## Context

#23 gave the team a *reader* (`validatePlan` validates input text). #32 is the first place the team fixed what a *writer* may emit. The serializer is the write boundary for `decisions.jsonl`: #35 appends through it, so "no invalid line ever written" is a contract, not a nicety. Two facts make read-back validation necessary rather than defensive ceremony: `JSON.stringify` escapes `\n`, `\r` and control characters but leaves U+2028/U+2029 raw on Node 22, and a hostile object's `toJSON` can substitute output that differs from what was validated.

## Decision / Specification

| Concern | Decision | Rationale |
|---|---|---|
| Emitted bytes are the contract | `serializeDecision` validates the EXACT emitted line, not just the input value: stringify → escape U+2028/U+2029/U+0085 → bound the length → `JSON.parse` the escaped line → validate the parsed document against the schema → only then accept and return the line | the thing that gets written is the line, so the line is what must be valid; a validated input can stringify to a different (or invalid) record via a hostile `toJSON` |
| `toJSON` substitution | a `toJSON` that substitutes a different but VALID record is accepted | the contract is "the written line is a valid decision"; which valid record it is does not matter. A substitution to an INVALID record is caught by the read-back |
| Never throw | `serializeDecision` returns `{ accepted: false, error }` for non-serializable or invalid input; it never throws | `host-adapter-boundary.md`: core functions never throw; hostile input is a value, not an exception |
| One line | the emitted line contains no raw `\n`, `\r`, U+2028, U+2029 or U+0085 — the three separators that `JSON.stringify` leaves raw are escaped explicitly | `decisions.jsonl` is line-delimited; a raw line separator would split one record into many |
| Length bound (F5) | the serialized line is bounded at `MAX_TEXT_LENGTH - 1`, so the line plus its trailing newline stays within the reader's whole-file guard; an over-long line is rejected, never truncated | a truncated line would be an invalid record; the bound keeps the written line readable by the reader |

### Considered and rejected

| Option | Why rejected |
|---|---|
| Trust `JSON.stringify`'s escaping without read-back | falsified on Node 22 (U+2028/U+2029 stay raw); and a `toJSON` can substitute a different record |
| Validate only the input object (the #23 reader pattern) | wrong contract for a writer: the emitted bytes, not the input, are what a reader parses |
| A defensive post-assertion that the line has no newline | dead code the mutation gate flags; the read-back parse is the actual check |
| Truncating an over-long line | produces an invalid record |
| Canonical key ordering in the output | reader is order-agnostic; fingerprinting is a later concern |

## Consequences / Constraints

- **MUST**: a writer appending to `decisions.jsonl` (#35) emits exactly one line with no raw line separator, produced by `serializeDecision`.
- **MUST**: `serializeDecision` never throws; every failure is `{ accepted: false, error }`.
- **MUST NOT**: truncate an over-long line, or write a line that fails the schema.
- **MUST NOT**: reject a `toJSON` that substituted a different valid record — "different" is not "invalid"; only "invalid" is rejected.

## Open questions / Gaps

- [ ] Canonical key ordering / fingerprinting of decisions — not decided.
- [ ] Whether #35 re-validates a line produced by `serializeDecision`, or trusts the serializer — #35.
