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
  - "Which facts feed the Phase 5 loop detector, and which slices does each fact kind change?"
  - "Does a step that ran no tool owe a verified fact?"
decided_in:
  - "#108"
---

# Verified facts: sources, capture-time step attachment, separator

> **One-liner**: No tool report names a plan step, so a verified fact is attached when the tool run ends, through `decisionStepOf(plan, role)` and the role that ran the tool. A report that finds no step is shown unattached, never dropped and never pushed onto the current step. The separator is the source, not a `decisions.jsonl` field. CI is an issue-level fact keyed by commit. The spike ends with a decision and a redesigned split, not "inconclusive".
> **Links**: [[snapshot-decisions]] (orphan rule `:48`), [[decisions-jsonl-schema]] (frozen fields), [[loop-threshold]] (counter key `:48-49`, input `:50`), [[capture-events]] (step events), [[real-issue-run]] (evidence and scan rule `:94-96`). Consumers: epic #4 slices #109 to #116, epic #6 (Phase 5 loop detector).
> Pending human decisions: (a) steps that run no tools, (b) drop TRX and fix `plan.md:126`. Both are recorded below as pending; this record rules neither.

## Context

`docs/plan.md:18` keeps tool facts apart from agent claims; `docs/plan.md:126` makes Phase 3 "parse `dotnet test` (TRX), CI status via `gh`, a Stryker report" with the outcome "every completed step shows at least one verified fact". Epic #4 bets that a tool fact attaches to a plan step reliably, and its kill criterion is "facts cannot be tied to a step: the split is redesigned before any panel work".

Declared facts already attach through one rule. The decision appender calls `decisionStepOf(plan, role)` at write time (`capture/shared/src/decision-append/decision-append.ts:47`): the latest-started in-progress step of the role, else the only step in progress, else a refusal (`core/src/lifecycle/decision-step.ts:33-43`). The snapshot's "current step" is another rule, the latest-started in-progress step (`core/src/snapshot/snapshot.ts:76-88`).

