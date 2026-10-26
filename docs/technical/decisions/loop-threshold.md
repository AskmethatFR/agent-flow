---
id: "loop-threshold"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-10-26"
links:
  - "capture-events"
answers:
  - "Loop threshold: is \"3 identical failures\" enough, or do we also need a token-based threshold? (plan.md Q6)"
  - "What exactly counts as a loop for the Phase 5 detector, and from which facts is it computed?"
  - "Does the panel show a token figure next to the looping indicator?"
decided_in:
  - "#36"
---

# Loop threshold

> **One-liner**: A loop is the same test failing 3 consecutive runs with the same failure message, computed from verified test reports only; there is no token arm in v1.
> Ratification: ratified by the human on 2026-10-26 (#36), Option A.
> **Links**: [[capture-events]] (token evidence per runtime). Consumers: epic #6 (Phase 5 drift detection) stories 5, 6 and 7, and the Phase 6 `looping` state.

## Context

`docs/plan.md` open question 6 (`plan:209`) asks whether "3 identical failures" is enough or whether a token-based threshold is also needed. Phase 5 states the rule as "same test failing 3 times in a row" (`plan:128`) and the scenario as "the same test fails 3 times in a row with the same error, then the agent is marked as looping" (`plan:190-192`). Phase 6 shows `looping` as an issue state (`plan:129`).

The mockup adds a token arm. Its hint reads, in French, "Boucle signalée à 3 échecs identiques du même test ou 40 k tokens sans nouveau test vert." (`mock:74`); in English, "loop reported at 3 identical failures of the same test or 40k tokens without a new green test". An agent card also shows "14 k tokens depuis le dernier test vert" (`mock:292`). The mockup text is a French information reference only.

Evidence legend: `plan:N` = `docs/plan.md:N`, `mock:N` = `docs/design/agent-flow-mockup.html:N`, `ev:N` = `docs/technical/capture/events.md:N`, `CC:n` = `spikes/capture/claude-code/samples/events.jsonl:n`, `OC:n` = `spikes/capture/opencode/samples/events.jsonl:n`.

Facts that settle the question:

- The product is agent-agnostic: it must work with Claude Code and OpenCode v2 (`plan:21`).
- OpenCode exposes tokens: the bus events `session.step.ended` and `session.usage.updated` carry `tokens.input`, `tokens.output`, `tokens.reasoning`, `tokens.cache` (`OC:34`, `OC:35`). They fire once per model turn, not per plan step (`ev:79`).
- Claude Code hook payloads carry no token field (`CC:1-23`); the only route to tokens is the `transcript_path` file, which holds prompt and assistant text that must not be persisted (`ev:107`) and which the spike did not exercise, so that route is untested, not shown impossible.
- Facts from tools are kept apart from agent claims (`plan:18`). A "new green test" is not observable from capture events either (tool output text is not persisted, `ev:107`); it needs the Phase 3 verified test reports, the same input as the failure arm.
- v1 has no estimates or step budgets (`plan:20`, `plan:26`). Token dashboards are out of scope, while token counts may still be used internally for loop detection (`plan:28`).
- Epic #6 kill criterion, as written: "false-positive rate on provoked and normal runs makes the queue unusable -> reduce to the types that pass".

## Decision / Specification

**Answer (Q6)**: 3 identical failures alone are enough in v1: the same test fails 3 consecutive runs with the same failure message, and there is no token arm, neither "or 40k tokens without a new green test" nor "and a token value".

### Recommendation

| Item | Decision | Grounding |
|---|---|---|
| Threshold | N = 3 identical failures: the same test, 3 consecutive runs in which it executed, the same failure message | `plan:128`, `plan:191`, `mock:74` all say 3 |
| Counter | Keyed by (plan step, test id). Resets on a pass of that test or on a different failure message. A run in which the test did not execute neither counts nor resets | Keeps "identical" literal, and keeps the loop attached to the plan step where it happened (`plan:17`) |
| Input | Verified test reports only (Phase 3 parsers), never agent claims and never token counts | Verified versus declared (`plan:18`, `plan:126`) |
| Token arm | Not in v1 | `plan:28` allows the token arm; it is deferred, not excluded. Reasons not to commit it now: Claude Code hooks carry no token field (`CC:1-23`) and the transcript route is unexercised and risks persisting text (`ev:107`), so the arm would be native on OpenCode only (`OC:34-35`) unless that route is built, against the agent-agnostic rule (`plan:21`); research and architecture steps run no tests, so an arm keyed on "no new green test" would raise false positives against the epic #6 kill criterion; the arm's distinct coverage is the revisit trigger's case, a loop with no identical failures, and no evidence shows that case yet |
| UI | No token figure shown; this overrules the token counter on the mockup card (`mock:292`) | Token dashboards are out of scope (`plan:28`) |
| Revisit trigger | If the story 7 end-to-end shows a provoked loop that fails no test and stays undetected, a NEW node supersedes this one; this node is not amended | Defer the commitment until a case proves it; tokens stay allowed internally (`plan:28`) |

### Considered options

| Option | Verdict | Reason |
|---|---|---|
| 3 identical failures alone | Chosen | The only signal observable on both runtimes from verified facts; three sources agree on 3 |
| Mockup rule: 3 identical failures OR 40k tokens without a new green test | Rejected | Needs token counts Claude Code hooks do not carry; the second arm fires on steps that run no test |
| 3 identical failures AND a token value | Rejected | The same token dependency, and the extra condition delays or hides a loop the failure count already proves |
| A different count (2 or 5) | Rejected | Three sources agree on 3; 2 flags a normal fix-and-retry, 5 delays the signal with no evidence for it |

This record is a plain decision node, not an ADR: changing N or adding an arm later is additive, so it is cheap to reverse.

## Consequences / Constraints

- **MUST**: the detector counts consecutive identical failures of one test within one plan step and marks the agent `looping` at the 3rd.
- **MUST**: the detector reads verified test reports only.
- **MUST NOT**: the detector depends on a token count in v1, and the panel shows no token figure.
- **Out of scope**: the normalization rule that decides when two failure messages are "the same error" (story 5), the `plan.md` answer line (#37).

### Phase 5 candidate stories

| Story (epic #6) | Consequence |
|---|---|
| Story 5: loop detection at the #36 threshold | Implements the counter key, reset rule and N = 3 in `core`, fed by verified test reports; depends on the Phase 3 parsers (epic #4) |
| Story 6: panel indicators | Shows a `looping` indicator with no token figure |
| Story 7: end-to-end on provoked cases | The provoked loop is 3 identical failures of one test; the run also tests the revisit trigger with a loop that fails no test |
| Phase 6 `looping` state (`plan:129`) | Consumes the story 5 output as the issue state |

## Open questions / Gaps

- [ ] Message normalization for "same error" (paths, timestamps, line numbers) belongs to story 5.
- [ ] The `plan.md` answer line for Q6 is written by #37, not by this record.
- [ ] Whether a different failing test in the same step resets the counter is for story 5; the key above treats tests independently.
