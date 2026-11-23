---
id: "verified-facts"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-11-23"
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
  - "How does core turn a vitest or cucumber-js report text into a verified fact on a step, and what does it refuse?"
  - "How does core turn a Stryker mutation report text into a verified fact, how is the score computed, and what does it refuse?"
  - "How does core turn a gh CI status text into the issue-level CI fact, and what does it refuse?"
  - "What do the gh read (#115) and the CI display (#113) owe before they show a CI state?"
  - "How many verified facts does a step keep, how many reports does one build read, and what does the host owe before passing them?"
  - "How does the capture side see a tool run, take its role and report, and what does the sixth .agent-flow file hold?"
decided_in:
  - "#108"
  - "#110"
  - "#111"
  - "#113"
  - "#114"
  - "#124"
  - "#125"
---

# Verified facts: sources, capture-time step attachment, separator

> **One-liner**: No tool report names a plan step, so a verified fact is attached when the tool run ends, through `decisionStepOf(plan, role)` and the role that ran the tool. A report that finds no step is shown unattached, never dropped and never pushed onto the current step. The separator is the source, not a `decisions.jsonl` field. CI is an issue-level fact keyed by commit. The spike ends with a decision and a redesigned split, not "inconclusive".
> **Links**: [[snapshot-decisions]] (orphan rule `:48`), [[decisions-jsonl-schema]] (frozen fields), [[loop-threshold]] (counter key `:48-49`, input `:50`), [[capture-events]] (step events), [[real-issue-run]] (evidence and scan rule `:94-96`). Consumers: epic #4 slices #109 to #116, epic #6 (Phase 5 loop detector).
> Human decisions: (a) steps that run no tools: ruled by the human on 2026-11-11, exempt (S5). Still pending: (b) drop TRX and fix `plan.md:126` and `plan.md:163`; this record does not rule it.

## Context

`docs/plan.md:18` keeps tool facts apart from agent claims; `docs/plan.md:126` makes Phase 3 "parse `dotnet test` (TRX), CI status via `gh`, a Stryker report" with the outcome "every completed step shows at least one verified fact". Epic #4 bets that a tool fact attaches to a plan step reliably, and its kill criterion is "facts cannot be tied to a step: the split is redesigned before any panel work".

Declared facts already attach through one rule. The decision appender calls `decisionStepOf(plan, role)` at write time (`capture/shared/src/decision-append/decision-append.ts:47`): the latest-started in-progress step of the role, else the only step in progress, else a refusal (`core/src/lifecycle/decision-step.ts:33-43`). The snapshot's "current step" is another rule, the latest-started in-progress step (`currentStepOf`, `core/src/snapshot/snapshot.ts`).