How this was decided: a controlled run of the four real tools in a scratch clone, with the real seed command, the real Claude Code step hook and two steps in progress together (the #40 overlap), plus the real #40 run for CI. Raw commands, instants, sizes and hashes: `docs/technical/decisions/evidence/verified-facts/run.txt`. The operator supplies the role of each run, as the agent does for decisions (`rules/decision-logging.md:28-33`, `:46`); the run does not show how a live agent's tool run delivers its role (see Open questions).

Corrected here, not edited there (closed records and plan):
- `docs/plan.md:126` names `dotnet test` (TRX); the stack is vitest, cucumber-js and StrykerJS (`package.json:24-30`). Pending (b).
- `ci-pull-request-posture.md:36-40` cites `ci.yml:5-6`, `:17-19`, `:24-26`; they are now `ci.yml:8-9` (permissions), `:20-22` (checkout) and `:27-29` (npm ci, test, typecheck).
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
- **TRX**: dropped, as AC2 states. **Pending (b)**: held as written, the human has not ruled. Recommendation: confirm the drop and open a follow-up ticket for `docs/plan.md:126`. This record does not edit `plan.md`.
- No report names a plan step, a role or an agent: the vitest keys, the cucumber JSON keys and the Stryker keys were listed and none could carry one (`vitest.excerpt.json`, `cucumber.excerpt.json`, `mutation.excerpt.json`).

### S2 Attachment on a real run (AC3)

"Tied" means the report content itself names a plan step. By that test **every source is untied**. The rule below attaches a fact by the run's capture instant and the role that ran the tool.

**Rule (decided)**: a verified fact attaches when the tool run ends (capture time), never when a report is read later, with `decisionStepOf(plan, role)`. The role is the role that ran the tool; when that role has no step, the only step in progress is used; otherwise the fact is unattached.

| Run (evidence) | Role | Report carries a step id | Plan at capture | `decisionStepOf` result | Verdict |
|---|---|---|---|---|---|
| R1 vitest | dev-a | no | steps 1 and 2 in progress | step `1` | tied at capture |
| R2 cucumber-js | qa | no | steps 1 and 2 in progress | step `2` | tied at capture |
| R3 Stryker, run 1 | none (orchestrator) | no | steps 1 and 2 in progress | refused: `has no step in progress` | unattached |
| R4 Stryker, run 2 | none | no | only step 1 in progress | step `1` | tied at capture |
| CI on PR 93 (the #40 run) | none | no | only step 8 (architect, documentation capture) in progress | step `8` by the "only step" branch | **untied**: wrong step, see below |

Why not another rule:
- The current-step rule misattaches in a real run. In R1 it attaches the dev-a test run to step 2, the latest started (`run.txt`, parallel-lane contrast). In the real #40 run, steps 4, 5 and 6 were in progress together from 20:17:42.277Z to 20:20:27.220Z (`docs/technical/capture/evidence/real-issue-run/claude-code-rerun/plan.json:32-57`); a QA test run at 20:19 would attach to step 6, security, the latest started (`:50-58`).
- A report location read on poll loses runs. Stryker writes one file and the second run replaced the first (`run.txt`: two different hashes, one path).
- CI has no step. On PR 93 (head `a8ec9b5`) `bdd` ran 20:40:05Z to 20:40:32Z and `test` 20:40:06Z to 20:40:37Z (`gh-checks-pr93.json`); only step 8, "Documentation capture", was in progress (`plan.json:86-94`, 20:37:58Z to 20:40:51Z), and the implementation steps had ended by 20:32:36Z. Any instant rule attaches the CI of the implementation to the documentation step. A CI result belongs to a commit, so it is untied to a step by nature.

### S3 Unmatched report: shown unattached (AC3)

A fact that `decisionStepOf` refuses is **kept, counted at issue level and reported, never dropped and never pushed onto the current step**. This is the orphan rule already in force for declared records (`snapshot-decisions.md:48`, `:71`): an unmatched record is reported, never dropped silently. R3 is the real case: the orchestrator's Stryker run with two steps in progress and no role is refused with `has no step in progress`.

### S4 Separator between verified and declared (AC4)

**The separator is the source, not a field.** It is neither an existing `decisions.jsonl` field nor a new one.
- Every `decisions.jsonl` line is declared (`snapshot-decisions.md:45`). A verified fact never enters that file: the schema requires `why` and `confidence` (`core/schemas/decisions.schema.json:6`) and refuses extra fields (`:7`). `decisions.jsonl` stays unchanged.
- In the snapshot the origin is an additive field, `origin: verified|declared` (additive-only rule `snapshot-contract.md:38`; #109 AC1).
- Capture-time attachments must outlive the run, so they need a new file under `.agent-flow/`. Today the contract is five files (`core/src/contracts/contract-check.ts:9-15`, `docs/plan.md:65-71`), and any other name is refused as "is not a contract file" (`:19-27`). **A sixth file is a frozen-contract change: it is listed here for #109 and goes through the Security lane.** Its name and shape are not decided here; #112 is the slice that writes it.

### S5 Steps that ran no tool (AC5)

- The rule above is **scoped to steps that ran tools**. A step that ran no vitest, cucumber-js or Stryker run has no verified fact, and none is invented for it.
- **Pending (a)**: not ruled by the human. Recommendation: exempt such steps from the verified-fact rule and amend epic #4's outcome ("every completed step shows at least one verified fact") accordingly. Until ruled, the record only scopes the rule.
- **File-diff fact: out of Phase 3.** Cost reason: a per-step diff needs a per-step baseline commit, and `plan.json` carries none (`core/schemas/plan.schema.json:16-25`); parallel lanes share one worktree (`plan.json:32-57`), so one diff cannot be split by step. The diff stays an issue-level input for the Phase 5 scope check (`docs/plan.md:128`).

### S6 Timebox result (AC7)

Timebox: 80 tool-call turns of the executing lane, under the 200 warning ceiling. The run finished inside it with a result: **decision plus redesigned split**, not "inconclusive". The kill criterion fired in part: no source is tied by content, and CI is wrongly tied by instant, so the split is redesigned as follows.
- **Step-level verified facts**: vitest and cucumber-js test reports, and Stryker mutation reports, each attached at capture time.
- **Issue-level verified fact**: CI status, keyed by head commit, shown apart from the steps.
- Epic #4's outcome therefore holds only for steps that ran tests or mutation. Steps with no tool fall under pending (a).

What the run did not show: how a live agent's tool run delivers its role to the capture step. Today no hook sees a tool run (`capture/claude-code/settings.json:5` matches `TaskCreate|TaskUpdate` only). The rule is proven with a role the operator supplies, not with an automatic one. The decision would change only if that delivery proves impossible, and then the ticket would reopen as "inconclusive + what blocks".

### Consequences per fact kind (AC6)

| Fact kind | Consequence |
|---|---|
| Test report (vitest, cucumber-js JSON) | Step-level. #110 parses it; every run is attached at capture time, which the loop counter needs (keyed by plan step and test id over consecutive runs, `loop-threshold.md:48-49`). The parser input is bounded (1 MiB); sizes above are for the `core` project and for all scenarios, a full vitest run is not measured |
| Stryker report | Step-level. #111 parses it; the single report path is overwritten on every run, so it must be captured at run end, never read on poll (`json-reporter.js:23`). Carries no instant: the run-end instant is the capture instant |
| CI status | Issue-level, keyed by head commit, shown apart from the steps. #114 maps `statusCheckRollup` (workflow `ci` / job `test`, `bdd` / `bdd`) to a fact; #115 reads it with `gh` for the head commit. It is never attached to a step by instant |
| Declared fact | Unchanged: `decisions.jsonl`, attached by `decisionStepOf` at write time |
| Unattached fact | Counted at issue level and reported; #109 shapes where, additively |

Per slice:
- **#109**: facts per step plus an issue-level place for unattached facts and CI, additive; `origin: verified|declared`; declared first. Lists the sixth `.agent-flow` file as a frozen-contract change for the Security lane.
- **#112**: its title assumes the daemon reads report files on poll. Capture-time attachment means the writer runs when a tool run ends, so its scope changes to attach at that moment and write the fact file. It also owns how the role reaches that writer.
- **#113**: display only; shows verified and declared apart, unattached and CI apart from the steps; a no-tools step shows per (a).
- **#116**: "every completed step shows at least one verified fact" holds only for steps that ran tests or mutation, until (a) is ruled.
- **Phase 5 loop detector**: input is vitest and cucumber-js reports only (`loop-threshold.md:50`, `:69`). Stryker and CI are excluded: neither is a per-test pass/fail run.

### Considered options

| Option | Verdict | Reason |
|---|---|---|
| Attach at capture time with `decisionStepOf(plan, role)` | Chosen | The rule decisions already use; survives parallel lanes; every run kept for the loop counter |
| Attach by the report's instant alone | Rejected | With parallel lanes it picks a step by time, not by who ran the tool (R1) |
| Attach to the current step (`snapshot.ts:76-88`) | Rejected | Misattaches in the real #40 run and on R1 |
| Daemon reads reports at their default paths on poll | Rejected | Loses overwritten runs (Stryker, two runs, one path) |
| Write reports under `.agent-flow/` as they are | Rejected | The contract check refuses unknown files (`contract-check.ts:25`) and a report is unbounded |
| A `verified` flag in `decisions.jsonl` | Rejected | The schema forces `why` and `confidence`, refuses extra fields, would need a version bump and mixes sources |
| Infer the role from the open subagent call | Rejected | Fragile with parallel subagents (`events.md:95`) |
| A full live agent run of a whole issue | Rejected | The user rejects manual capture procedures; #40 already gives the real evidence |
| Drop an unmatched report | Rejected | Hides a fact, against `snapshot-decisions.md:71` |

## Consequences / Constraints

- **MUST**: attach a verified fact at capture time, with `decisionStepOf(plan, role)` and the role that ran the tool.
- **MUST**: report an unmatched fact unattached; never drop it, never attach it to the current step.
- **MUST NOT**: write a verified fact into `decisions.jsonl`.
- **MUST NOT**: persist a tool report as it is; the bound is 1 MiB and the cucumber message stream alone is 146% of it. The capture rule already persists an allowlist of fields only and never tool output text (`docs/technical/capture/events.md:118-119`), so a stored fact is a bounded extract of a report, never the report.
- **Out of scope**: the name and shape of the new `.agent-flow` fact file (#112 and Security), snapshot facts (#109), the role-delivery mechanism (#112), glossary terms "verified fact", "declared fact", "unattached fact" (PM gap, `docs/functional/glossary.md:43-58`), ruling on (a) and (b).

## Open questions / Gaps

- [ ] **Pending (a)**: steps that run no tools. Recommendation: exempt them and amend epic #4's outcome. Human decision.
- [ ] **Pending (b)**: drop TRX and fix `docs/plan.md:126`. Recommendation: confirm the drop, open a follow-up ticket for the `plan.md` fix. Human decision.
- [ ] How the role reaches the capture step when an agent runs a tool (#112). The run used an operator-supplied role.
- [ ] Whether capture reads the agent transcript for steps and tool runs; the transcript could carry the role and the tool result. This record does not decide the direction; #112 settles it with the capture design.
- [ ] A full vitest run size and a whole-repo Stryker report size against the 1 MiB bound (#110, #111).
