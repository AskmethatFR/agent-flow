---
id: "follow-issue-run"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-11-09"
relations:
  depends-on: ["real-issue-run", "paseo-agent-state", "snapshot-agent-status-read", "snapshot-agent-state", "panel-agent-state", "paseo-api-version"]
answers:
  - "How is a real issue set up and launched so it can be followed from the Agent Flow panel alone, without a terminal?"
  - "How does QA judge each of the four facts of the Phase 2 exit scenario: current step, time, every decision, agent state?"
  - "Where does the evidence of a follow-issue run live, and what may be committed?"
  - "Which gaps can the run expose, and which slice owns each?"
decided_in:
  - "#22"
---

# Follow-issue run: Paseo launch, per-fact verdicts, evidence

> **One-liner**: The runbook for the manual Phase 2 exit scenario (`features/phase-2/follow-issue.feature` S1): how a real issue is set up and launched as a Paseo agent in the item worktree, what the operator records while watching the panel, and how QA reaches a verdict on each fact.
> **Links**: [[real-issue-run]] (capture setup and evidence rules, linked never copied), [[paseo-agent-state]] (worktree key, launch rule), [[snapshot-agent-status-read]] (how the agent line is read), [[snapshot-agent-state]] (raw status to display state), [[panel-agent-state]] (what the panel renders), [[paseo-api-version]] (plugin install and panel entry).

## Context

S1 is tagged `@manual` (the runner skips it, `cucumber.js:15-16`): no BDD driver can make real agents work a real issue while a human watches a real Paseo app. All four facts already render (`panel/client/plan-rail.tsx:28-37`, `:39-41`, `panel/client/step-detail.tsx:10-24`); this run verifies them live and records what is missing. No production change is part of it.

The Phase 1 runs cannot stand in: both were headless `claude -p` from a terminal (`docs/technical/capture/evidence/real-issue-run/claude-code-rerun/run-setup.txt:1-2`), so no Paseo agent sat in the item worktree and no agent line would show (`daemon/src/snapshot/agent-status.ts:29-42`).

