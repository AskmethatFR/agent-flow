---
id: "scope-origin"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-10-26"
links:
  - "capture-events"
answers:
  - "Where does `scope.json` come from: a section of the GitHub issue template, or written by the PM/Architect role? (plan.md Q5)"
  - "Which role writes `scope.json`, and which roles must never write it?"
  - "What scope does the out-of-scope detector compare against once a deviation is approved?"
  - "How is `scope.json` protected from an implementing role that widens its own boundary?"
decided_in:
  - "#36"
---

# Origin of scope.json

> **One-liner**: `scope.json` is derived from the `## Touches` section of the issue and written by a confined writer that reads the issue body, invoked by the role that runs `refine-ticket` (PM spawn or orchestrator); no implementing role and no Architect writes it.
> Ratification: ratified by the human on 2026-10-26 (#36), Option A.
> **Links**: [[capture-events]] (where capture output is written). Consumers: epic #6 (Phase 5 drift detection) stories 1 and 2, and ticket #24 (frozen `scope.json` schema).

## Context

`docs/plan.md` open question 5 (`plan:208`) asks where `scope.json` comes from: a section of the GitHub issue template, or written by the PM/Architect role. `scope.json` is "Expected files/paths for the issue" in the per-worktree `.agent-flow/` directory (`plan:62-71`, `plan:70`). Phase 5 diffs the changed files against it to raise an `out_of_scope` request (`plan:128`, `plan:185-188`, `plan:117`).

Evidence legend: `plan:N` = `docs/plan.md:N`, `mock:N` = `docs/design/agent-flow-mockup.html:N`, `ev:N` = `docs/technical/capture/events.md:N`. Issue bodies are cited as `#N body "<heading>"`.

Facts that settle the question:

- The question is half-answered already. The issue form declares a textarea `id: scope`, label "Expected scope paths", described as "feeds scope.json" (`.github/ISSUE_TEMPLATE/slice.yml:27-31`).
- The label is not the convention in force. 32 of 34 issues (#9 to #42, as of 2026-10-26) carry a `## Touches` section (for example #24 body "## Touches"); the other two, #11 and #13, carry "## Expected scope paths". Counted with `gh issue list --state all --limit 200`, matching a `## Touches` heading in each body of #9 to #42; #1 to #8 are epics and carry neither. Entries are backticked repo-relative paths or globs, sometimes followed by prose; at least one is a plain bullet (#18 body "## Touches": "- plugin manifest").
- Every ticket gets a `refine-ticket` pass whatever its work class: it produces `in-scope` and `out-of-scope` (the `project-manager` agent definition, task `refine-ticket`). The Architect runs on `new-feature` only; `quick-change` and `fix-bug` pipelines have none (agentic-team global CLAUDE.md, §0 triage table). `refine-ticket` may run inline in the orchestrator rather than as a PM spawn.
- Scope (the issue) and spec (the architecture) are already two distinct deviation types: `out_of_scope` and `out_of_spec` (`plan:117`).
- Facts coming from tools are kept apart from claims written by an agent (`plan:18`). An agent that writes its own boundary turns the boundary into a claim.
- Agents work inside the worktree and write `requests.jsonl` (`plan:127`), so any file in `.agent-flow/` an agent can write is an agent claim unless its provenance is checked.
- The `.agent-flow/` contracts are frozen in Phase 0; a change is a contract change (`.claude/CLAUDE.md:18`). `core` owns drift detection and host adapters hold no business rule (`.claude/CLAUDE.md:7-8`).

## Decision / Specification

**Answer (Q5)**: `scope.json` is derived from the issue's `## Touches` section and written by a confined writer that reads the issue body, invoked by the role that runs `refine-ticket` (PM spawn or orchestrator); the writer is confined to `.agent-flow/`, and the Architect and every implementing role never write it.

### Recommendation

| Item | Decision | Grounding |
|---|---|---|
| Source of truth | The issue's `## Touches` section: backticked repo-relative paths or globs, trailing prose ignored | Live convention in 32 of 34 issues (#9 to #42, as of 2026-10-26); `.github/ISSUE_TEMPLATE/slice.yml:27-31` already intends an issue section to feed `scope.json` |
| Writer role | Invoked by the role that runs `refine-ticket` (PM spawn or orchestrator): a writer confined to `.agent-flow/` writes `<worktree>/.agent-flow/scope.json` (epic #6 story 1). It runs only on an invocation by that role, never by the Architect or an implementing role, and rewrites the file when that role invokes it after Touches is amended. The writer's I/O (the issue read and the `.agent-flow/` write) sits on the agent-runtime side with the hooks and agent rules (`plan:124`), outside `core`, which is pure, and outside every host adapter (`.claude/CLAUDE.md:8`); the Touches parse and entry validation are pure `core` functions it calls (`.claude/CLAUDE.md:7`) | `refine-ticket` runs for every work class; the Architect is absent on `quick-change` and `fix-bug`; the placement keeps the GitHub read out of `core` and out of every host; only the I/O needs a home outside `core`: the parse and validation are testable without a host |
| Reading the issue | The writer reads `## Touches` from the issue body itself and does not take the list from the PM agent's output | The issue body is a tool-observed fact (`plan:18`); the PM agent's list is an agent claim, and a path for prompt injection from public issue text. Cost: this puts a GitHub read in the writer, which the Writer role placement keeps outside `core` and every host adapter |
| Entry validation | The writer refuses the write when an entry is an absolute path, contains a `..` segment, is empty, or is a bare `**` catch-all | An unvalidated entry can widen the boundary to the whole disk or the whole repo |
| Never writes or invokes it | Implementing roles (Dev, Dev-B, QA, Security) and the Architect | An implementer writing its own scope self-certifies, so scope stops being a verified boundary (`plan:18`); an implementer that invokes the writer itself launders the same self-certification through it |
| Tamper check | A change to `scope.json` not made by the writer on an invocation by the `refine-ticket` role raises a deviation; the content and the invoker are checked against state the host keeps outside the worktree | "Never writes or invokes it" is a rule, not an enforcement; an agent in the worktree can edit the file; any role can run the writer, so who wrote the file does not prove who asked for it |
| Issue binding | The writer takes the issue number from the worktree's issue binding, which the implementing roles cannot write, never from a free argument; story 1 chooses the binding | Each worktree runs its own ticket (`plan:22`); a free argument lets a run point the writer at another issue with a broader Touches |
| Widening rewrite | A rewrite after implementation has started that adds entries does not widen the detector scope: each added entry stays out until a human approves that entry through the host's human-answer path; a narrowing rewrite needs no approval | GitHub edit authorship cannot tell an implementing agent's `gh issue edit` of `## Touches` from the human's when both use the same account |
| Approved deviation | An approval lives in `responses.jsonl`. The detector scope is the `scope.json` paths, except each entry a widening rewrite added, which stays out until a human approves that entry through the host's human-answer path, plus the exact paths of approved `out_of_scope` requests, and only an answer that came through the host's human-answer path counts. `scope.json` is not mutated by an approval | The issue stays the single source; an approved path is not re-flagged, which protects the epic #6 kill criterion (false positives); agents can write `requests.jsonl` (`plan:127`), so provenance decides |
| Template drift | Epic #6 story 1 relabels `.github/ISSUE_TEMPLATE/slice.yml:30` from "Expected scope paths" to "Touches" and keeps `id: scope` | The template names a convention that is not in force; the file is outside the Touches of #36 |
| Constraint handed to #24 | Entries are repo-relative paths or `**` globs, the file names the issue it derives from, and the contracts leave room for the tamper reference, the invoker evidence and the answer provenance that stories 1 and 2 choose; none may live only inside an agent-writable `.agent-flow/` file | #24 freezes the schema; an agent can recompute a digest or forge a provenance field in a file it can write (`plan:127`) |

### Considered options

| Option | Verdict | Reason |
|---|---|---|
| Issue `## Touches` section, a confined writer reads it when the `refine-ticket` role invokes it | Chosen | Uses the artefact every work class has; the writer does not implement the work; the file exists in the worktree |
| Issue template form field alone, no writer | Rejected | Used by 2 of 34 issues, and a form field is not a file in the worktree, so the detector has nothing to read |
| Architect writes it from the spec `impacted-elements` | Rejected | Absent on 2 of 3 work classes; drift from the spec is already `out_of_spec` (`plan:117`), not scope |
| Host adapter derives it from GitHub through `gh` | Rejected | Puts a GitHub read in every host adapter, including a local one (`plan:5`), while the chosen writer keeps that read outside every host adapter; and lets a mid-run issue edit silently move the scope, while the chosen writer runs only when the `refine-ticket` role invokes it and no host polls the issue, and each entry a widening rewrite adds after implementation starts stays out until a human approves that entry through the host's human-answer path |
| The writer takes the Touches list from the PM agent's output | Rejected | An agent claim (`plan:18`) and a prompt-injection path from public issue text; the writer reads the issue body itself |
| Implementing role writes or extends its own `scope.json` | Rejected | Self-certification: the boundary becomes an agent claim (`plan:18`) |

This record is an ADR: it is structural (it shapes stories 1 and 2 and #24), costly to reverse (changing it re-plumbs a cross-role rule) and contestable (several tempting alternatives above).

## Consequences / Constraints

- **MUST**: the role that runs `refine-ticket` invokes the writer, and the writer rewrites `scope.json` when that role invokes it after Touches changes.
- **MUST NOT**: the Architect or any implementing role invokes the writer.
- **MUST**: the writer takes the issue number from the worktree's issue binding, which the implementing roles cannot write, never from a free argument; story 1 chooses the binding.
- **MUST**: the writer is confined to `.agent-flow/`, and the writer reads `## Touches` from the issue body itself.
- **MUST**: the writer's I/O (the issue read and the `.agent-flow/` write) sits outside `core` and every host adapter, on the agent-runtime side (`plan:124`); the Touches parse and entry validation are pure `core` functions it calls (`.claude/CLAUDE.md:7`).
- **MUST NOT**: the writer takes its list, or any text, from the PM agent's output.
- **MUST**: the writer refuses the write when an entry is an absolute path, contains a `..` segment, is empty, or is a bare `**` catch-all.
- **MUST**: a change to `scope.json` that was not made by the writer on an invocation by the `refine-ticket` role raises a deviation. The content and the invoker are checked against a reference the implementing roles cannot write: state the host keeps outside the worktree, such as a content digest or a record of each writer run and the role that invoked it; capture output alone does not qualify, since it is written under `.agent-flow/` (`ev:108`). Story 1 and story 2 choose the mechanism.
- **MUST**: an approved path counts in the detector scope only if it is the exact path the detector observed (never a glob), and the approval is an answer that came through the host's human-answer path.
- **MUST**: a rewrite after implementation has started that adds entries does not widen the detector scope: each added entry stays out until a human approves that entry through the host's human-answer path; a narrowing rewrite needs no approval.
- **MUST**: the out-of-scope detector uses the `scope.json` paths, except each entry a widening rewrite added, which stays out until a human approves that entry through the host's human-answer path, plus the exact paths of approved `out_of_scope` requests.
- **MUST NOT**: an agent-written approval line in `responses.jsonl`, or an `out_of_scope` request an agent filed itself with glob paths, widens the detector scope.
- **MUST NOT**: the Architect or any implementing role writes or edits `scope.json`.
- **MUST NOT**: an approval mutates `scope.json`.
- **MUST NOT**: the tamper reference, the invoker evidence, the start-of-implementation marker or the answer provenance lives only inside an agent-writable `.agent-flow/` file, where an agent can recompute a digest or forge a field (`plan:127`).
- **Out of scope**: the `scope.json` schema (#24), the writer and detector code (epic #6), the `plan.md` answer line (#37).

### Phase 5 candidate stories

| Story (epic #6) | Consequence |
|---|---|
| Story 1: rule and writer for `scope.json` | Implements the rule at `refine-ticket`: a writer confined to `.agent-flow/`, invoked only by the `refine-ticket` role and never by the Architect or an implementing role, that takes the issue number from the worktree's issue binding, reads the issue body itself and applies entry validation (absolute paths, `..`, empty entries and a bare `**` refused) through pure `core` functions; the re-write on Touches amendment; a tamper reference and an invoker record the implementing roles cannot write; and the relabel of `.github/ISSUE_TEMPLATE/slice.yml:30` to "Touches" |
| Story 2: out-of-scope files, diff versus `scope.json` | Compares changed files against `scope.json` plus approved `out_of_scope` paths, and leaves out each entry a rewrite added after implementation started until a human approves that entry through the host's human-answer path; counts an approval only for the exact paths observed and only when it arrived through the host's human-answer path; a `scope.json` change not made by the writer on an invocation by the `refine-ticket` role raises a deviation |
| #24: freeze requests, responses and scope contracts | The `scope.json` schema carries repo-relative paths or `**` globs and the source issue, and rejects absolute paths, `..` segments and bare `**` entries; the contracts leave room for the tamper reference, the invoker evidence and the answer provenance that stories 1 and 2 choose; none may live only inside an agent-writable `.agent-flow/` file |

## Open questions / Gaps

- [ ] Glob dialect for the `**` entries (minimatch-style versus gitignore-style) is for #24.
- [ ] The `plan.md` answer line for Q5 is written by #37, not by this record.
- [ ] Behavior when an issue has no `## Touches` section (empty scope versus refusal) is for story 1.
- [ ] A `## Touches` entry that is not backticked (live case: #18 lists "- plugin manifest") is refused at `refine-ticket` or flagged, never dropped silently: story 1 chooses.
- [ ] Where the tamper reference lives (a digest or write record the host keeps outside the worktree; capture output under `.agent-flow/` alone does not qualify, `ev:108`) is for stories 1 and 2.
- [ ] How the answer provenance is proven (a record the host keeps outside the worktree when its human-answer path writes `responses.jsonl`) is for stories 1 and 2; #24 leaves room for it.
- [ ] How the invoker evidence is produced (which record, kept by the host outside the worktree, shows that the `refine-ticket` role invoked the writer) is for story 1.
- [ ] What marks the start of implementation for the widening rule (for example the first implementing-role spawn the host observes) is for stories 1 and 2; the marker is host-observed, never read from an agent-writable `.agent-flow/` file.
- [ ] How a widening rewrite is approved: per exact path through the existing `out_of_scope` request (no #24 change) or through a new request type (#24 must make room); the request types today (`plan:117`) have no widening-approval type.
