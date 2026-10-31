---
id: "glossary"
type: "functional"
owner: "pm"
status: "current"
updated: "2026-10-31"
links:
  - "feature-catalog"
answers:
  - "What does a decision record mean in the business?"
  - "What do request, request type, blocking, answer, scope and path entry mean?"
  - "What do the kinds and confidence levels of a decision mean?"
  - "What do snapshot, time spent and current step mean?"
  - "What do step event and plan writer mean?"
decided_in:
  - "#32"
  - "#38"
  - "#24"
  - "#34"
---

# Glossary — ubiquitous language

> **One-liner**: The business meaning of the terms the contracts use, so that the code, the scenarios and the reports say the same thing.
> **Links**: [[feature-catalog]] — the capabilities these terms serve.

## Decision / Specification

| Term | Business meaning |
|---|---|
| **decision** | One record of a choice an agent role made during a run, with its step, its role, the reason it was made and how sure the role was. |
| **decisions.jsonl** | The log of decisions for a run: one JSON record per line, kept under `.agent-flow/`. |
| **step** | The workflow step during which a record was written. |
| **role** | The agent role that wrote a record. |
| **kind** | What a record is about: `decision` (a choice made), `step_event` (something that happened in a step), `question` (something left open for someone to answer), `deviation` (a departure from the plan). |
| **confidence** | How sure the writing role is of a record: `high`, `medium` or `low`. |
| **rejected** | Optional: the alternatives that were considered and set aside. |
| **model** | Optional: the model that produced the record. |
| **plan step** | One step of the run's plan: it is to do, in progress or done, and carries a start and an end once it has them. Distinct from **step** above, which tags a record. |
| **snapshot** | The view of a run's plan computed once by core: every plan step with its time spent, and the current step. Consumers display it and never recompute it. |
| **time spent** | How long a plan step has taken: in progress, up to now; done, from start to end; to do, none. Also none whenever a timestamp cannot be trusted. Rounded down to the minute. |
| **current step** | The in-progress plan step that started last (first in plan order on a tie); none when nothing is in progress. |
| **step event** | The start or the finish of a plan step at a given time, as seen by capture. Not the `step_event` kind of a decision record, which is a log entry. |
| **plan writer** | The part of capture that applies a step event to a worktree's plan and stores the result in that worktree's `.agent-flow/plan.json`, and nowhere else. It never creates a first plan and never keeps a plan that fails its contract. |
| **request** | One record, in `requests.jsonl`, of something a role needs from outside the plan: a question, an added step, or work found out of scope or out of spec. Has an id, a request type and a blocking flag. |
| **request type** | What a request asks: `question` (something to answer), `added_step` (a step the plan lacks), `out_of_scope` (work beyond the scope), `out_of_spec` (work the spec does not cover). |
| **blocking** | Flag on a request: the work cannot go on until it is settled. |
| **request id** | The identifier of a request: bounded in length and unique within its file. Answers refer to it. |
| **answer** | One record, in `responses.jsonl`, replying to a request by its request id. A request id may collect several answers; none replaces another. |
| **scope** | What a run is expected to touch: the issue it derives from and a list of repo-relative paths, kept in `scope.json`. |
| **path entry** | One element of a scope's paths. Safe means repo-relative and specific; an entry that is absolute, climbs out of the repository, matches everything or looks like a command is unsafe and refused. |

## Consequences / Constraints

- **MUST**: a term keeps this meaning in every scenario, report and code path
  that uses it.
- **MUST NOT**: a row here carry UI copy; user-facing strings live in the
  `.feature` files and the code.

## Open questions / Gaps

- [ ] The exact boundary between `decision` and `step_event` is not yet stated
  by a scenario; the definitions above are the working reading.