How this was decided: a controlled run of the four real tools in a scratch clone, with the real seed command, the real Claude Code step hook and two steps in progress together (the #40 overlap), plus the real #40 run for CI. Raw commands, instants, sizes and hashes: `docs/technical/decisions/evidence/verified-facts/run.txt`. The operator supplies the role of each run, as the agent does for decisions (`rules/decision-logging.md:28-33`, `:46`); the run does not show how a live agent's tool run delivers its role (see Open questions). Both inputs of a fact, the report and the role, are reachable by the agent: see "Trust" in S4.

Corrected here, not edited there (closed records and plan):
- `docs/plan.md:126` names `dotnet test` (TRX), and the Phase 3 scenario at `docs/plan.md:163` ("Given dotnet test reports 3 of 5 scenarios passing") names it too; the stack is vitest, cucumber-js and StrykerJS (`package.json:24-30`). Pending (b).
- `ci-pull-request-posture.md` cites stale `ci.yml` lines; checked against `.github/workflows/ci.yml` at the base commit, the full list is: `:27` `ci.yml:1-26` is now `:1-29`; `:36` `:5-6` is now `:8-9` and `:17-19` is now `:20-22`; `:37` `:17` and `:20` are now `:20` and `:23`; `:38` `:24` is now `:27`; `:39` `:23` is now `:26`; `:40` `:25-26` is now `:28-29`; `:41` `:13` is now `:16`; `:42` `:8-15` is now `:11-18`; `:43` `:22` is now `:25`. The cites of `ci.yml:1` and `ci.yml:3` still hold.
- `loop-threshold.md:25` cites `plan:209` for Q6; it is now `docs/plan.md:224`. `loop-threshold.md:35` and `:51` cite `ev:107` for "do not persist tool output"; it is now `docs/technical/capture/events.md:119`.
- `events.md:73` names `shared/recorder.mjs` as the shared writer; that file is the spike `spikes/capture/shared/recorder.mjs`, the production writers live in `capture/shared/src`.
- `agent-flow-plan` takes the bare issue number: `'#108'` is refused ("must be a number of 1 to 10 digits without leading zero"), `108` is accepted and written as `#108` (`run.txt`).
- `cucumber-js` loads the step files of its working directory, so it must run from the project root (`run.txt`, R2).
- AC7 of #108 says "Architect lane"; the Tech Spec lane is read-only, so the Developer ran the spike and the Architect owns this node afterwards (project-docs, Ownership).

Corrected by #125 in this record, where its evidence contradicts the #108 text (`evidence/verified-facts/capture-125/run.txt`):
- S1, vitest location: vitest 5.0.5 `--reporter=json` with no `--outputFile` does not print the report; it writes `.vitest/json/output.json` (`node_modules/vitest/dist/chunks/cli-api.De07GUeT.js:9378-9389`, `run.txt` V). The row is amended.
- S4, Trust: "a transcript tool result" is no longer an observed run (S11 (b)), and "prefer the tool result's own stdout" cannot hold, because `stdout` is a 30,000-character preview (`run.txt` H4); the report is read from its fixed file inside the observed run instead (S11). Both bullets are amended.
- S1 and Consequences per fact kind: "a full vitest run is not measured" and "not measured for a whole-repo run" are now measured (S11 (f)).

## Decision / Specification

### S1 Sources (AC1)

| Source | Format | Writer | Location | Instant carried | Size on the run (bound `MAX_TEXT_LENGTH` = 1 MiB, `core/src/contracts/contract-error.ts:8`) |
|---|---|---|---|---|---|
| vitest | JSON object (`--reporter=json`): counts, `startTime`, `testResults[]` with per-suite `startTime`/`endTime` and `assertionResults[]` | vitest 5.0.5 JSON reporter | `--outputFile`, else `.vitest/json/output.json`, not stdout (corrected by #125, S11); none configured (`vitest.config.ts:15-26`) | run `startTime`, epoch ms (21:06:58.260Z) | 263,204 B, `core` project only (885 tests), 25%; full run 579,947 B (1791 tests), 55.3% (#125) |
| cucumber-js JSON | array of features, each with `elements[].steps[].result` | `@cucumber/cucumber` 13.3.0 `lib/formatter/json_formatter.js` | `--format json:<file>`; none configured (`cucumber.js:14-18`) | none | 507,745 B, all 123 scenarios, 48% |
| cucumber-js message | NDJSON stream of Cucumber messages | built-in `message` formatter | `--format message:<file>`; none configured | `testRunStarted.timestamp`, `testRunFinished.timestamp` | 1,535,377 B, 146%: over the bound |
| Stryker mutation | mutation-testing-elements JSON, `schemaVersion` 1.0 | `@stryker-mutator/core` 10.1.1 JSON reporter | one path, `jsonReporter.fileName`, default `reports/mutation/mutation.json` (`stryker.config.json:1-21` sets none); `dist/src/reporters/json-reporter.js:23` | none | 93,560 B for one mutated file (51 mutants), 9%; whole-repo run 2,932,594 B (2413 mutants), 279.7%, over the bound (#125, S11) |
| gh CI status | `gh pr view --json headRefOid,statusCheckRollup`, or `gh pr checks --json ...` | GitHub Actions (workflow `ci` job `test`, workflow `bdd` job `bdd`, `ci-pull-request-posture.md:41`), read with `gh` | the GitHub API, no file; nothing reads it today | `startedAt`, `completedAt` per check | about 0.9 KB for two checks |

- **Parsed sources** (v1 candidates settled here): vitest JSON, cucumber-js JSON, Stryker mutation JSON, gh CI status. The cucumber message stream is not a parsed source: it is over the bound and the JSON format carries the pass/fail results the detector needs. The JSON format carries no instant and #110 parses none: the run-end instant is the capture instant, which #112 owns (S7).
- **Failure-message field** the loop detector keys on (`loop-threshold.md:48`): vitest `assertionResults[].failureMessages` (`vitest.excerpt.json:45`) and cucumber JSON `result.error_message` (`node_modules/@cucumber/cucumber/lib/formatter/json_formatter.js:162`). The committed excerpts come from green runs, so they show the keys and no failure value. The detector's input is a fixed-length fingerprint of that message (a hash taken after the normalisation that Phase 5 story 5 defines), never the message text; this holds for both fields.
- **TRX**: dropped, as AC2 states. **Pending (b)**: held as written, the human has not ruled. Recommendation: confirm the drop and open a follow-up ticket for `docs/plan.md:126` and the scenario at `docs/plan.md:163`. This record does not edit `plan.md`.
- No report names a plan step, a role or an agent: the vitest keys, the cucumber JSON keys and the Stryker keys were listed and none could carry one (`vitest.excerpt.json`, `cucumber.excerpt.json`, `mutation.excerpt.json`).

### S2 Attachment on a real run (AC3)

"Tied" means the report content itself names a plan step. By that test **every source is untied by content**. The rule below attaches a fact by the run's capture instant and the role that ran the tool: untied by content, attached by the capture rule.

**Rule (decided)**: a verified fact attaches when the tool run ends (capture time), never when a report is read later, with `decisionStepOf(plan, role)`. The role is the role that ran the tool; when that role has no step, the only step in progress is used and the attachment records that it came from the only-step fallback, because no step of the role was in progress; otherwise the fact is unattached.

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
- In the snapshot the origin is an additive field **per fact, inside `steps[].facts[]`** (shape owned by #109), `origin: verified|declared` (additive-only rule `snapshot-contract.md:38`; #109 AC1). It is not the frozen step field `origin: planned|proposed` (`SnapshotStep.origin`, `core/src/snapshot/snapshot.ts`, `core/schemas/plan.schema.json:23`, `snapshot-contract.md:37-38`, `:62`), which stays as it is.
- Capture-time attachments must outlive the run, so they need a new file under `.agent-flow/`. Today the contract is five files (`core/src/contracts/contract-check.ts:9-15`, `docs/plan.md:65-71`), and any other name is refused as "is not a contract file" (`:19-27`). AC4's "new field" appears here as a new sixth file, and **that sixth file is the frozen-contract change for #109 and goes through the Security lane.** Its name and shape were not decided by #108; #125 decides them (S11 (e)). The writer is capture-side: it runs when a tool run ends, and no hook sees a tool run today (`capture/claude-code/settings.json:5` matches `TaskCreate|TaskUpdate` only). #112 stays the reader and needs re-slicing, see Consequences.

#### Trust: what "verified" means

Both inputs to a verified fact are agent-reachable: the report file is written by a tool into the worktree the agent controls, and the role is supplied by the operator or the agent.
- **MUST**: "verified" means parsed from a tool run whose end the capture host observed. It is not proof against an agent that forges output; it keeps tool facts apart from agent claims (`docs/plan.md:18`), nothing more.
- **MUST**: take a fact only from a tool run the host observed (a runtime PostToolUse event; the transcript is not read, corrected by #125, S11 (b)), never from a report file merely found in the worktree. A Bash `echo` into a report path is also a tool run the host observes, so the capture side must check that the observed command is the tool itself. Corrected by #125: the tool result's stdout is a 30,000-character preview and vitest 5 and Stryker print no JSON, so the report is read from the tool's own file at its fixed path, only when that file was written inside the observed run (S11, "Where the report text comes from").
- **MUST**: take the role from identity the host observed (hook `agent_type`; the session is shared with subagents and identifies none, #125) where it exists. When the role is agent-supplied (not host-observed), the attachment is marked as agent-supplied and the fact's `origin` stays `verified`, consistent with "the separator is the source".
- **Owner**: #112 or the capture-side slice cut from it. The Security-lane review of the sixth file checks it.

### S5 Steps that ran no tool (AC5)

- The rule above is **scoped to steps that ran tools**. A step that ran no vitest, cucumber-js or Stryker run has no verified fact, and none is invented for it.
- **Decision (a), ruled by the human on 2026-11-11**: a step that ran no tool is exempt from the verified-fact rule and shows no verified fact, and says so. The rule is scoped to steps that ran a test or mutation tool. Epic #4's outcome ("every completed step shows at least one verified fact") is amended accordingly (the orchestrator amends the epic). AC5 is no longer held pending.
- **File-diff fact: out of Phase 3.** Cost reason: a per-step diff needs a per-step baseline commit, and `plan.json` carries none (`core/schemas/plan.schema.json:16-25`); parallel lanes share one worktree (`plan.json:32-57`), so one diff cannot be split by step. The diff stays an issue-level input for the Phase 5 scope check (`docs/plan.md:128`).

### S6 Timebox result (AC7)

Timebox: 80 tool-call turns of the executing lane, under the 200 warning ceiling. The run finished inside it, at about 75 of 80 turns, with a result: **decision plus redesigned split**, not "inconclusive". The kill criterion fired in part: no source is tied by content, and CI cannot be tied to a step at all (a check covers a commit), so the split is redesigned as follows.
- **Step-level verified facts**: vitest and cucumber-js test reports, and Stryker mutation reports run by a role that has a step, each attached at capture time.
- **Issue-level verified fact**: CI status, keyed by head commit, shown apart from the steps.
- Epic #4's outcome now reads: every completed step that ran a test or mutation tool shows at least one verified fact with its source; a step that ran no tool shows none and says so (decision (a), ruled by the human on 2026-11-11).

What the run did not show: how a live agent's tool run delivers its role to the capture step. Today no hook sees a tool run (`capture/claude-code/settings.json:5` matches `TaskCreate|TaskUpdate` only). The rule is proven with a role the operator supplies, not with an automatic one. The decision would change only if that delivery proves impossible, and then the ticket would reopen as "inconclusive + what blocks". #125 shows the delivery on a real Claude Code run (S11 (a)): the decision holds.

### S7 Test report into a verified fact (#110)

Core takes the report as text and the step as an id. It opens no file and does not call `decisionStepOf`: attachment stays at capture (S2).

| Concern | Rule | Anchor |
|---|---|---|
| Input | `SnapshotFiles.testReports?`, a list of `{step, text}`, additive and optional. `step` is the id the capture side resolved with `decisionStepOf(plan, role)` at run end. No host passes it before #112 | `SnapshotFiles`, `core/src/snapshot/snapshot.ts`; `daemon/src/snapshot/get-snapshot.ts:59` |
| Parser | internal to the snapshot module, not exported, tested through `buildSnapshot` | `core/src/snapshot/test-report.ts:52-64` |
| Unmatched step | one error `{file: 'test-report', location: <1-based report index>, field: 'step', message: 'is not a step of plan.json'}`, no fact, report not parsed. The message never echoes the step id (untrusted input) | `outcomeOfReport`, `snapshot.ts` |
| Refusal | one error per report, `field: null`, fixed messages only: `exceeds 1048576 characters`, `is not valid JSON`, `is not a vitest or cucumber-js JSON report`. Report errors are capped with `capErrors`; every other fact stays | `test-report.ts:53`, `:58`, `:62`; `outcomeOfReport`, `readReports`, `snapshot.ts` |
| Bound | `text.length` above `MAX_TEXT_LENGTH` is refused whole, before `JSON.parse` | `test-report.ts:53` |
| vitest | an object whose `numTotalTests`, `numPassedTests` and `numFailedTestSuites` are safe non-negative integers, with passed not above total. `numFailedTests` is not read. Label `<passed> of <total> passed`, with the suffix `, run failed` only when passed equals total and failed suites are above 0 | `test-report.ts:21-26`; `verifiedFactOf`, `snapshot.ts` |
| Why that suffix | vitest marks a suite failed when any child fails, so a red run always counts its file and describe blocks as failed suites (`node_modules/vitest/dist/chunks/run.BPv-BBRv.js:4116`), and `success` needs both counts at 0 (`cli-api.De07GUeT.js:9315`). A suffix on every red run would hide "3 of 5 passed"; the suffix only shows a red run the counts read as all passed (an import error, a failing hook) | |
| cucumber-js | an array of features, each with `elements[]`, each with `steps[]`, each with a string `result.status`. A scenario passes when every step, hidden hooks included, is `passed`; total is the number of elements. Any structural deviation refuses the whole report | `test-report.ts:28-45` |
| Fact | the #109 `SnapshotFact`, unchanged: `origin: 'verified'`, `source: 'vitest'` or `'cucumber-js'`, counts in `label`. Listed after the step's declared facts, in input order | `verifiedFactOf`, `toSnapshotStep`, `snapshot.ts` |
| Failure text | never read: neither `failureMessages` nor `error_message` reaches a fact or an error. No fingerprint is built (story 5) | `test-report.ts:21-45` |
| Instant | none on the fact; the run-end instant is the capture instant (#112) | |

Frozen surface of #110: 4 elements declared, 4 `required_by_hypothesis: false`, none frozen. Numeric counts on `SnapshotFact`: dropped (the label carries them). The sixth `.agent-flow` file: deferred to #112. The fingerprint field: deferred to Phase 5 story 5. The per-step omitted-facts field: deferred to #112 (Consequences), delivered by #124 (S10).

### S8 Mutation report into a verified fact (#111)

Same seam as S7: core takes `{step, text}`, opens no file and does not attach. Only the rows that differ from S7 are listed; every symbol is in `core/src/snapshot/mutation-report.ts` or `snapshot.ts`.

| Concern | Rule | Anchor |
|---|---|---|
| Input | `SnapshotFiles.mutationReports?`, additive and optional, beside `testReports`. Both kinds share one internal `StepReport` type (`TestReport`, `MutationReport` are aliases) and one `readReports(file, reader)`; a kind only supplies its `ReportReader`. No host passes it before #112 | `SnapshotFiles`, `StepReport`, `readReports` |
| Error label | `file: 'mutation-report'`, its own label, capped apart from `test-report`. Unmatched step as in S7, never echoing the id | `mutationReportFile`, `outcomeOfReport` |
| Refusal | fixed messages only: `exceeds 1048576 characters`, `is not valid JSON`, `is not a Stryker mutation report`, `has no mutant to score` | `readMutationReport` |
| Bound | `text.length` above `MAX_TEXT_LENGTH` (1,048,576 UTF-16 units) is refused whole, before `JSON.parse`. Pinned at exactly the bound and one unit over (`core/src/snapshot/snapshot.test.ts:1152`) and by `features/phase-3/mutation-report-fact.feature` S7 | `readMutationReport` |
| Shape | an object with a string `schemaVersion` and an object `files`; each file has a `mutants` array; each mutant `status` is a known Stryker status. Any deviation refuses the whole report | `statusesOf` |
| Counting | detected = `Killed` + `Timeout`; surviving = `Survived` + `NoCoverage`; `CompileError`, `RuntimeError`, `Ignored`, `Pending` are not counted. No countable mutant is an error, never a fact. Report thresholds are ignored | `reportOf`, `readMutationReport` |
| Score | integer floor, `floor(detected * 10000 / (detected + surviving))` shown as `int.dd`, never `toFixed` (which rounds 9/11 to 81.82; the floor gives 81.81), so a run with a survivor never reads `100.00`. Label `<score>% mutation score, <n> surviving`, `source: 'stryker'` | `mutationLabelOf` |
| Report text | only `status` is read: no mutant field (`replacement`, `statusReason`, `mutatorName`) reaches a fact or an error | `statusOf` |
| Order | facts per step: declared, test-report, mutation, each in input order. Errors: decisions, test-report, mutation-report, agent-state | `toSnapshotStep`, `buildSnapshot` |

Frozen surface of #111: none. `plan.json`, `decisions.jsonl` and the `Snapshot` type are unchanged; the panel wire `source` is any string (`panel/shared/snapshot-rpc.ts:21`), so `stryker` needs no wire change.

### S9 CI status into the issue-level fact (#114)

Core takes the raw stdout of `gh pr view --json headRefOid,statusCheckRollup` as text, opens nothing and calls nothing; the read is #115's. Where the fact sits: [[snapshot-facts]]. Every symbol is in `core/src/snapshot/ci-status.ts` or `snapshot.ts`.

| Concern | Rule | Anchor |
|---|---|---|
| Input | `SnapshotFiles.ciStatus?: string`, additive and optional. Absent, or any non-string at runtime, is no status: `ci: null` and no error. No host passes it before #115 | `readCi` |
| Error label | at most one error `{file: 'ci-status', location: null, field: null, message}`; no `capErrors` (one input). Order: after the mutation-report errors, before the agent-state error; on an unusable plan, after the plan errors | `readCi`, `buildSnapshot` |
| Refusal | fixed messages only, never the input: `exceeds 1048576 characters` (checked before `JSON.parse`), `is not valid JSON`, `is not a gh check status rollup`, `has no check run` | `readCiStatus` `:56-71` |
| Shape | an object with a string `headRefOid` and an array `statusCheckRollup`. Every entry must classify, else the whole status is refused: a record whose `__typename` is absent or `CheckRun` (a `StatusContext` is refused), whose `status` is a known running status or `COMPLETED`, and, when `COMPLETED`, whose `conclusion` is known | `isCheckRun`, `stateOfCheck` `:31-43` |
| Classification | a running status gives pending (its conclusion is ignored); a `COMPLETED` check with a failing conclusion (`STALE` included) gives failed; `SUCCESS`, `NEUTRAL` or `SKIPPED` give passed. The lists are closed: an unknown value never defaults to passed | `:17-26` |
| State | any failed check gives `failed`, else any pending gives `pending`, else `passed`. Every check run of the rollup counts: no required-check filter | `overallStateOf` `:51-54` |
| Report text | only `headRefOid`, `__typename`, `status` and `conclusion` are read; check names, URLs, workflow names and instants never reach the snapshot. `headRefOid` is the one copied string, as `headCommit` | `:70` |

Frozen surface of #114: the top-level `ci` and the four `CiFact` fields, required by the hypothesis; the wire mirror, kept now because [[snapshot-rpc]] `:114` and the type pin require it; per-check detail, dropped (an additive `checks` field later). `SnapshotFiles.ciStatus`, the error label and the messages are not frozen.

### S10 Caps on verified facts and reports (#124)

Two bounds, both in `core/src/snapshot/snapshot.ts` and observed through `buildSnapshot`. No host passes reports before #112.

| Concern | Rule | Anchor |
|---|---|---|
| Per-step cap | a step keeps at most `MAX_DECISIONS_PER_STEP` (50) verified facts; no second constant. Kept: the last 50 of the step's joined list `[...test, ...mutation]`, in input order, after the declared facts; the earliest are dropped | `latestVerifiedFacts` `:108-115`; join `:361` |
| Omitted count | `omittedFacts: number` after `facts`, required, no default, `0` when none, never `null`. It counts verified facts only; dropped decisions stay in `omittedDecisions`. The wire mirror is a required non-negative integer with no `.default` | `SnapshotStep` `:65-76`; `panel/shared/snapshot-rpc.ts:42` |
| Asymmetry | decisions keep the FIRST 50 of a step (`:226-227`); verified facts keep the LAST 50, because a later run supersedes an earlier one. Deliberate; "as decisions do" holds for the count only | |
| Build bound | `MAX_REPORTS_PER_BUILD` = 200 per kind (test reports, mutation reports), so at most 400 reports per build. Applied once in `readReports`, never in a parser. Reports before the last 200 are not read at all: no parse, no fact, no unmatched-step error, nothing added to `omittedFacts`. A kept report keeps its original 1-based location | `:17`; `readReports` `:298-319` |
| Bound error | one per kind that lost reports: `{file: 'test-report' \| 'mutation-report', location: null, field: null, message: 'too many reports, only the last 200 are read'}`. First in its kind's errors, outside `capErrors` (never cut); test-report before mutation-report. No step id, no report text, no skipped count. None when the plan is unusable (no report is read there) | `boundErrorsOf` `:286-296` |
| Why 200 | above `MAX_ERRORS` (100), so the error cap of S7 and S8 still applies under the bound | `core/src/contracts/contract-error.ts:9` |
| Limit | the build bound limits parsing CPU only: every report the host passes is already buffered. Bounding the read is the host's (MUST below) | |

Frozen surface of #124: `SnapshotStep.omittedFacts`, required by the hypothesis; the wire mirror, kept now because the type pin fails without it. `MAX_REPORTS_PER_BUILD`'s name and value, the bound-error message and the location numbering are not frozen.

### S11 Capture-side writer (#125)

Spike of #125 Part 1, run by the Developer (the Tech Spec lane is read-only, as for #108); the Architect owns this section afterwards. Evidence: a real Claude Code 2.1.330 headless run with command hooks on `PostToolUse`, `PreToolUse`, `SubagentStart`, `SubagentStop` and `Stop`, one Bash run in the main session and one inside a subagent, plus full-size reports: `evidence/verified-facts/capture-125/run.txt` (sections H, V, C, S) and `capture-125/hook-events.excerpt.json` (events cited as `n<k>`). Role delivery is possible: the ticket does not reopen as "inconclusive".

#### What the host observes

| Fact | Evidence |
|---|---|
| A main-session tool event carries `session_id`, `transcript_path`, `cwd`, `prompt_id`, `tool_name`, `tool_input`, `tool_response`, `tool_use_id`, `duration_ms`, and no `agent_id` or `agent_type` | `n2`; `run.txt` H1 |
| A subagent's tool event carries the same keys plus `agent_id` and `agent_type`; `agent_type` is the Agent call's `subagent_type`. `session_id` and `transcript_path` are the main session's, so they tell no agent apart | `n11`, `n7`, `n8`; H2 |
| `SubagentStart` carries `agent_id` and `agent_type` only; `SubagentStop` adds `agent_transcript_path`. The Agent call ran async: its `PostToolUse` (`status: async_launched`, `agentId`) came before the subagent's first tool event | `n8`, `n9`, `n12`; H3 |
| A Bash `tool_response` holds `stdout`, `stderr`, `interrupted`, `isImage`, `noOutputExpected`. Over 30,000 characters, `stdout` is a 30,000-character preview and the whole output goes to `persistedOutputPath` (under `~/.claude/projects/`, written by Claude Code), sized by `persistedOutputSize` | `n4`, `n6`; H4 |
| The hook's stdin stays small whatever the report: 33,397 B and 36,317 B for the 579,947 B and 2,932,594 B outputs, under the step hook's bound (`capture/claude-code/src/step-timing/step-timing.ts:48`) | `n4`, `n6` `file_bytes`; H4 |
| vitest 5.0.5 `--reporter=json` with no `--outputFile` writes `.vitest/json/output.json` and prints one 140-byte line; only the reporter's `stdout` option (config, not the CLI form tried) prints the report | `node_modules/vitest/dist/chunks/cli-api.De07GUeT.js:9378-9389`; V |
| Stryker writes its JSON only to its report file; its stdout is the clear-text table | `json-reporter.js:23`; S |

#### (a) How the role reaches capture

**Decided.** One new `PostToolUse` command hook, matcher `Bash`, beside the step hook (`capture/claude-code/settings.json:5`). It resolves the role of each observed run in this order, and records where it came from in `roleFrom`:
1. **Host-observed** (`roleFrom: "host"`): the event's `agent_type` when it is a bare name equal to one of `ROLE_IDS` (`core/src/lifecycle/roles.ts:1`), or that name with the `agentic-team:` prefix. Any other prefix is not host-observed: `other:qa` gives no role from the host (human ruling G2, 2026-11-23, below). Present only on a subagent's events (`n11`, absent on `n2`).
2. **Agent-supplied** (`roleFrom: "agent"`): otherwise, a leading `AGENT_FLOW_ROLE=<role-id> ` assignment on the observed command, `<role-id>` one of `ROLE_IDS`. Ignored when step 1 gave a role. A rule line tells agents to add it, as `rules/plan-steps.md` already makes them name the role in the item title.
3. **None**: `role: null`, a role-less run, see (d). The writer passes `null` to `decisionStepOf`, never `''`: an item without a role id becomes a step whose role is the empty string (`core/src/lifecycle/step-lifecycle.ts:203`), and `''` would match it.

Mapping. An `agent_type` names an agent definition, not a role id. Only a bare name that equals a role id, or that name with the `agentic-team:` prefix, counts (`architect`, `qa`, `security`); `dev-a` and `dev-b` are lanes, not agent definitions, so a dev lane's role is always agent-supplied, and the main session (the orchestrator) has no `agent_type` at all (`n2`). The namespaced form `<plugin>:<agent>` is inferred from the `subagent_type` an orchestrator passes (`n7` equals `n8`'s `agent_type`); a plugin agent's hook event was not captured. Because it was not captured, the prefix is not stripped for an arbitrary plugin: only `agentic-team:` is known, and an `agent_type` with any other prefix is not host-observed (G2).

Rejected: a fixed table from agent names to roles (Agent Flow would hard-code one team's agent names and still could not tell Dev A from Dev B); a join of `agent_id` with the Agent call that launched it (`n9` carries `agentId` and the call's `description`, but the join needs state kept between hook processes, the call is async, and parallel subagents make it fragile, `docs/technical/capture/events.md:95`); `session_id` or `transcript_path` (shared with the main session, H2).

#### (b) Whether capture reads the transcript

**Decided: no.** The hook event carries everything the writer needs: the tool, the command, the run duration and the host-observed identity (H1 to H4). The transcript is an internal format of 16 record types, carries the account and organisation ids, and keeps a subagent's tool results in a second file (H5); reading it would bring personal data into a process held to an allowlist (`docs/technical/capture/events.md:118`). Steps keep coming from the step hook. This corrects S4 (Trust), which allowed "a transcript tool result" as an observed run.

#### Where the report text comes from (Trust, corrects S4)

S4 asks the writer to "prefer the tool result's own stdout". The evidence rules that out: `stdout` is a 30,000-character preview for any larger output (H4), every real report is larger (sizes in (f)), vitest 5 and Stryker do not print their JSON at all (table above). **Decided**:
- The report is read from the tool's own report file at a fixed path derived from the worktree realpath, never from a path in the command: vitest `reports/vitest/vitest.json` (`--reporter=json --outputFile=reports/vitest/vitest.json`), cucumber-js `reports/cucumber/cucumber.json` (`--format json:reports/cucumber/cucumber.json`), Stryker `reports/mutation/mutation.json` (its default). `reports/` is git-ignored (`.gitignore:4`), so the files never reach a commit.
- Only when the observed command, after the optional role assignment, is one of a closed list of these tool forms with no shell metacharacter (`;`, `&`, `|`, `<`, `>`, a backquote, `$(`, a newline). `echo x > reports/mutation/mutation.json` matches no form and yields nothing (S6 scenario). An `interrupted: true` run yields nothing. The exact grammar is the writer slice's Tech Spec.
- Only when the file's modification time falls inside the observed run, `[event instant - duration_ms, event instant]` (`duration_ms`, `n2`), read with the confined read of Consequences (`O_RDONLY|O_NOFOLLOW|O_NONBLOCK`, `fstat` regular file, at most `MAX_TEXT_LENGTH`+1 bytes). A report found in the worktree with no such run is never read (S5 scenario).
- Rejected for now: `persistedOutputPath`. It is host-written, so stronger than a worktree file, but only cucumber-js can put its JSON on stdout, the file sits beside the transcript under `~/.claude` (outside the worktree the confinement derives from) and a second read path doubles the Security surface. A later hardening.
- Left open by design: a process the agent runs alongside the tool can still write the report inside the window. S4 already states that "verified" is not proof against forged output.

#### (c) An only-step-fallback attachment

**Decided: it stays attached, with its marker** `attachment: "only-step"`. One rule for declared and verified facts (`decision-step.ts:39-42`, used at write time by `capture/shared/src/decision-append/decision-append.ts:47`, `rules/decision-logging.md:46`); on the only real case on record the branch landed on the step that made the tested commit (S2, PR 93); unattaching it would hide the common sequential case where the orchestrator gates the one lane in progress. The marker keeps the doubt visible; showing it is the display's (#113, slice D). Rejected: unattached, which drops that case for no gain the marker does not give.

#### (d) A role-less orchestrator run

**Decided: unattached, never issue-level.** The writer calls `decisionStepOf(plan, null)`: with exactly one step in progress it attaches with the marker (c); otherwise the entry is written with `step: null` and `attachment: "unattached"`, kept and shown as an unattached fact (S3), never dropped and never put on the current step. CI is issue-level because a check covers a commit and `plan.json` has no commit field (S2); a test or mutation run covers what its arguments name (R3 and R4 mutated one file), so what is missing is the role, not the scope, and an issue-level kind would need a key and a new snapshot field for no new information. The orchestrator is role-less by default: the main session carries no `agent_type` (`n2`).

#### (e) The sixth file

**Name**: `.agent-flow/verified-facts.jsonl`. Append-only JSON Lines, one line per observed run, written only by the capture hook; two runs of the same tool are two lines. Never `decisions.jsonl`.

| Field | Value | Rule |
|---|---|---|
| `at` | ISO-8601 UTC instant | the `PostToolUse` instant, the run end (S2) |
| `tool` | `vitest`, `cucumber-js` or `stryker` | named `tool`: the extract has no `source` key (Stryker's per-file `source` text is what it must never carry) |
| `step` | a step id, or `null` | `decisionStepOf(plan, role)` at the run end; `null` when refused |
| `attachment` | `role`, `only-step` or `unattached` | `unattached` exactly when `step` is `null` |
| `role` | a `ROLE_IDS` value, or `null` | (a) |
| `roleFrom` | `host` or `agent`, or `null` | `null` exactly when `role` is `null` |
| `passed`, `total`, `failedSuites` | safe non-negative integers, `passed` not above `total` | vitest and cucumber-js only |
| `detected`, `surviving` | safe non-negative integers, sum above 0 | stryker only |

The table is refined by S12: `at` is checked as a shape, `attachment: "role"` needs a non-null `role`, and the count and pairing rules are enforced in a fixed order.

No other field (the validator refuses extras, as `core/schemas/decisions.schema.json:7` does): no failure message, no file `source`, no stdout, no command, no session or agent id. A line is about 190 bytes:

```
{"at":"2026-11-23T12:00:00.000Z","tool":"vitest","step":"1","attachment":"role","role":"dev-a","roleFrom":"agent","passed":1791,"total":1791,"failedSuites":0}
{"at":"2026-11-23T12:05:00.000Z","tool":"stryker","step":null,"attachment":"unattached","role":null,"roleFrom":null,"detected":47,"surviving":1}
```

**Reconciling with core's `{step, text}`.** The counts are exactly what core's report readers already return, `ParsedTestReport` (`core/src/snapshot/test-report.ts:3-8`) and `ParsedMutationReport` (`core/src/snapshot/mutation-report.ts:3`). So:
- At capture, the writer computes the extract with core's own `readTestReport` and `readMutationReport` (today internal to the snapshot module, `core/src/snapshot/index.ts:1`; the writer slice exports them), so the host holds no parsing rule. An over-bound report is refused by them whole, before `JSON.parse` (`test-report.ts:53`): no entry.
- At read (#112, slice C), each attached entry reaches core as `{step, text}` with `text` the entry's own line, never the report, and a third `ReportReader` beside the two of `readReports` (S8) turns the counts into the same `SnapshotFact` through `verifiedFactOf` and `mutationLabelOf`. The label of an entry equals the label of its report by construction; core tests that property. Whether entries come in as a new `SnapshotFiles` list or through `testReports`/`mutationReports` is slice C's call. An unattached entry (`step: null`) never becomes a `{step, text}`: it is slice D's input.
- At the bound: the file stays at most `MAX_TEXT_LENGTH` bytes. Recommendation for the writer slice's Tech Spec (AC8 leaves it there): an append that would pass the bound is refused and nothing is written, as `decision-append.ts:81-83` does for `decisions.jsonl`; at about 190 bytes a line, that is some 5,500 runs per issue.

#### (f) Sizes against the 1 MiB bound (`MAX_TEXT_LENGTH` = 1,048,576)

| Report | Run | Size | Share of the bound | Bash `tool_response` |
|---|---|---|---|---|
| vitest JSON, full run, all seven projects | 1791 tests, 48 files (V) | 579,947 B | 55.3% | 30,000-character preview (2.9%), whole only through `persistedOutputPath` |
| cucumber-js JSON, full run | 164 scenarios (C) | 689,994 B | 65.8% | same |
| Stryker JSON, whole repo, `stryker.config.json` | 2413 mutants, 53 files, 70 s (S) | 2,932,594 B | 279.7%: over | same; the JSON is not on stdout at all |

Consequences: a whole-repo Stryker run is refused whole and yields no fact (the `mutants` arrays are 74% of its characters, their `coveredBy` and `killedBy` test-id lists 46%, S); only a scoped run (`--mutate`, 93,560 B for one file in #108) does. The test reports fit today but grow with the suite. Extrapolated linearly, not measured: about 324 B per vitest test (the bound near 3,200 tests) and 4.2 KB per cucumber-js scenario (near 250 scenarios; #108 measured 507,745 B at 123). Both are open questions below, not changes to the bound.

#### AC2 ruling: fits one PR and one Dev lane: **no**

Cut into two slices, in this order:
- **Slice 1, the sixth file's contract** (Security lane, frozen-contract change): Part 2 AC3, and the stored-shape half of AC7 (the validator refuses any field outside the table above, so no failure text, `source` or stdout can be stored; nothing in `decisions.jsonl`). A core validator for `verified-facts.jsonl`, registered in `contract-check` (`core/src/contracts/contract-check.ts:9-15`), which still refuses other names; the `docs/plan.md` contract list. Scenario S9. Its caller is the contract check command.
- **Slice 2, the Claude Code writer** (Security lane, senior): AC4, AC5, AC6, the refusal half of AC7, AC8. The `Bash` hook and its `settings.json` entry, the command check, the role resolution, the attachment through `decisionStepOf`, the extract through core's readers, the confined report read and the confined appender (`plan-writer-confinement.md:86`), the rule line for `AGENT_FLOW_ROLE`. Scenarios S1 to S8. It depends on slice 1: its lines must pass the contract check.

Why not one: the two Security reviews differ in kind (a frozen contract against file I/O and command parsing), and slice 2 alone already spans `core`, `capture/shared`, `capture/claude-code` and `rules/` with eight scenarios. Part 2 AC5's "the tool result's own stdout is preferred" contradicts the evidence above and needs the PM's amendment to "the tool's own report file at its fixed path, written inside the observed run".

### S12 The contract check of `verified-facts.jsonl` (#125, slices S1 to S6)

S11 (e) fixed the table of the sixth file; this section records how the contract check enforces it and where it is stricter than the table. Where the two differ, S12 rules.

**Schema form plus a hook.** The check is the schema `core/schemas/verified-facts.schema.json` (names, types, required keys, `additionalProperties: false`) followed by one optional hook on the JSONL contract, `recordRule` (`core/src/contracts/jsonl.ts:11`, called after the schema at `:64`), for the rules a schema cannot say: the counts and the pairings (`core/src/contracts/verified-facts.ts:18-35`, `:39-57`). A violation is reported with its line and field like a schema one, in the same read loop. The schema's `description` states these code-checked rules (`verified-facts.schema.json:5`), and a test pins it. Rejected: extending `schema-subset` with conditional or cross-field keywords (a second validator language for one file, in a frozen shared module); a second read loop for this file (it would repeat the size bound, the flood guard and the line numbering); merging rule errors after `readJsonl` (the error cap and the flood guard would see a different error list than the one reported); `// Stryker disable` (the rules must be killed by tests, not excused); a runtime check of `role` against `ROLE_IDS` (the pattern below pins it by test, and the schema stays the one place that names the values).

**`at` is a shape, not a date.** The pattern `^YYYY-MM-DDTHH:MM:SS.mmmZ$` with month 01-12, day 01-31, hour 00-23, minute and second 00-59 (`verified-facts.schema.json:10-13`), the `toISOString` shape the writer produces. It is checked as a shape only: a calendar-impossible date such as `2026-02-30T12:00:00.000Z` passes the contract. The consumer's `instantTime` (`core/src/lifecycle/instant.ts:1-5`) round-trips the value through `toISOString` and rejects it, so the check at read time is the calendar's. The other contracts check `at` only as `minLength 1` (`requests.schema.json:11`, `responses.schema.json:10`, `decisions.schema.json:9`); this file checks the shape because its writer is a host process and its `at` is the run-end instant (S2).

**`role` and `roleFrom`.** `role` matches `^(pm|architect|dev-a|dev-b|qa|security)$`, equal to `ROLE_IDS` (`core/src/lifecycle/roles.ts:1`); a test pins the pattern to `ROLE_IDS.join('|')` (`core/src/contracts/verified-facts.test.ts:113`), so a new role id fails the test until the schema follows. `roleFrom` is `^(host|agent)$` (S11 (a)). Both use `pattern`, not `enum`, because they are `["string", "null"]`: `schema-subset` applies `enum` to a null value and refuses it (`core/src/contracts/schema-subset.ts:77`), while `pattern` applies to strings only, so null passes.

**The attachment-role tightening (human decision, 2026-11-23).** S11 (e) says `role` may be `null` and `attachment` is `role`, `only-step` or `unattached`. The human accepted a tightening on 2026-11-23: `attachment: "role"` needs a non-null `role`. A fact attached "by role" with no role names no role. `only-step` keeps a null role (S11 (c), (d): a role-less run attaches to the one step in progress). It is the only pairing rule that goes beyond S11 (e)'s table.

**The pairing rules**, after the counts, first failure wins (`verified-facts.ts:39-57`), each with the field named in the error:
1. `step` is `null` exactly when `attachment` is `unattached`: otherwise `attachment` ("must be unattached when step is null", "must not be unattached when step is set"). An unattached line may still carry a role.
2. `roleFrom` is `null` exactly when `role` is `null`: otherwise `roleFrom` ("must not be null when role is set", "must be null when role is null").
3. `attachment: "role"` with a null `role`: `role` ("must not be null when attachment is role").

**The count rules**, per tool, in this order, first failure wins (`verified-facts.ts:18-35`): each of the tool's own counts is required (`vitest` and `cucumber-js`: `passed`, `total`, `failedSuites`; `stryker`: `detected`, `surviving`); then a safe non-negative integer (`Number.isSafeInteger`, at least 0; `1e999` parses to `Infinity` and is refused); then no other tool's count is present; then the relations: `passed` not above `total` (field `passed`), and for Stryker not both `detected` and `surviving` 0 (field `detected`: a run with no mutant is no run, S11 (e) "sum above 0"). `-0` is accepted as 0: it is a safe integer, not below 0, and `JSON.stringify` writes it as `0`, so no writer produces it. The schema runs first, so a schema violation on a line hides its count and pairing violations until fixed.

**The flood-guard minimum is 138.** Past `MAX_ERRORS` (100) errors, `readJsonl` skips a line shorter than `minimumRecordLength` without parsing it (`jsonl.ts:56`). The value is derived, never chosen: the shortest valid compact line of any tool, `JSON.stringify` with `step` `"1"`, `attachment` `role`, `role` `qa` or `pm`, `roleFrom` `host`, a vitest or cucumber-js line with zero counts or a Stryker line with 0 detected and 1 surviving, is 138 characters (`verified-facts.ts:62-69`). A test derives it as the minimum over every step, attachment, role and `roleFrom` combination the pairings accept and every tool, checking each combination against the rules written out independently (`verified-facts.test.ts:168`), so a literal cannot hide a change. The pairings of this section allow no valid line shorter than 138: `only-step` or `unattached` is longer than `role`, and the role fields `null,null` (8 characters) are 2 shorter than `"qa","host"` (10) but a null `role` forces `only-step` (5 more), so the shortest such line is 141. The 136-character line with `role: "qa"` and `roleFrom: null` (the base schema accepted it) is now refused as a pairing, with its line and field, and stays named by its line number below the cap. A minimum above 138 would be wrong: it would skip a valid 138-character line once the cap is passed, so a flooded file would lose a line the check should have kept. A minimum below 138 is safe but parses lines that cannot be valid.

**Human rulings of 2026-11-23 (#125).**
- **G1**: a whole-repo Stryker report is never a fact; only scoped `--mutate` runs count. It closes the open question on whole-repo report size below, and S11 (e)'s example above now carries scoped-run counts.
- **G2**: an `agent_type` is host-observed only when it is a bare role id or carries the `agentic-team:` prefix. Any other prefix is not host-observed. It amends S11 (a) and its mapping paragraph.
- **G3**: #125 kills the Stryker survivor at `capture/shared/src/contract-check/contract-check.ts:25:80`. `checkStray` passed `''` to `checkContractFile` and Stryker mutated it to `"Stryker was here!"`; the text is ignored for a name that is not a contract file, so the mutant was equivalent. It is not in core: core `contract-check.ts` has no survivor. It is killed by construction: core exports `notContractFileError(name)` (`core/src/contracts/contract-check.ts:21-23`, `core/src/contracts/index.ts:3`), the capture side maps its stray names to it, and `checkStray` is gone.
- **G4**: with `plan.json` missing or contract-invalid, the hook writes nothing and exits 0. This is a MUST owed to #128 (the hook), not a choice left to its Tech Spec.

### Consequences per fact kind (AC6)

| Fact kind | Consequence |
|---|---|
| Test report (vitest, cucumber-js JSON) | Step-level. #110 parses it; every run is attached at capture time, which the loop counter needs (keyed by plan step and test id over consecutive runs, `loop-threshold.md:48-49`). The parser input is bounded (1 MiB); an over-bound report is refused whole, as a size error with no fact, never truncated or partly parsed. A full vitest run is 55.3% of the bound and a full cucumber-js run 65.8% (#125, S11 (f)) |
| Stryker report | Step-level only when the role that ran it has a step. #111 parses it (S8); the single report path is overwritten on every run, so it must be captured at run end, never read on poll (`json-reporter.js:23`). Carries no instant: the run-end instant is the capture instant. The same size rule applies: a whole-repo report is 279.7% of the bound and yields no fact (#125, S11 (f)) |
| CI status | Issue-level, keyed by head commit, shown apart from the steps. #114 maps every check run of `statusCheckRollup` to the top-level `ci` fact (S9); #115 reads it with `gh` for the head commit. It is never attached to a step by instant |
| Declared fact | Unchanged: `decisions.jsonl`, attached by `decisionStepOf` at write time |
| Unattached fact | Counted at issue level and reported; the slice that first produces one shapes where, additively (#112 re-slice) |

Per slice:
- **#109**: facts per step, additive; per fact `origin: verified|declared`; declared first, derived from `decisions.jsonl` only (`declaredFactOf`, `toSnapshotStep`, `core/src/snapshot/snapshot.ts`). The snapshot has no issue-level place for unattached facts or CI (`Snapshot`, same file): the slice that first produces such a fact adds it, additively (#112 re-slice for unattached facts, #114 for CI). The sixth `.agent-flow` file moves with the verified-fact writer to #112's re-slice, Security lane.
- **#112**: its title assumes the daemon reads report files on poll. Capture-time attachment means the fact-file writer is capture-side and runs when a tool run ends; #112 stays the reader of that file and needs re-slicing (its Touches are `daemon/**` and its AC4 says no parsing in `daemon/`). It also owns how the role reaches the writer. The PM re-slices; this record does not edit #112.
- **#113**: panel only, computes nothing. Step detail lists each fact after the decisions block, in snapshot order, as three lines: the badge `Verified` or `Declared` (a fixed lookup over the wire `origin` enum, `panel/client/step-detail.tsx:10`), the label verbatim and `Source: <source>`, both through `toDisplayText` (`:33-37`). An empty `facts` list renders nothing, no placeholder; the decisions empty copy (`:21`) is unchanged. No verified-fact producer exists yet, so the acceptance fixture's verified fact is a snapshot reply checked by the RPC schema (`features/support/panel-host.ts:108`).
- **Deferred from #113 until the snapshot carries the data**: the exemption copy for a step that ran no tool (decision (a)) and the issue-level display of unattached facts and CI. The snapshot has no ran-a-tool signal per step and, until #114 added `ci` (S9), had no issue-level fact field (`SnapshotStep`, `Snapshot`, `core/src/snapshot/snapshot.ts`; `panel/shared/snapshot-rpc.ts`), so a panel could show either only by computing. Each display follows the slice that adds its data: the ran-a-tool signal and unattached facts with the #112 re-slice (the capture-side writer sees the tool runs), CI with #114.
- **#116**: asserts the amended outcome, not "every completed step": every completed step that ran a test or mutation tool shows at least one verified fact with its source, and a step that ran no tool shows none and says so. The "says so" half needs the ran-a-tool signal deferred above.
- **Phase 5 loop detector**: input is the stored fingerprint of the failure message (never its text) of vitest and cucumber-js test runs only (`loop-threshold.md:50`, `:69`); the normalisation behind the fingerprint is owed to Phase 5 story 5 (`loop-threshold.md:71`, `:84`); #110 reads no failure message and builds no fingerprint (S7). Stryker and CI are excluded: neither is a per-test pass/fail run.

### Considered options

| Option | Verdict | Reason |
|---|---|---|
| Attach at capture time with `decisionStepOf(plan, role)` | Chosen | The rule decisions already use; survives parallel lanes; every run kept for the loop counter |
| Attach by the report's instant alone | Rejected | With parallel lanes it picks a step by time, not by who ran the tool (R1) |
| Attach to the current step (`currentStepOf`, `snapshot.ts`) | Rejected | Misattaches in the real #40 run and on R1 |
| Daemon reads reports at their default paths on poll | Rejected | Loses overwritten runs (Stryker, two runs, one path), and takes a report the host did not observe being produced |
| Write reports under `.agent-flow/` as they are | Rejected | The contract check refuses unknown files (`core/src/contracts/contract-check.ts:21-23`) and a report is unbounded |
| A `verified` flag in `decisions.jsonl` | Rejected | The schema forces `why` and `confidence`, refuses extra fields, would need a version bump and mixes sources |
| Infer the role from the open subagent call | Rejected | Fragile with parallel subagents (`events.md:95`) |
| A full live agent run of a whole issue | Rejected | The user rejects manual capture procedures; #40 already gives the real evidence |
| Drop an unmatched report | Rejected | Hides a fact, against `snapshot-decisions.md:71` |

## Consequences / Constraints

- **MUST**: attach a verified fact at capture time, with `decisionStepOf(plan, role)` and the role that ran the tool.
- **MUST**: report an unmatched fact unattached; never drop it, never attach it to the current step.
- **MUST NOT**: write a verified fact into `decisions.jsonl`.
- **MUST NOT**: persist a tool report as it is; the bound is 1 MiB and the cucumber message stream alone is 146% of it. The capture rule already persists an allowlist of fields only and never tool output text (`docs/technical/capture/events.md:118-119`), so a stored fact is a bounded extract of a report, never the report. The extract never includes the failure message text (vitest `failureMessages`, cucumber `error_message`), `source` or stdout. For a failing test it carries a fixed-length fingerprint of the failure message, a hash taken after the normalisation that Phase 5 story 5 defines, because the loop counter needs "the same failure message" across consecutive runs (`loop-threshold.md:48-49`) and the report itself is not kept. The normalisation is owed to the loop-detector story 5 (`loop-threshold.md:71`, `:84`), its first reader; #110 reads no failure text and builds no fingerprint (S7). This keeps `events.md:119`.
- **MUST**, met by #110 (S7) and #111 (S8): refuse an over-bound report whole (a size error and no fact, never a truncation or a partial parse), checked before `JSON.parse`. The bound is checked on UTF-16 length (`text.length`, `core/src/contracts/jsonl.ts:45`, `core/src/contracts/plan.ts:74`) while this record measures bytes, so the two differ for non-ASCII text.
- **MUST** (owed to #112): stop the read at the bound before buffering; core only ever sees text already read (confined read below).
- **MUST**, met by #124 (S10): bound the verified facts per step and the reports per build. A step keeps the last `MAX_DECISIONS_PER_STEP` (50) verified facts and counts the rest in `omittedFacts`; decisions keep the first 50 instead, so "as decisions do" (`snapshot-decisions.md:43`) holds for the count only. Core reads at most the last `MAX_REPORTS_PER_BUILD` (200) reports per kind and reports the rest with one bound error per kind. Reviewed by the Security lane on #124 (CWE-770).
- **MUST** (owed to #112, its host adapter; Security S1 on #124): read at most the latest `MAX_REPORTS_PER_BUILD` reports per kind, each at most `MAX_TEXT_LENGTH`+1 bytes, before buffering them. The core bound (S10) limits parsing CPU only; without the host bound the worst case is 400 parses of up to 1 MiB per poll (CWE-770, CWE-400). This adds a count to the stop-at-the-bound read above and the confined read below.
- **MUST** (owed to #112, its host adapter; Security S2 on #124): pass reports oldest first, in capture order. "Latest" in S10 means last in the passed order: core reads no instant, so any other order keeps and drops the wrong reports and facts.
- **MUST** (owed to #112, its host adapter): hand `buildSnapshot` only well-typed reports, a `{step: string, text: string}` per entry in an array. A failed read is an error the adapter reports, never an entry with a `null` text. Today `buildSnapshot` throws on a `null` text, a `null` entry, or a non-array `testReports`/`mutationReports`; no host passes these and TypeScript forbids them (Security S1, low, on #111, inherited from #110). If #112 cannot guarantee the shape at the boundary, core hardens `outcomeOfReport` and `readReports` instead, in #112. The omitted count, deferred from #110 (frozen surface: 4 elements declared, 4 `required_by_hypothesis: false`, S7), is delivered by #124 as `omittedFacts` (S10).
- **MUST** (owed to #112 or the capture-side slice cut from it, and #109 where it applies): the trust rules of S4 hold for every fact.
- **MUST** (owed to #112 or the capture-side slice cut from it): an attachment made through the only-step fallback (no step of the role was in progress) carries the marker that says so (rule in S2). Such a fact stays attached with its marker (S11 (c), #125).
- **MUST** (whoever shows a CI state as the state of the current work, #113 or #115): `headCommit` is the PR head commit on GitHub, not the local `HEAD`. Compare the two before showing `passed` for the current work, or a stale green shows for unpushed commits (Security observation on #114).
- **MUST** (owed to #115): validate `headRefOid` as a 40- or 64-hex object id before it reaches any `git` or `gh` argument (CWE-88). Core accepts any string (Security S1 on #114, low, deferred: the committed Gherkin uses a short fixture value); for display it is untrusted text (`snapshot-contract.md:66`).
- **MUST** (owed to #115): the raw `gh pr view --json headRefOid,statusCheckRollup` shape, `__typename` presence included, is not recorded in-repo (`evidence/verified-facts/gh-checks-pr93.json` is a curated excerpt). #115's live read confirms it and commits the evidence. Core accepts an absent `__typename` and refuses any value other than `CheckRun`.
- **MUST** (owed to #115): a failed or missing `gh` read (no PR, no auth, a `gh` error) is #115's error to report; core never reports it. Pass the `gh` stdout string or nothing: core reads a non-string as absent, so a `null` would hide the failure (Security S2 on #114, closed in core).
- **MUST** (owed to #112 or the capture-side slice cut from it): report reads are confined. Open the file with `O_RDONLY|O_NOFOLLOW|O_NONBLOCK`, require an `fstat` regular file, read at most `MAX_TEXT_LENGTH`+1 bytes, derive the path from the worktree realpath. The fact-file writer follows `plan-writer-confinement.md:86`. #112 AC1 still says "at the paths from #108" on poll, which this record rejects (Considered options): its body needs updating.
- **Out of scope**: snapshot facts (#109); the name and shape of the new `.agent-flow` fact file and the role-delivery mechanism, out of #108 and decided by #125 (S11), the file still reviewed by the Security lane; glossary terms "verified fact", "declared fact", "unattached fact" (PM gap, `docs/functional/glossary.md:43-58`), the Security-lane routing of the sixth file (carried by #112's re-slice, which does not carry it today; the orchestrator adds it there), ruling on (b).

## Open questions / Gaps

- [x] **(a)** steps that run no tools: ruled by the human, 2026-11-11 (exempt; epic #4's outcome amended).
- [ ] **Pending (b)**: drop TRX and fix `docs/plan.md:126` and the scenario at `docs/plan.md:163`. Recommendation: confirm the drop, open a follow-up ticket for the `plan.md` fixes. Human decision.
- [x] Does a fact attached through the only-step fallback stay attached (with its marker) or become unattached? **Answered by #125 (S11 (c))**: it stays attached, with `attachment: "only-step"`, the rule declared records already follow (`decision-step.ts:39-42`).
- [x] Is a role-less orchestrator mutation run unattached, or an issue-level fact like CI? **Answered by #125 (S11 (d))**: unattached (`step: null`), unless exactly one step is in progress, where (c) applies; never issue-level, because the run misses a role, not a scope. The main session carries no `agent_type` (`capture-125/hook-events.excerpt.json` `n2`).
- [x] How the role reaches the capture step when an agent runs a tool (#112). **Answered by #125 (S11 (a))**: a `PostToolUse` hook on `Bash`; the role is the event's `agent_type` when it names a role id (host-observed, present only inside a subagent, `n11`), else a leading `AGENT_FLOW_ROLE=<role-id>` on the command (agent-supplied, marked), else none.
- [x] Whether capture reads the agent transcript for steps and tool runs; the transcript could carry the role and the tool result. **Answered by #125 (S11 (b))**: no. The hook event carries what the writer needs; the transcript is an internal format carrying account ids, and a subagent's results sit in a second file (`capture-125/run.txt` H5).
- [x] A full vitest run size and a whole-repo Stryker report size against the 1 MiB bound. **Measured by #125 (S11 (f))**: vitest 579,947 B (55.3%), cucumber-js 689,994 B (65.8%), whole-repo Stryker 2,932,594 B (279.7%, refused whole); a Bash `tool_response` carries a 30,000-character preview of each (`capture-125/run.txt` V, C, S, H4).
- [x] The sixth file's name and shape, and how an entry meets core's `{step, text}` input. **Answered by #125 (S11 (e))**: `.agent-flow/verified-facts.jsonl`, one bounded extract per observed run (the counts core's readers return), handed to core as `{step, text}` with `text` the entry line, never the report.
- [x] A whole-repo Stryker run yields no verified fact: its report is 279.7% of the bound (S11 (f)). **Ruled by the human, 2026-11-23 (G1)**: accepted. A whole-repo Stryker report is never a fact; only scoped `--mutate` runs count. The bound stays as AC7 states; no larger capture-side read bound.
- [ ] The test reports grow with the suite: extrapolated, vitest reaches the bound near 3,200 tests and cucumber-js near 250 scenarios (S11 (f)); past that a full run yields no fact. Owner and remedy not decided here.
- [ ] Each decision shows twice in step detail. With real `.agent-flow/` files every decision is also a Declared fact (`declaredFactOf`, `toSnapshotStep`, `core/src/snapshot/snapshot.ts`), so its title appears once as a decision and once as `Declared` with `Source: decisions.jsonl`. The panel must not filter it (it computes nothing); deduplication, if wanted, belongs to the producer or core. Product call for the human, not decided here.
