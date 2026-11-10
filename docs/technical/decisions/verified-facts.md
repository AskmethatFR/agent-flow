---
id: "verified-facts"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-11-10"
relations:
  depends-on: ["snapshot-decisions", "decisions-jsonl-schema"]
  related: ["loop-threshold", "capture-events", "real-issue-run"]
answers:
  - "Which tool outputs count as verified facts, and what are their report format, writer and location?"
  - "Does a tool report tie to a plan.steps[].id, and when is a fact attached to a step?"
  - "What happens to a report that matches no step?"
  - "What separates a verified fact from a declared one, and is that a frozen-contract change?"
  - "What does \"verified\" mean, and what is it not proof against?"
  - "Which facts feed the Phase 5 loop detector, and which slices does each fact kind change?"
  - "Does a step that ran no tool owe a verified fact?"
decided_in:
  - "#108"
---

# Verified facts: sources, capture-time step attachment, separator

> **One-liner**: No tool report names a plan step, so a verified fact is attached when the tool run ends, through `decisionStepOf(plan, role)` and the role that ran the tool. A report that finds no step is shown unattached, never dropped and never pushed onto the current step. The separator is the source, not a `decisions.jsonl` field. CI is an issue-level fact keyed by commit. The spike ends with a decision and a redesigned split, not "inconclusive".
> **Links**: [[snapshot-decisions]] (orphan rule `:48`), [[decisions-jsonl-schema]] (frozen fields), [[loop-threshold]] (counter key `:48-49`, input `:50`), [[capture-events]] (step events), [[real-issue-run]] (evidence and scan rule `:94-96`). Consumers: epic #4 slices #109 to #116, epic #6 (Phase 5 loop detector).
> Pending human decisions: (a) steps that run no tools, (b) drop TRX and fix `plan.md:126` and `plan.md:163`. Both are recorded below as pending; this record rules neither.

## Context

`docs/plan.md:18` keeps tool facts apart from agent claims; `docs/plan.md:126` makes Phase 3 "parse `dotnet test` (TRX), CI status via `gh`, a Stryker report" with the outcome "every completed step shows at least one verified fact". Epic #4 bets that a tool fact attaches to a plan step reliably, and its kill criterion is "facts cannot be tied to a step: the split is redesigned before any panel work".

Declared facts already attach through one rule. The decision appender calls `decisionStepOf(plan, role)` at write time (`capture/shared/src/decision-append/decision-append.ts:47`): the latest-started in-progress step of the role, else the only step in progress, else a refusal (`core/src/lifecycle/decision-step.ts:33-43`). The snapshot's "current step" is another rule, the latest-started in-progress step (`core/src/snapshot/snapshot.ts:76-88`).

