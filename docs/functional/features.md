---
id: "feature-catalog"
type: "functional"
owner: "pm"
status: "current"
updated: "2026-10-31"
links:
  - "glossary"
answers:
  - "Which data contracts under .agent-flow/ are frozen and validated?"
  - "What request types exist, and what makes a request or its id invalid?"
  - "May a request id be answered more than once?"
  - "Which scope.json path entries are refused?"
  - "What does core do with a decisions.jsonl file?"
  - "Which feature file pins the decisions.jsonl contract?"
  - "How is the time spent on a plan step computed and rounded?"
  - "Which step is the current step, and when is there none?"
  - "What does the snapshot give for an invalid or missing plan?"
  - "When capture records a step start or finish, what is written, where, and what is refused?"
decided_in:
  - "#32"
  - "#38"
  - "#24"
  - "#34"
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
| `requests.jsonl` | One request per line. Each request is validated; a valid file is accepted; a malformed line is reported by its line number and never hides the valid lines around it. | `request-contracts` S1, S2 | `features/phase-0/request-contracts.feature` |
| `responses.jsonl` | One answer per line, keyed by request id. A valid file is accepted; a malformed line is reported by its line number. | `request-contracts` S1, S2 | `features/phase-0/request-contracts.feature` |
| `scope.json` | The issue the work derives from plus the repo-relative paths it is expected to touch. A valid file is accepted; an unsafe path entry is rejected by the field `paths`. | `request-contracts` S1, S3 | `features/phase-0/request-contracts.feature` |

### Capability: requests, answers and scope

| Contract | Rule | Outcome |
|---|---|---|
| `requests.jsonl` | Each [[glossary]] request has a type: `question`, `added_step`, `out_of_scope` or `out_of_spec`; any other type is refused. It carries a `blocking` flag. Its id is bounded in length and unique within the file. | A request that breaks a rule is refused with an error naming its line. |
| `responses.jsonl` | Each answer names the request id it answers. The same id may be answered more than once: the log only grows, and a later answer never replaces an earlier one. | Several answers for one id are all valid. |
| `scope.json` | A scope path is repo-relative. Refused: an absolute path, one containing `..`, one containing a backslash, a bare catch-all such as `**`, one starting with `!` or `:`, one containing a control character. | The refusal names the field `paths`. |

A bad line costs only itself in both logs: the valid lines around it stay readable.
Nothing here checks that an answer's request id exists in `requests.jsonl` (see
Out of scope).

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

### Capability: recording a step start or finish in the plan

Capture applies a [[glossary]] step event (the start or the finish of a plan
step, at a given time) to a worktree's plan, and the [[glossary]] plan writer
stores the result in `<worktree>/.agent-flow/plan.json`. It serves both runtimes.

| Situation | Behaviour | Outcome |
|---|---|---|
| Start of a to-do step | The step becomes in progress since the event time. | The updated plan is written. |
| Finish of an in-progress step | The step becomes done with the event time as its end. | The updated plan is written. |
| The write itself fails | Nothing is replaced. | The previous plan stays intact. |
| The event does not fit the plan or the plan breaks its contract (unknown step, unknown status) | Refused. | Nothing is written; the error names the step at fault. |
| The target would land outside `.agent-flow` (a `..` path, `.agent-flow` or `plan.json` linked elsewhere) | Refused. | Nothing is written, inside or outside. |
| No `.agent-flow` directory | The directory is created, the plan is not. | Refused with an error saying the plan is missing; creating a first plan is not this capability (#12). |
| No `plan.json` in an existing `.agent-flow` | Refused. | Error saying the plan is missing. |
| A plan file that is oversized | Refused. | Error saying the plan is too large. |

A replaced plan keeps the access rights of the file it replaces.

Acceptance: `plan-writer` S1-S5 (`features/phase-1/plan-writer.feature`). The
failed-write, access-rights and oversized-plan rows are pinned by unit tests only.

## Consequences / Constraints

- **MUST**: a step whose time cannot be trusted shows no time, never a guessed one.
- **MUST NOT**: v1 carry estimates or budgets for a step.
- **MUST**: a record that does not satisfy the decision schema is never written
  to `decisions.jsonl` and never returned as a decision.
- **MUST**: a bad line is reported with its line number, and does not stop the
  reading of the lines after it.
- **MUST NOT**: a reader returns a partial record as if it were valid.
- **MUST**: a request type outside the four listed is refused, never coerced.
- **MUST**: a scope path that could point outside the repository, or that
  matches everything, is refused; an accepted scope lists only repo-relative paths.
- **MUST NOT**: a later answer erase or replace an earlier answer for the same
  request id.
- **MUST**: a plan that fails its contract is never written, and the previous
  plan survives any failed write.
- **MUST NOT**: the plan writer touch any file outside the worktree's `.agent-flow`.
- **Out of scope**: appending to existing files (#35); referential integrity
  between records, including an answer whose request id has no request (#39);
  creating the first plan (#12); the hooks that raise step events (#14, #15);
  decisions.

## Open questions / Gaps

- [ ] Serializer acceptance (valid → one line; invalid → no line and an error)
  has no Gherkin scenario; it is covered by unit tests only.
- [ ] Schema refusals are not pinned at scenario level: a missing required
  field, a value outside its enum, and an unknown field.
- [ ] `request-contracts` S3 pins only the absolute-path refusal. No scenario
  covers the other unsafe scope entries: a leading `!` or `:`, a control
  character, `..`, a backslash, a bare catch-all.
- [ ] No scenario pins the request id bounds (length, uniqueness within the
  file) or the repeated answer for one id.
