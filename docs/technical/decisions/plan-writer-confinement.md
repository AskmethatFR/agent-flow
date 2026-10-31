---
id: "plan-writer-confinement"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-10-31"
relations:
  depends-on: ["host-adapter-boundary", "workspace-layout-core-boundary"]
  related: ["capture-events", "snapshot-contract"]
answers:
  - "How does the capture side write .agent-flow/plan.json, and what contract do #14 and #15 code against?"
  - "How is the plan writer confined to <worktree>/.agent-flow, and against which path tricks?"
  - "Why is plan.json replaced by rename, and what may a reader of plan.json assume?"
  - "What does the plan writer deliberately not guarantee (durability, races, concurrent writers)?"
decided_in:
  - "#34"
---

# Plan writer: confinement and atomic replace

> **One-liner**: One synchronous, never-throwing `applyStepEvent(worktree, event): ValidationResult` at `@agent-flow/capture-shared/plan-writer` serves both runtimes; it derives its only target from the worktree, opens nothing through a link, and replaces `plan.json` by rename so a reader always sees an old or a new whole file, never a partial one.
> **Links**: [[host-adapter-boundary]] (`:127` closed failure set, `:131` confinement rule, `:132` read bound — applied here to a capture writer), [[workspace-layout-core-boundary]] (subpath-only package access), [[capture-events]] (`:108` write only under `.agent-flow/`), [[snapshot-contract]] (the host-side reader of `plan.json`). Consumers: #14 (Claude Code), #15 (OpenCode), #18 (daemon reader).

## Context

`host-adapter-boundary` states the real-path / no-follow / regular-file rule for the **host**; nothing stated it for the **capture writer**, though both must stay inside `<worktree>/.agent-flow/`. The step transition itself is core's (`@agent-flow/core/lifecycle`, #33): it validates the current plan and reads back the result. The writer is the imperative shell around it — read, transition, write — so it lives in `capture/shared`, not in `core`.

## Decision / Specification

### Contract (frozen for #14 / #15)

| Concern | Decision | Rationale |
|---|---|---|
| Surface | `applyStepEvent(worktree, event)`, `event = { kind: 'start' \| 'finish', stepId, at }`; result is core's `ValidationResult`; reached only as `@agent-flow/capture-shared/plan-writer` | one implementation for both runtimes; callers already read the `accepted / errors` shape; `at` is caller-supplied (host clock rule) |
| Sync | `node:fs` `*Sync` only | #14 is a one-shot hook process that must exit 0 silently; no intra-process interleaving in the race analysis |
| Never throws | every failure, including a non-object event, is a refusal value | mirrors core (`host-adapter-boundary` `:126`) |
| Errors | closed set, fixed messages labelled `plan.json`; a lifecycle refusal is returned verbatim; never raw `error.message` or a path | `host-adapter-boundary` `:127`. The wording is not frozen: no consumer branches on it |
| Missing files | absent `.agent-flow` is created, then the call is refused; absent `plan.json` is refused | the writer never creates a first plan (#12) |
| Seam | `createPlanWriter(io)` takes the fs primitives for fault injection; not exported from the module's `index.ts` | AC2 provable on real I/O with one injected fault, without widening the frozen surface |

### Confinement chain

| # | Step | Refuses |
|---|---|---|
| 1 | worktree is a string, absolute, with no `.` or `..` segment; then `realpath` | relative paths, traversal, unresolvable roots |
| 2 | `<realWorktree>/.agent-flow` must `lstat` as a directory | a symlinked or non-directory `.agent-flow` |
| 3 | `plan.json` opened `O_RDONLY \| O_NOFOLLOW \| O_NONBLOCK`; `fstat` must be a regular file | a linked `plan.json` (ELOOP); a FIFO or directory without hanging |
| 4 | read capped at `4 × MAX_TEXT_LENGTH + 1` bytes from the open descriptor; one byte over → refused | oversize, including a file grown after open (no `fstat.size` gate) |
| 5 | temp `.plan.json.<uuid>.tmp` in the same directory, `O_CREAT \| O_EXCL`, mode = original `& 0o777` (umask applies) | a planted temp name or link; widening the plan's permissions |
| 6 | full write loop, `fsync`, close | a crash leaving an empty or torn file |
| 7 | `realpath(.agent-flow)` must still equal the checked path | a directory or ancestor swapped to a link mid-write |
| 8 | `rename(temp, plan.json)`; on any failure from 5 to 8, unlink only a temp this call created | a `plan.json` swapped to a link after the read is replaced, never followed |

### Reader contract

| Rule | Consequence |
|---|---|
| `plan.json` changes only by rename over the entry | a reader (#18) sees the previous or the new whole file; no reader lock, no retry protocol |

### Stated residuals

| Residual | Why accepted | Owner |
|---|---|---|
| No directory `fsync` after rename | a power loss can lose the last event, never corrupt the file; not an AC | none |
| TOCTOU window between step 7 and step 8 | Node has no `openat`/`renameat`; the only racer is the same-uid agent that can already write the worktree | none |
| Concurrent writers can lose an update (read-modify-write, no lock) | no concurrent event source exists yet | #14 / #15, where same-step events first coincide (`capture-events` `:97`) |
| Windows | `O_NOFOLLOW` absent; Linux and macOS only, as Paseo | none |

### Considered and rejected

| Option | Why rejected |
|---|---|
| Async `fs/promises` | adds interleaving to the race analysis; no consumer needs it |
| `realpath(plan.json)` + string-prefix containment | prefix bug class; construction-by-derivation needs no containment check |
| In-place `writeFileSync` | torn file on a mid-write failure |
| `fstat.size` pre-check | stale after open (CWE-367); the capped read is the gate |
| Directory `fsync` | buys only last-event durability |
| Lock file | no concurrent writer yet |
| Writer in `core` | needs `node:fs`; core stays pure |

## Consequences / Constraints

- **MUST**: every capture write of `plan.json` goes through `applyStepEvent`; #14 and #15 add no second writer.
- **MUST**: any later `.agent-flow/*` replace-style writer follows the same chain (derived target, lstat directory, no-follow open, `O_EXCL` temp, fsync, re-check, rename).
- **MUST NOT**: export `createPlanWriter` from the module's public `index.ts`.
- **MUST**: `capture/shared/src` stays in the Stryker mutate set at the 100 bar: it is the confinement surface.
- **Out of scope**: hook and plugin wiring (#14, #15), initial `plan.json` creation (#12), `decisions.jsonl` appends.

## Open questions / Gaps

- [ ] Ordering or locking of concurrent step events — #14 / #15.
- [ ] `capture-events` `:72` calls the shared writer "append-only" (spike recorder); true for `decisions.jsonl`, not for `plan.json`, which this node governs.
