---
id: "verified-facts"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-11-11"
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
decided_in:
  - "#108"
  - "#110"
---

# Verified facts: sources, capture-time step attachment, separator

> **One-liner**: No tool report names a plan step, so a verified fact is attached when the tool run ends, through `decisionStepOf(plan, role)` and the role that ran the tool. A report that finds no step is shown unattached, never dropped and never pushed onto the current step. The separator is the source, not a `decisions.jsonl` field. CI is an issue-level fact keyed by commit. The spike ends with a decision and a redesigned split, not "inconclusive".
> **Links**: [[snapshot-decisions]] (orphan rule `:48`), [[decisions-jsonl-schema]] (frozen fields), [[loop-threshold]] (counter key `:48-49`, input `:50`), [[capture-events]] (step events), [[real-issue-run]] (evidence and scan rule `:94-96`). Consumers: epic #4 slices #109 to #116, epic #6 (Phase 5 loop detector).
> Human decisions: (a) steps that run no tools: ruled by the human on 2026-11-11, exempt (S5). Still pending: (b) drop TRX and fix `plan.md:126` and `plan.md:163`; this record does not rule it.

## Context

`docs/plan.md:18` keeps tool facts apart from agent claims; `docs/plan.md:126` makes Phase 3 "parse `dotnet test` (TRX), CI status via `gh`, a Stryker report" with the outcome "every completed step shows at least one verified fact". Epic #4 bets that a tool fact attaches to a plan step reliably, and its kill criterion is "facts cannot be tied to a step: the split is redesigned before any panel work".

