---
id: "glossary"
type: "functional"
owner: "pm"
status: "current"
updated: "2026-10-27"
links:
  - "feature-catalog"
answers:
  - "What does a decision record mean in the business?"
  - "What do the kinds and confidence levels of a decision mean?"
decided_in:
  - "#32"
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

## Consequences / Constraints

- **MUST**: a term keeps this meaning in every scenario, report and code path
  that uses it.
- **MUST NOT**: a row here carry UI copy; user-facing strings live in the
  `.feature` files and the code.

## Open questions / Gaps

- [ ] The exact boundary between `decision` and `step_event` is not yet stated
  by a scenario; the definitions above are the working reading.