How this was decided: a controlled run of the four real tools in a scratch clone, with the real seed command, the real Claude Code step hook and two steps in progress together (the #40 overlap), plus the real #40 run for CI. Raw commands, instants, sizes and hashes: `docs/technical/decisions/evidence/verified-facts/run.txt`. The operator supplies the role of each run, as the agent does for decisions (`rules/decision-logging.md:28-33`, `:46`); the run does not show how a live agent's tool run delivers its role (see Open questions). Both inputs of a fact, the report and the role, are reachable by the agent: see "Trust" in S4.

Corrected here, not edited there (closed records and plan):
- `docs/plan.md:126` names `dotnet test` (TRX), and the Phase 3 scenario at `docs/plan.md:163` ("Given dotnet test reports 3 of 5 scenarios passing") names it too; the stack is vitest, cucumber-js and StrykerJS (`package.json:24-30`). Pending (b).
- `ci-pull-request-posture.md` cites stale `ci.yml` lines; checked against `.github/workflows/ci.yml` at the base commit, the full list is: `:27` `ci.yml:1-26` is now `:1-29`; `:36` `:5-6` is now `:8-9` and `:17-19` is now `:20-22`; `:37` `:17` and `:20` are now `:20` and `:23`; `:38` `:24` is now `:27`; `:39` `:23` is now `:26`; `:40` `:25-26` is now `:28-29`; `:41` `:13` is now `:16`; `:42` `:8-15` is now `:11-18`; `:43` `:22` is now `:25`. The cites of `ci.yml:1` and `ci.yml:3` still hold.
- `loop-threshold.md:25` cites `plan:209` for Q6; it is now `docs/plan.md:224`. `loop-threshold.md:35` and `:51` cite `ev:107` for "do not persist tool output"; it is now `docs/technical/capture/events.md:119`.
- `events.md:73` names `shared/recorder.mjs` as the shared writer; that file is the spike `spikes/capture/shared/recorder.mjs`, the production writers live in `capture/shared/src`.
- `agent-flow-plan` takes the bare issue number: `'#108'` is refused ("must be a number of 1 to 10 digits without leading zero"), `108` is accepted and written as `#108` (`run.txt`).
- `cucumber-js` loads the step files of its working directory, so it must run from the project root (`run.txt`, R2).
- AC7 of #108 says "Architect lane"; the Tech Spec lane is read-only, so the Developer ran the spike and the Architect owns this node afterwards (project-docs, Ownership).

## Decision / Specification

### S1 Sources (AC1)

| Source | Format | Writer | Location | Instant carried | Size on the run (bound `MAX_TEXT_LENGTH` = 1 MiB, `core/src/contracts/contract-error.ts:8`) |
|---|---|---|---|---|---|
| vitest | JSON object (`--reporter=json`): counts, `startTime`, `testResults[]` with per-suite `startTime`/`endTime` and `assertionResults[]` | vitest 5.0.5 JSON reporter | stdout, or `--outputFile`; none configured (`vitest.config.ts:15-26`) | run `startTime`, epoch ms (21:06:58.260Z) | 263,204 B, `core` project only (885 tests), 25% |
| cucumber-js JSON | array of features, each with `elements[].steps[].result` | `@cucumber/cucumber` 13.3.0 `lib/formatter/json_formatter.js` | `--format json:<file>`; none configured (`cucumber.js:14-18`) | none | 507,745 B, all 123 scenarios, 48% |
| cucumber-js message | NDJSON stream of Cucumber messages | built-in `message` formatter | `--format message:<file>`; none configured | `testRunStarted.timestamp`, `testRunFinished.timestamp` | 1,535,377 B, 146%: over the bound |
| Stryker mutation | mutation-testing-elements JSON, `schemaVersion` 1.0 | `@stryker-mutator/core` 10.1.1 JSON reporter | one path, `jsonReporter.fileName`, default `reports/mutation/mutation.json` (`stryker.config.json:1-21` sets none); `dist/src/reporters/json-reporter.js:23` | none | 93,560 B for one mutated file (51 mutants), 9%; grows with the files mutated, not measured for a whole-repo run |
| gh CI status | `gh pr view --json headRefOid,statusCheckRollup`, or `gh pr checks --json ...` | GitHub Actions (workflow `ci` job `test`, workflow `bdd` job `bdd`, `ci-pull-request-posture.md:41`), read with `gh` | the GitHub API, no file; nothing reads it today | `startedAt`, `completedAt` per check | about 0.9 KB for two checks |

- **Parsed sources** (v1 candidates settled here): vitest JSON, cucumber-js JSON, Stryker mutation JSON, gh CI status. The cucumber message stream is not a parsed source: it is over the bound and the JSON format carries the pass/fail results the detector needs. Whether the JSON format needs an instant is for #110 (it carries none; the run-end instant is the capture instant).
- **Failure-message field** the loop detector keys on (`loop-threshold.md:48`): vitest `assertionResults[].failureMessages` (`vitest.excerpt.json:45`) and cucumber JSON `result.error_message` (`node_modules/@cucumber/cucumber/lib/formatter/json_formatter.js:162`). The committed excerpts come from green runs, so they show the keys and no failure value.
- **TRX**: dropped, as AC2 states. **Pending (b)**: held as written, the human has not ruled. Recommendation: confirm the drop and open a follow-up ticket for `docs/plan.md:126` and the scenario at `docs/plan.md:163`. This record does not edit `plan.md`.
- No report names a plan step, a role or an agent: the vitest keys, the cucumber JSON keys and the Stryker keys were listed and none could carry one (`vitest.excerpt.json`, `cucumber.excerpt.json`, `mutation.excerpt.json`).

### S2 Attachment on a real run (AC3)

"Tied" means the report content itself names a plan step. By that test **every source is untied by content**. The rule below attaches a fact by the run's capture instant and the role that ran the tool: untied by content, attached by the capture rule.

**Rule (decided)**: a verified fact attaches when the tool run ends (capture time), never when a report is read later, with `decisionStepOf(plan, role)`. The role is the role that ran the tool; when that role has no step, the only step in progress is used; otherwise the fact is unattached.

| Run (evidence) | Role | Report carries a step id | Plan at capture | `decisionStepOf` result | Verdict |
|---|---|---|---|---|---|
| R1 vitest | dev-a | no | steps 1 and 2 in progress | step `1` | attached at capture (the role's own step) |
| R2 cucumber-js | qa | no | steps 1 and 2 in progress | step `2` | attached at capture (the role's own step) |
| R3 Stryker, run 1 | none (orchestrator) | no | steps 1 and 2 in progress | refused: `has no step in progress` | unattached |
| R4 Stryker, run 2 | none | no | only step 1 in progress | step `1` | attached by the only-step branch (`decision-step.ts:39-42`): the mechanism is shown, the correctness is not |
| CI on PR 93 (the #40 run) | none | no | only step 8 (architect, documentation capture) in progress | step `8` by the same only-step branch | **untied**: a check covers a commit, not a step, see below |

Why not another rule:
- The current-step rule misattaches in a real run. In R1 it attaches the dev-a test run to step 2, the latest started (`run.txt`, parallel-lane contrast). In the real #40 run, steps 4, 5 and 6 were all in progress together from 20:17:43.030Z (step 6's start, `docs/technical/capture/evidence/real-issue-run/claude-code-rerun/plan.json:56`) to 20:20:27.220Z (`:57`); a QA test run at 20:19 would attach to step 6, security, the latest started (`:50-58`).
- A report location read on poll loses runs. Stryker writes one file and the second run replaced the first (`run.txt`: two different hashes, one path).
- A role-less run is step-level only by luck. A Stryker run is step-level only when the role that ran it has a step. Without one it falls to the only-step branch: R4 returned step 1 whatever the run measured, and in the real #40 plan no step is in progress from 20:11:29.631Z to 20:17:42.277Z (`plan.json:30`, `:38`), where `decisionStepOf` refuses with `no step is in progress`. R4 is the only Stryker attachment on record and it rests on that branch.
- CI has no step. On PR 93 (head `a8ec9b5`, "docs(capture): agent display state and current agent (#40)", committed 20:39:56Z) `bdd` ran 20:40:05Z to 20:40:32Z and `test` 20:40:06Z to 20:40:37Z (`gh-checks-pr93.json`). Only step 8, "Documentation capture" (`plan.json:86-94`, 20:37:58Z to 20:40:51Z), was in progress, and the head commit falls inside it. So on this run the only-step branch lands on the step that made the tested commit, and the evidence does not show a wrong step. CI stays untied on a different ground: a check covers the whole tree at the head commit, and `plan.json` carries no commit field (`core/schemas/plan.schema.json:16-25`), so no step owns a check result. With a second commit pushed in another step the same rule would pick a step that did not make it.

### S3 Unmatched report: shown unattached (AC3)

A fact that `decisionStepOf` refuses is **kept, counted at issue level and reported, never dropped and never pushed onto the current step**. This is the orphan rule already in force for declared records (`snapshot-decisions.md:48`, `:71`): an unmatched record is reported, never dropped silently. R3 is the real case: the orchestrator's Stryker run with two steps in progress and no role is refused with `has no step in progress`.

### S4 Separator between verified and declared (AC4)

**The separator is the source, not a field.** It is neither an existing `decisions.jsonl` field nor a new one.
- Every `decisions.jsonl` line is declared (`snapshot-decisions.md:45`). A verified fact never enters that file: the schema requires `why` and `confidence` (`core/schemas/decisions.schema.json:6`) and refuses extra fields (`:7`). `decisions.jsonl` stays unchanged.
- In the snapshot the origin is an additive field **per fact, inside `steps[].facts[]`** (shape owned by #109), `origin: verified|declared` (additive-only rule `snapshot-contract.md:38`; #109 AC1). It is not the frozen step field `origin: planned|proposed` (`core/src/snapshot/snapshot.ts:39`, `core/schemas/plan.schema.json:23`, `snapshot-contract.md:37-38`, `:62`), which stays as it is.
- Capture-time attachments must outlive the run, so they need a new file under `.agent-flow/`. Today the contract is five files (`core/src/contracts/contract-check.ts:9-15`, `docs/plan.md:65-71`), and any other name is refused as "is not a contract file" (`:19-27`). AC4's "new field" appears here as a new sixth file, and **that sixth file is the frozen-contract change for #109 and goes through the Security lane.** Its name and shape are not decided here. The writer is capture-side: it runs when a tool run ends, and no hook sees a tool run today (`capture/claude-code/settings.json:5` matches `TaskCreate|TaskUpdate` only). #112 stays the reader and needs re-slicing, see Consequences.

#### Trust: what "verified" means

Both inputs to a verified fact are agent-reachable: the report file is written by a tool into the worktree the agent controls, and the role is supplied by the operator or the agent.
- **MUST**: "verified" means parsed from a tool run whose end the capture host observed. It is not proof against an agent that forges output; it keeps tool facts apart from agent claims (`docs/plan.md:18`), nothing more.
- **MUST**: take a fact only from a tool run the host observed (a runtime PostToolUse event or a transcript tool result), never from a report file merely found in the worktree.
- **MUST**: take the role from identity the host observed (hook `agent_type`, or the session) where it exists; an agent-supplied role is marked declared.
- **Owner**: #112 (capture side). The Security-lane review of the sixth file checks it.

### S5 Steps that ran no tool (AC5)

- The rule above is **scoped to steps that ran tools**. A step that ran no vitest, cucumber-js or Stryker run has no verified fact, and none is invented for it.
- **Pending (a)**: not ruled by the human. Recommendation: exempt such steps from the verified-fact rule and amend epic #4's outcome ("every completed step shows at least one verified fact") accordingly. Until ruled, the record only scopes the rule.
- **File-diff fact: out of Phase 3.** Cost reason: a per-step diff needs a per-step baseline commit, and `plan.json` carries none (`core/schemas/plan.schema.json:16-25`); parallel lanes share one worktree (`plan.json:32-57`), so one diff cannot be split by step. The diff stays an issue-level input for the Phase 5 scope check (`docs/plan.md:128`).

### S6 Timebox result (AC7)

Timebox: 80 tool-call turns of the executing lane, under the 200 warning ceiling. The run finished inside it, at about 75 of 80 turns, with a result: **decision plus redesigned split**, not "inconclusive". The kill criterion fired in part: no source is tied by content, and CI cannot be tied to a step at all (a check covers a commit), so the split is redesigned as follows.
- **Step-level verified facts**: vitest and cucumber-js test reports, and Stryker mutation reports run by a role that has a step, each attached at capture time.
- **Issue-level verified fact**: CI status, keyed by head commit, shown apart from the steps.
- Epic #4's outcome therefore holds only for steps that ran tests or mutation. Steps with no tool fall under pending (a).

What the run did not show: how a live agent's tool run delivers its role to the capture step. Today no hook sees a tool run (`capture/claude-code/settings.json:5` matches `TaskCreate|TaskUpdate` only). The rule is proven with a role the operator supplies, not with an automatic one. The decision would change only if that delivery proves impossible, and then the ticket would reopen as "inconclusive + what blocks".

### Consequences per fact kind (AC6)

| Fact kind | Consequence |
|---|---|
| Test report (vitest, cucumber-js JSON) | Step-level. #110 parses it; every run is attached at capture time, which the loop counter needs (keyed by plan step and test id over consecutive runs, `loop-threshold.md:48-49`). The parser input is bounded (1 MiB); an over-bound report is refused whole, as a size error with no fact, never truncated or partly parsed. Sizes above are for the `core` project and for all scenarios, a full vitest run is not measured |
| Stryker report | Step-level only when the role that ran it has a step. #111 parses it; the single report path is overwritten on every run, so it must be captured at run end, never read on poll (`json-reporter.js:23`). Carries no instant: the run-end instant is the capture instant. The same size rule applies |
| CI status | Issue-level, keyed by head commit, shown apart from the steps. #114 maps `statusCheckRollup` (workflow `ci` / job `test`, `bdd` / `bdd`) to a fact; #115 reads it with `gh` for the head commit. It is never attached to a step by instant |
| Declared fact | Unchanged: `decisions.jsonl`, attached by `decisionStepOf` at write time |
| Unattached fact | Counted at issue level and reported; #109 shapes where, additively |

Per slice:
- **#109**: facts per step plus an issue-level place for unattached facts and CI, additive; per fact `origin: verified|declared`; declared first. Lists the sixth `.agent-flow` file as the frozen-contract change for the Security lane.
- **#112**: its title assumes the daemon reads report files on poll. Capture-time attachment means the fact-file writer is capture-side and runs when a tool run ends; #112 stays the reader of that file and needs re-slicing (its Touches are `daemon/**` and its AC4 says no parsing in `daemon/`). It also owns how the role reaches the writer. The PM re-slices; this record does not edit #112.
- **#113**: display only; shows verified and declared apart, unattached and CI apart from the steps; a no-tools step shows per (a).
- **#116**: "every completed step shows at least one verified fact" holds only for steps that ran tests or mutation, until (a) is ruled.
- **Phase 5 loop detector**: input is vitest and cucumber-js reports only (`loop-threshold.md:50`, `:69`). Stryker and CI are excluded: neither is a per-test pass/fail run.

### Considered options

| Option | Verdict | Reason |
|---|---|---|
| Attach at capture time with `decisionStepOf(plan, role)` | Chosen | The rule decisions already use; survives parallel lanes; every run kept for the loop counter |
| Attach by the report's instant alone | Rejected | With parallel lanes it picks a step by time, not by who ran the tool (R1) |
| Attach to the current step (`snapshot.ts:76-88`) | Rejected | Misattaches in the real #40 run and on R1 |
| Daemon reads reports at their default paths on poll | Rejected | Loses overwritten runs (Stryker, two runs, one path), and takes a report the host did not observe being produced |
| Write reports under `.agent-flow/` as they are | Rejected | The contract check refuses unknown files (`contract-check.ts:25`) and a report is unbounded |
| A `verified` flag in `decisions.jsonl` | Rejected | The schema forces `why` and `confidence`, refuses extra fields, would need a version bump and mixes sources |
| Infer the role from the open subagent call | Rejected | Fragile with parallel subagents (`events.md:95`) |
| A full live agent run of a whole issue | Rejected | The user rejects manual capture procedures; #40 already gives the real evidence |
| Drop an unmatched report | Rejected | Hides a fact, against `snapshot-decisions.md:71` |

## Consequences / Constraints

- **MUST**: attach a verified fact at capture time, with `decisionStepOf(plan, role)` and the role that ran the tool.
- **MUST**: report an unmatched fact unattached; never drop it, never attach it to the current step.
- **MUST NOT**: write a verified fact into `decisions.jsonl`.
- **MUST NOT**: persist a tool report as it is; the bound is 1 MiB and the cucumber message stream alone is 146% of it. The capture rule already persists an allowlist of fields only and never tool output text (`docs/technical/capture/events.md:118-119`), so a stored fact is a bounded extract of a report, never the report. The extract never includes `failureMessages`, `source` or stdout.
- **MUST** (owed to #110 and #111): refuse an over-bound report whole (a size error and no fact, never a truncation or a partial parse); stop the read at the bound before buffering. The bound is checked on UTF-16 length (`text.length`, `core/src/contracts/jsonl.ts:45`, `core/src/contracts/plan.ts:74`) while this record measures bytes, so the two differ for non-ASCII text.
- **MUST** (owed to #112, and #109 where it applies): the trust rules of S4 hold for every fact.
- **MUST** (owed to #112): a role-less or wrong-role run attached through the only-step fallback is recorded as attached-by-fallback, or treated as unattached.
- **MUST** (owed to #112): report reads are confined. Open the file with `O_RDONLY|O_NOFOLLOW|O_NONBLOCK`, require an `fstat` regular file, read at most `MAX_TEXT_LENGTH`+1 bytes, derive the path from the worktree realpath. The fact-file writer follows `plan-writer-confinement.md:86`. #112 AC1 still says "at the paths from #108" on poll, which this record rejects (Considered options): its body needs updating.
- **Out of scope**: the name and shape of the new `.agent-flow` fact file (#112 and Security), snapshot facts (#109), the role-delivery mechanism (#112), glossary terms "verified fact", "declared fact", "unattached fact" (PM gap, `docs/functional/glossary.md:43-58`), the Security-lane routing of the sixth file (carried by #109 and #112, which do not carry it today; the orchestrator adds it there), ruling on (a) and (b).

## Open questions / Gaps

- [ ] **Pending (a)**: steps that run no tools. Recommendation: exempt them and amend epic #4's outcome. Human decision.
- [ ] **Pending (b)**: drop TRX and fix `docs/plan.md:126` and the scenario at `docs/plan.md:163`. Recommendation: confirm the drop, open a follow-up ticket for the `plan.md` fixes. Human decision.
- [ ] Is a role-less orchestrator mutation run unattached, or an issue-level fact like CI? Not decided here; the run showed only that the only-step fallback attaches it by luck (R4) and refuses it with no step in progress.
- [ ] How the role reaches the capture step when an agent runs a tool (#112). The run used an operator-supplied role.
- [ ] Whether capture reads the agent transcript for steps and tool runs; the transcript could carry the role and the tool result. This record does not decide the direction; #112 settles it with the capture design.
- [ ] A full vitest run size and a whole-repo Stryker report size against the 1 MiB bound (#110, #111).