Roles: the **operator** is the human at the Paseo desktop app for the whole run (it takes about 50 minutes, as the #40 re-run did, `run-setup.txt:6`); **QA** judges the evidence afterwards; the **orchestrator** files the defects (section 7).

## 1. Setup (a terminal is allowed, and recorded)

Everything runs in the target project. Runtime: Claude Code only (OpenCode waits for #81).

| Concern | Action | Kept |
|---|---|---|
| Agent Flow checkout | `<AGENT_FLOW_HOME>` is a separate checkout **outside** `<wt>`, at a recorded commit, with `npm ci` done. It is never edited during the run: the capture hook and the decision command run from it outside the permission system, so a followed agent that could edit them could tamper with the evidence. Record `git -C "<AGENT_FLOW_HOME>" rev-parse HEAD` and `git -C "<AGENT_FLOW_HOME>" status --short` once the panel install below is done (so the install is covered), just before the launch, and again at teardown | both outputs, twice |
| Versions | `claude --version`, `node --version`, the Paseo daemon and CLI version, the Paseo desktop app version (Settings) | the outputs |
| Issue | any open agent-flow issue triaged `fix-bug` or `new-feature` (parallel review lanes exercise the current-step rule) | the issue number |
| Panel install | `paseo plugin install "<AGENT_FLOW_HOME>/panel" --json` | output; expect `"status": "running"` (as `api-version.md:126`); else a G10 candidate, stop |
| Paseo workspace | a workspace whose `cwd` is the item worktree (`<wt>`, an absolute path) | the workspace name |
| Capture settings (B5) | `<wt>/.claude/settings.local.json`, see below | the file, kept after the scan of section 5; plus a pristine copy made at setup outside `<wt>`, for the teardown diff |
| Rule shim | `CLAUDE.local.md` holding `@<AGENT_FLOW_HOME>/rules/claude-code/CLAUDE.md`, excluded locally (`real-issue-run.md:109`) | the line |
| First plan | seeded before the launch: `node "<AGENT_FLOW_HOME>/capture/shared/bin/agent-flow-plan.mjs" <wt> <digits> "$(gh issue view <digits> --json title --jq .title)"` (#78; `real-issue-run.md:37`). `<wt>` must be absolute without `.` or `..` segments (`capture/shared/src/plan-seed/plan-seed.ts:25-27`); the issue is digits only, so `22`, never `#22` (`core/src/lifecycle/step-lifecycle.ts:34`, `:175-176`); the title is passed as one quoted word through command substitution, never typed into the command line | command and exit code |

`<wt>/.claude/settings.local.json` replaces what [[real-issue-run]] sets through the shell: the `export` of `AGENT_FLOW_HOME` (`:31`), `--settings` (`:33`), `CLAUDE_CODE_ENABLE_TODO_TOOLS` and the `--tools`/`--allowedTools` of the task tools (`:34`), and the decision-command Bash rule (`:35`), because the agent is launched from the Paseo app, which passes none of them:

| Key | Content |
|---|---|
| `hooks` | the `hooks` block of `capture/claude-code/settings.json:2-15`, verbatim (the `PostToolUse` hook on `TaskCreate\|TaskUpdate`) |
| `env` | `AGENT_FLOW_HOME=<AGENT_FLOW_HOME>` (absolute) and `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` |
| `permissions.allow` | `TaskCreate`, `TaskUpdate`, and the one decision-command rule `Bash(node "${AGENT_FLOW_HOME:?}/capture/shared/bin/agent-flow-decision.mjs" *)`. The rule text is the start of the command template of `rules/decision-logging.md:29`, written literally (the shell resolves `${AGENT_FLOW_HOME:?}` from the `env` block at run time). No leading wildcard: `node *agent-flow-decision.mjs*` would match any `node` command containing that name. Record the rule used |

Whether Claude Code's matcher accepts that anchored rule on a decision call is not yet verified live: the call carries `$(...)` substitutions and a heredoc, and the literal `${AGENT_FLOW_HOME:?}` in a rule has not been seen to match. If the app prompts on a decision call, the operator, in the Paseo app (no terminal), follows these limits:

- approve **once** only, never "always allow" or "don't ask again" (that can save a broader rule into `settings.local.json`);
- approve only the exact template shape: the rule text, the one quoted heredoc, and the trailing `date` substitution, with no other `$(`, `;`, `&&`, `|` or `>`, and no line equal to the heredoc end marker inside the heredoc body (`rules/decision-logging.md:44`);
- count the prompts and record that number as a deviation in the results row;
- at teardown, diff the settings file against its setup copy (section 5), so a rule added during the run is caught.

The worktree's `.agent-flow/` is touched by nothing but the seeding step, the hook and the decision command; the no-human-edit protocol of [[real-issue-run]] is not repeated here (out of scope). The settings file persists after the run unless removed: teardown (section 5) deletes it.

## 2. Launch (no terminal from here on)

| Rule | Detail |
|---|---|
| Launch convention (B4) | the item's agent is launched from the Paseo app, inside the Paseo workspace whose `cwd` is `<wt>`. The panel is opened in the same workspace. An agent launched by another agent elsewhere inherits its caller's workspace and maps to no item (`agent-state.md:111-120`), so that launch is excluded. This is the launch convention that `agent-state.md:164` makes a MUST and `:174` leaves open; #41 deferred it (`snapshot-agent-status-read.md:85`), so this runbook is where it lands |
| Permission mode | the Paseo app's default mode, or the accept-edits mode (`acceptEdits`, as `run-setup.txt:2` used). `bypassPermissions` and any full-access mode are forbidden. Record the mode used |
| Prompt | adapted from `run-setup.txt:8-17`: keep the issue sentence, the plan-with-task-tools sentence, the "log decisions with the decision command" sentence, the pull-request sentence and the `.agent-flow/` prohibition; drop the headless parts (the `-p` form, `--output-format`, the "no human is available" sentence, since the operator is present). Record the prompt as sent, with home paths replaced by `<home>` |
| Open the panel | Ctrl+K, "Open Agent Flow" (`api-version.md:129`) |
| Follow window | starts at the launch in the Paseo app; ends when the last step of `plan.json` is `done` |
| Precondition | the first plan step appears on the rail within 5 minutes of the agent's first plan. Otherwise it is a setup defect: stop, file it, and the run does not count |

## 3. Observation

A **terminal** is any shell session the operator types into, including the terminal of the Paseo app itself. The checkpoint tools are not terminals: the operating system's screenshot tool, whose file carries the capture time, and a graphical text editor for `observations.md`.

The operator keeps a **checkpoint** at each of these moments: every move of `Current` to another step; at least every 10 minutes; and once per step, pressing that step after it is done to open its decisions. A checkpoint is a screenshot, and its time `t` is the capture timestamp of that screenshot (machine clock, converted to UTC, to the second). No time is typed from memory.

The captured region holds the panel and the status indicator of the launched agent in the Paseo app, so AC4 can be judged from the screenshot alone. If no single rectangle holds both, the operator takes a second region capture within 5 s of the first and pairs the two under the same checkpoint (`t` is the first one's); every crop is made at capture time, because `t` comes from the file's own timestamp, which a later edit would rewrite. It holds no other project or agent title (the Paseo sidebar lists them): the operator crops or arranges the windows to leave them out. A step whose detail does not fit one screen gets several numbered screenshots (`<step>-1`, `<step>-2`) that overlap, so that no decision falls between two of them.

One line per checkpoint in `observations.md`:

`time | current step | time label | agent line | Paseo agent status`

| Column | Source |
|---|---|
| time | `t`, UTC, to the second |
| current step | the row carrying `Current` (`plan-rail.tsx:31`), or `none` |
| time label | the label under that row (`plan-rail.tsx:28-30`), as shown |
| agent line | the two lines after `Current`: `Agent: <role>` and the state (`plan-rail.tsx:32-37`), or `none` |
| Paseo agent status | the status text of the launched agent exactly as the Paseo app shows it in the same screenshot (or its paired capture), raw and unmapped; QA maps it afterwards with the AC4 table |

Every checkpoint must be judgeable from its screenshot alone: the rail, the `Current` marker, the label, the agent lines and the Paseo agent status are visible in it.

## 4. Verdict rules

QA reads `observations.md` and the screenshots against copies of the final `plan.json` and `decisions.jsonl` (section 5).

**Transition grace.** The panel polls every 2 s (`panel/client/use-snapshot-polling.ts:5`) and shows what the last poll returned, so a screenshot can lag the files by one interval plus the call and the render. QA allows **N = 5 s**: a checkpoint passes AC2 and AC4 if its screenshot matches the expected value at `t` or at any instant in `[t - 5 s, t]`. Beyond that window a mismatch is a fail. The Paseo status is only known at `t`: when the operator sees an AC4 mismatch at a checkpoint, a follow-up screenshot at least 5 s later is taken (a checkpoint of its own), and QA treats the mismatch as a fail unless that follow-up shows a Paseo status different from the one at `t` (the status was in transition).

| Fact | Pass when | Fail when |
|---|---|---|
| **AC2 current step and its time** | `Current` marks the in-progress step that started last at `t` (by the step's `status`, as the panel does; `startedAt` and `endedAt` are the cross-check, and they agree on recorded data; first in plan order on a tie, `docs/functional/glossary.md:55`), and the label agrees with the elapsed time `d = t - startedAt`. Labels are compared as whole minutes (`core/src/snapshot/time-spent.ts:20-27`): `< 1 min` is 0, `N min` is N, `H h M min` is 60H + M, `H h` is 60H. The shown minutes differ from `floor(d / 60 s)` by at most 1 | `Current` marks another step, or the minutes differ by more than 1, or there is no marker while a step is in progress. No marker is right only when no step is in progress at `t` (or at some instant in `[t - 5 s, t]`) |
| **AC3 every decision of every step** | the detail of each step lists, in file order, every `decisions.jsonl` line carrying the step id, each with title, why, role and confidence. "No decision logged for this step." appears only for a step with no line. `Decisions not shown: N` appears only for a step with more than 50 lines (`core/src/snapshot/snapshot.ts:11`, `:162-165`), and N is the excess. A line that the panel reports as an error line (malformed, or naming a step absent from `plan.json`) is excluded from "missing": malformed lines are reported at `core/src/snapshot/snapshot.ts:154` and `:174` (QA records them under G11), orphans at `:157-160` (QA records them under G8) | a valid line is missing, repeated or out of order, the empty text shows for a step that has a valid line, or the marker shows at 50 or fewer |
| **AC4 agent state on the current step** | at every checkpoint with `Current`, the next lines are `Agent: <that step's role>` and the state core derives from the Paseo status: `running` or `initializing` shows `running`; `idle`, `error` or `closed` shows `stopped`; any other status shows `unknown` (`core/src/agent-state/agent-state.ts:3-12`; [[snapshot-agent-state]] `:45`, which rejected `initializing` as `unknown` at `:63`). The Paseo status is the raw text recorded in `observations.md`, which QA maps to `running`, `initializing`, `idle`, `error` or `closed` (a text that fits none is an other status), stating the mapping used in the verdict; it is judged through the grace window, in `[t - 5 s, t]`, with the follow-up rule above | a `Current` without an agent line is a fail, whatever the cause; also a wrong role, or a state that the mapping does not give for the Paseo status |
| **AC1 panel only** | the operator signs: "I did not open a terminal between launch and the last step done", and every checkpoint is judgeable from its screenshot alone | the line is absent or false, or a checkpoint needs information from outside its screenshot |
| **AC5 gaps filed** | a gap is **confirmed** when (a) an AC1 to AC4 fact failed, or (b) a section 6 gap that has an owning slice was observed by QA. Every confirmed gap has a defect (issue number in section 7) against its owning slice before #22 closes. The by-design rows (G3, G4) have no owning slice: they need no defect, only a record in section 7 | a confirmed gap has no filed defect, or an observed by-design row is not recorded in section 7 |

**Ruling.** The need of #22 is that the MVP is done only when a real issue can be followed from the panel alone. A failed AC1, AC2, AC3 or AC4 therefore **fails the MVP exit**. Each failure is filed as a defect against its owning slice (AC5), #22 stays open, and it closes only when a re-run passes all four facts. A fail is a candidate gap (section 6); QA says which row it matches, or adds a new one. A failed fact is always filed, even when it resembles a by-design row.

## 5. Evidence

| Rule | Detail |
|---|---|
| Location | `docs/technical/paseo/evidence/follow-issue-run/` |
| Kept | `observations.md`, the screenshots, the setup record (versions, commands, settings file, permission mode, prompt as sent), the attestation line, copies of the final `plan.json` and `decisions.jsonl` |
| Before any copy | until scanned, every evidence file stays in a folder **outside** `<wt>` and outside the repository. Scan every text file for secrets and home paths (patterns: `spikes/capture/shared/secrets.mjs:1-19`, as `real-issue-run.md:93-94`); the operator reviews every screenshot by eye for home paths, tokens, other projects and agent titles |
| Home paths | in the setup record and the prompt, replace a home path by `<home>`, as `run-setup.txt` does. The copies of `plan.json` and `decisions.jsonl` are never rewritten |
| On a hit | commit hashes only, never the file or the image (a settings file or a screenshot that carries a secret is not kept, only its hash) |
| Who commits | the operator hands the folder over; the orchestrator commits it after QA's verdict |
| Teardown (terminal allowed again) | after the last step is done and the evidence is copied: diff `<wt>/.claude/settings.local.json` against its setup copy and record the diff (a rule added during the run is a deviation), then delete it, so the allow rule does not outlive the run; record the second `rev-parse` and `status --short` of `<AGENT_FLOW_HOME>`. A changed commit or a dirty checkout voids the run |

## 6. Gap candidates

The run may confirm these (confirmed: see AC5). Anything else QA finds is added to section 7. A by-design row is only recorded; every other row, once confirmed, gets a defect against its owner.

| # | Gap | Anchor | Owner if confirmed |
|---|---|---|---|
| G1 | No agent line when the agent is not a Paseo agent in the item worktree | `daemon/src/snapshot/agent-status.ts:29-42`; `agent-state.md:111-120` | #41 |
| G2 | The live read of `project.checkout.worktreeRoot` from `agents.list` has never been exercised | `snapshot-agent-status-read.md:30`, `:91`; `agent-state.md:175` | #41 |
| G3 | No `Current` while nothing is in progress (6 min 12 s and 3 min 25 s windows in the #40 re-run) | `core/src/snapshot/snapshot.ts:76-88`; `glossary.md:55`; `claude-code-rerun/plan.json:30-65` | none (by design): no defect; QA records it in section 7 |
| G4 | Parallel lanes: only the latest-started lane is `Current` and carries the agent line | `core/src/snapshot/snapshot.ts:76-88`; `plan-rail.tsx:31-37` | none (by design): no defect; QA records it in section 7 |
| G5 | Rework steps are listed after later steps | `claude-code-rerun/plan.json:68-85`; `plan-rail.tsx:24` | #19 if judged unreadable |
| G6 | Raw status text such as `(in_progress)` on each row | `plan-rail.tsx:27` | #19 if judged |
| G7 | More than 50 decisions in a step cannot all be read | `core/src/snapshot/snapshot.ts:11`, `:162-165` | #101 if hit |
| G8 | Orphan or transient decisions show only as error lines | `core/src/snapshot/snapshot.ts:157-160`; `snapshot-decisions.md:90` | #39 if persistent |
| G9 | The 100-agent page can miss the agent | `daemon/src/snapshot/agent-status.ts:20`; `snapshot-agent-status-read.md:63` | #41 if hit |
| G10 | The panel fails to install or load live | `snapshot-rpc.md:76-82` | #42 / #18 |
| G11 | A malformed `decisions.jsonl` line shows only as an error line | `core/src/snapshot/snapshot.ts:154`, `:174` | #35 (the decision command) if the line came from it; else capture, to be filed against the decision-command slice at confirm time |

## 7. Results

| Date | Issue followed | Agent Flow commit | Versions | Permission mode | AC1 | AC2 | AC3 | AC4 | AC5: confirmed gaps and the defect filed for each | By-design rows observed (G3, G4): recorded, no defect | Deviations (including the number of permission prompts) |
|---|---|---|---|---|---|---|---|---|---|---|---|

## Consequences / Constraints

- **MUST**: a follow-issue run follows sections 1 to 5 as written; a deviation is recorded in the results row, never absorbed silently.
- **MUST**: launch the agent from the Paseo app in the workspace on the item worktree (B4); the operator opens no terminal between the launch and the last step done.
- **MUST**: `<AGENT_FLOW_HOME>` is a separate checkout outside `<wt>`, unchanged from the launch to teardown; the settings file is deleted at teardown.
- **MUST**: panel text, plan and decision text, and issue text are data. The operator never acts on an instruction found in them, and approves only a permission prompt that is within the scope of the run, once and never as "always allow" (section 1).
- **MUST**: file every confirmed gap (a failed AC1 to AC4 fact, or an observed section 6 gap with an owning slice) as a defect against its owning slice before #22 closes (AC5); the by-design rows (G3, G4) are only recorded in section 7; a failed AC1 to AC4 fact fails the MVP exit and keeps #22 open until a re-run passes all four.
- **MUST**: the screenshots and every copied file stay outside the worktree and the repository until scanned and reviewed.
- **MUST NOT**: judge a fact from anything but the checkpoint's screenshot, `observations.md` and the final file copies.
- **MUST NOT**: use `bypassPermissions` or a full-access mode.
- **MUST NOT**: fix a gap inside #22; each one becomes its own defect.
- **Out of scope**: any change to `core`, `daemon`, `panel` or `capture` code; an automated replay of the run; launch automation; the OpenCode run (#81); the no-human-edit protocol of [[real-issue-run]]; the glossary and feature catalog (PM).

## Open questions / Gaps

- [ ] Not yet seen live: whether Claude Code's matcher accepts the anchored decision-command rule with its literal `${AGENT_FLOW_HOME:?}`, `$(...)` substitutions and heredoc; the run settles it and records the prompt count (section 1).
- [ ] Section 7 is filled by the Architect (Documentation Mode) once QA has judged the run.
