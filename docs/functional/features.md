---
id: "feature-catalog"
type: "functional"
owner: "pm"
status: "current"
updated: "2026-10-28"
links:
  - "glossary"
answers:
  - "Which data contracts under .agent-flow/ are frozen and validated?"
  - "What does core do with a decisions.jsonl file?"
  - "Which feature file pins the decisions.jsonl contract?"
  - "How is the time spent on a plan step computed and rounded?"
  - "Which step is the current step, and when is there none?"
  - "What does the snapshot give for an invalid or missing plan?"
decided_in:
  - "#32"
  - "#38"
---

# Feature catalog

> **One-liner**: The user-observable capabilities of the project, each with its behaviour and the scenarios that settle its acceptance.
> **Links**: [[glossary]] — the terms used below.

## Context

Every file the team writes under `.agent-flow/` is a contract between the roles
and the daemon. A contract is frozen when `core` can validate it against a
versioned schema, so a malformed record is reported instead of silently read.
This catalog lists those contracts as capabilities. Progress (what landed, what
is planned) lives in the issue tracker, not here.

## Decision / Specification

### Capability: frozen data contracts under `.agent-flow/`

Every file under `.agent-flow/` is validated against a versioned schema.

| Contract | Behaviour | Acceptance | Feature file |
|---|---|---|---|
| `plan.json` | Validated against its versioned schema; a valid sample is accepted. | `plan-contract` S1, S2 | `features/phase-0/plan-contract.feature` |
| `decisions.jsonl` | One JSON record per line. Each record is validated; a valid file is accepted; a malformed line never hides the valid lines around it. | `decisions-contract` S1, S2 | `features/phase-0/decisions-contract.feature` |

### Capability: reading a decisions log

| Input | Behaviour | Output |
|---|---|---|
| A valid `decisions.jsonl` | Every line is a decision. | All decisions are returned; no error. |
| A file with malformed lines | Each bad line is skipped on its own. | The valid decisions are returned, plus one error per bad line naming its line number. |

A bad line costs only itself: the rest of the log stays readable.

### Capability: writing a decision

| Input | Behaviour | Output |
|---|---|---|
| A valid decision | Serialized. | Exactly one line in the log. |
| An invalid decision | Refused. | No line is written; an error is returned. |

**Acceptance status**: the serializer behaviour is pinned by unit tests only; no
scenario in `decisions-contract` covers it yet (see Open questions).

### Capability: snapshot of the plan steps

Core builds one [[glossary]] snapshot from a worktree's `plan.json`: every plan
step with its time spent, and which step is the current step. The panel and the
daemon only display it; neither recomputes it.

| Situation of a step | Time spent |
|---|---|
| In progress | Now minus its start. |
| Done | Its end minus its start. |
| To do | None. |
| Timestamp missing, unreadable, without a time-zone offset, or giving a negative duration | None. |

- **Labels round down** to the minute, in four shapes: under a minute, minutes
  only, whole hours, hours and minutes. Examples: `< 1 min`, `38 min`, `1 h`,
  `1 h 15 min`.
- **Current step**: the in-progress step that started last; on a tie, the first
  in plan order. There is none when nothing is in progress.
- **Invalid or missing plan**: errors are returned and no steps; each error names
  the step and the field at fault.

Acceptance: `snapshot-steps` S1-S5 (`features/phase-2/snapshot-steps.feature`).

## Consequences / Constraints

- **MUST**: a step whose time cannot be trusted shows no time, never a guessed one.
- **MUST NOT**: v1 carry estimates or budgets for a step.
- **MUST**: a record that does not satisfy the decision schema is never written
  to `decisions.jsonl` and never returned as a decision.
- **MUST**: a bad line is reported with its line number, and does not stop the
  reading of the lines after it.
- **MUST NOT**: a reader returns a partial record as if it were valid.
- **Out of scope**: appending to existing files (#35); requests, responses and
  scope (#24); referential integrity between records (#39).

## Open questions / Gaps

- [ ] Serializer acceptance (valid → one line; invalid → no line and an error)
  has no Gherkin scenario; it is covered by unit tests only.
- [ ] Schema refusals are not pinned at scenario level: a missing required
  field, a value outside its enum, and an unknown field.