Declared facts already attach through one rule. The decision appender calls `decisionStepOf(plan, role)` at write time (`capture/shared/src/decision-append/decision-append.ts:47`): the latest-started in-progress step of the role, else the only step in progress, else a refusal (`core/src/lifecycle/decision-step.ts:33-43`). The snapshot's "current step" is another rule, the latest-started in-progress step (`core/src/snapshot/snapshot.ts:111-123`).

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
- In the snapshot the origin is an additive field **per fact, inside `steps[].facts[]`** (shape owned by #109), `origin: verified|declared` (additive-only rule `snapshot-contract.md:38`; #109 AC1). It is not the frozen step field `origin: planned|proposed` (`core/src/snapshot/snapshot.ts:53`, `core/schemas/plan.schema.json:23`, `snapshot-contract.md:37-38`, `:62`), which stays as it is.
- Capture-time attachments must outlive the run, so they need a new file under `.agent-flow/`. Today the contract is five files (`core/src/contracts/contract-check.ts:9-15`, `docs/plan.md:65-71`), and any other name is refused as "is not a contract file" (`:19-27`). AC4's "new field" appears here as a new sixth file, and **that sixth file is the frozen-contract change for #109 and goes through the Security lane.** Its name and shape are not decided here. The writer is capture-side: it runs when a tool run ends, and no hook sees a tool run today (`capture/claude-code/settings.json:5` matches `TaskCreate|TaskUpdate` only). #112 stays the reader and needs re-slicing, see Consequences.

#### Trust: what "verified" means

Both inputs to a verified fact are agent-reachable: the report file is written by a tool into the worktree the agent controls, and the role is supplied by the operator or the agent.
- **MUST**: "verified" means parsed from a tool run whose end the capture host observed. It is not proof against an agent that forges output; it keeps tool facts apart from agent claims (`docs/plan.md:18`), nothing more.
- **MUST**: take a fact only from a tool run the host observed (a runtime PostToolUse event or a transcript tool result), never from a report file merely found in the worktree. A Bash `echo` into a report path is also a tool run the host observes, so the capture side must check that the observed command is the tool itself and prefer the tool result's own stdout over a file in the worktree.
- **MUST**: take the role from identity the host observed (hook `agent_type`, or the session) where it exists. When the role is agent-supplied (not host-observed), the attachment is marked as agent-supplied and the fact's `origin` stays `verified`, consistent with "the separator is the source".
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

What the run did not show: how a live agent's tool run delivers its role to the capture step. Today no hook sees a tool run (`capture/claude-code/settings.json:5` matches `TaskCreate|TaskUpdate` only). The rule is proven with a role the operator supplies, not with an automatic one. The decision would change only if that delivery proves impossible, and then the ticket would reopen as "inconclusive + what blocks".

### S7 Test report into a verified fact (#110)

Core takes the report as text and the step as an id. It opens no file and does not call `decisionStepOf`: attachment stays at capture (S2).

| Concern | Rule | Anchor |
|---|---|---|
| Input | `SnapshotFiles.testReports?`, a list of `{step, text}`, additive and optional. `step` is the id the capture side resolved with `decisionStepOf(plan, role)` at run end. No host passes it before #112 | `core/src/snapshot/snapshot.ts:28-32`, `daemon/src/snapshot/get-snapshot.ts:59` |
| Parser | internal to the snapshot module, not exported, tested through `buildSnapshot` | `core/src/snapshot/test-report.ts:52-64` |
| Unmatched step | one error `{file: 'test-report', location: <1-based report index>, field: 'step', message: 'is not a step of plan.json'}`, no fact, report not parsed. The message never echoes the step id (untrusted input) | `snapshot.ts:223-226` |
| Refusal | one error per report, `field: null`, fixed messages only: `exceeds 1048576 characters`, `is not valid JSON`, `is not a vitest or cucumber-js JSON report`. Report errors are capped with `capErrors`; every other fact stays | `test-report.ts:53`, `:58`, `:62`; `snapshot.ts:227-229`, `:239-242` |
| Bound | `text.length` above `MAX_TEXT_LENGTH` is refused whole, before `JSON.parse` | `test-report.ts:53` |
| vitest | an object whose `numTotalTests`, `numPassedTests` and `numFailedTestSuites` are safe non-negative integers, with passed not above total. `numFailedTests` is not read. Label `<passed> of <total> passed`, with the suffix `, run failed` only when passed equals total and failed suites are above 0 | `test-report.ts:21-26`, `snapshot.ts:80-87` |
| Why that suffix | vitest marks a suite failed when any child fails, so a red run always counts its file and describe blocks as failed suites (`node_modules/vitest/dist/chunks/run.BPv-BBRv.js:4116`), and `success` needs both counts at 0 (`cli-api.De07GUeT.js:9315`). A suffix on every red run would hide "3 of 5 passed"; the suffix only shows a red run the counts read as all passed (an import error, a failing hook) | |
| cucumber-js | an array of features, each with `elements[]`, each with `steps[]`, each with a string `result.status`. A scenario passes when every step, hidden hooks included, is `passed`; total is the number of elements. Any structural deviation refuses the whole report | `test-report.ts:28-45` |
| Fact | the #109 `SnapshotFact`, unchanged: `origin: 'verified'`, `source: 'vitest'` or `'cucumber-js'`, counts in `label`. Listed after the step's declared facts, in input order | `snapshot.ts:83-87`, `:103-106` |
| Failure text | never read: neither `failureMessages` nor `error_message` reaches a fact or an error. No fingerprint is built (story 5) | `test-report.ts:21-45` |
| Instant | none on the fact; the run-end instant is the capture instant (#112) | |

Frozen surface of #110: 4 elements declared, 4 `required_by_hypothesis: false`, none frozen. Numeric counts on `SnapshotFact`: dropped (the label carries them). The sixth `.agent-flow` file: deferred to #112. The fingerprint field: deferred to Phase 5 story 5. The per-step omitted-facts field: deferred to #112 (Consequences).

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
- **#113**: display only; shows verified and declared apart, unattached and CI apart from the steps; a step that ran no tool shows the exemption (it shows no verified fact and says so, decision (a)).
- **#116**: asserts the amended outcome, not "every completed step": every completed step that ran a test or mutation tool shows at least one verified fact with its source, and a step that ran no tool shows none and says so.
- **Phase 5 loop detector**: input is the stored fingerprint of the failure message (never its text) of vitest and cucumber-js test runs only (`loop-threshold.md:50`, `:69`); the normalisation behind the fingerprint is owed to Phase 5 story 5 (`loop-threshold.md:71`, `:84`); #110 reads no failure message and builds no fingerprint (S7). Stryker and CI are excluded: neither is a per-test pass/fail run.

### Considered options

| Option | Verdict | Reason |
|---|---|---|
| Attach at capture time with `decisionStepOf(plan, role)` | Chosen | The rule decisions already use; survives parallel lanes; every run kept for the loop counter |
| Attach by the report's instant alone | Rejected | With parallel lanes it picks a step by time, not by who ran the tool (R1) |
| Attach to the current step (`snapshot.ts:111-123`) | Rejected | Misattaches in the real #40 run and on R1 |
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
- **MUST NOT**: persist a tool report as it is; the bound is 1 MiB and the cucumber message stream alone is 146% of it. The capture rule already persists an allowlist of fields only and never tool output text (`docs/technical/capture/events.md:118-119`), so a stored fact is a bounded extract of a report, never the report. The extract never includes the failure message text (vitest `failureMessages`, cucumber `error_message`), `source` or stdout. For a failing test it carries a fixed-length fingerprint of the failure message, a hash taken after the normalisation that Phase 5 story 5 defines, because the loop counter needs "the same failure message" across consecutive runs (`loop-threshold.md:48-49`) and the report itself is not kept. The normalisation is owed to the loop-detector story 5 (`loop-threshold.md:71`, `:84`), its first reader; #110 reads no failure text and builds no fingerprint (S7). This keeps `events.md:119`.
- **MUST** (owed to #110 and #111): refuse an over-bound report whole (a size error and no fact, never a truncation or a partial parse); stop the read at the bound before buffering. The bound is checked on UTF-16 length (`text.length`, `core/src/contracts/jsonl.ts:45`, `core/src/contracts/plan.ts:74`) while this record measures bytes, so the two differ for non-ASCII text.
- **MUST** (owed to #112, before any host passes `testReports` to `buildSnapshot`): bound the verified facts per step and the reports per build. Cap verified facts per step at `MAX_DECISIONS_PER_STEP` (50), keep the latest-captured ones and count the rest in an additive per-step omitted count, as decisions do (`snapshot-decisions.md:43`). Bound the number of reports the host hands core in one build. Security lane reviews both (CWE-770). The omitted count is a new additive snapshot field, deferred from #110 to #112 (#110 frozen surface: 4 elements declared, 4 `required_by_hypothesis: false`, S7).
- **MUST** (owed to #112 or the capture-side slice cut from it, and #109 where it applies): the trust rules of S4 hold for every fact.
- **MUST** (owed to #112 or the capture-side slice cut from it): an attachment made through the only-step fallback (no step of the role was in progress) carries the marker that says so (rule in S2). Whether such a fact stays attached or becomes unattached is an open question below.
- **MUST** (owed to #112 or the capture-side slice cut from it): report reads are confined. Open the file with `O_RDONLY|O_NOFOLLOW|O_NONBLOCK`, require an `fstat` regular file, read at most `MAX_TEXT_LENGTH`+1 bytes, derive the path from the worktree realpath. The fact-file writer follows `plan-writer-confinement.md:86`. #112 AC1 still says "at the paths from #108" on poll, which this record rejects (Considered options): its body needs updating.
- **Out of scope**: the name and shape of the new `.agent-flow` fact file (#112 and Security), snapshot facts (#109), the role-delivery mechanism (#112), glossary terms "verified fact", "declared fact", "unattached fact" (PM gap, `docs/functional/glossary.md:43-58`), the Security-lane routing of the sixth file (carried by #109 and #112, which do not carry it today; the orchestrator adds it there), ruling on (b).

## Open questions / Gaps

- [x] **(a)** steps that run no tools: ruled by the human, 2026-11-11 (exempt; epic #4's outcome amended).
- [ ] **Pending (b)**: drop TRX and fix `docs/plan.md:126` and the scenario at `docs/plan.md:163`. Recommendation: confirm the drop, open a follow-up ticket for the `plan.md` fixes. Human decision.
- [ ] Does a fact attached through the only-step fallback stay attached (with its marker) or become unattached? Not decided here.
- [ ] Is a role-less orchestrator mutation run unattached, or an issue-level fact like CI? Not decided here; the run showed only that the only-step fallback attaches it by luck (R4) and refuses it with no step in progress.
- [ ] How the role reaches the capture step when an agent runs a tool (#112). The run used an operator-supplied role.
- [ ] Whether capture reads the agent transcript for steps and tool runs; the transcript could carry the role and the tool result. This record does not decide the direction; #112 settles it with the capture design.
- [ ] A full vitest run size and a whole-repo Stryker report size against the 1 MiB bound: #110 enforces the bound (S7) but measured neither (#111, #112).
