# Agent Flow

A panel that shows where AI agents are on their plan, what they decided, and what is waiting for a human decision.

**Host-agnostic.** Paseo (workspace panel) is the first host. The same `core` must also run in other tools or locally (standalone), so everything host-specific lives in a host adapter.

## Goal

Three outcomes, in this order:

1. **Know precisely where we are** on each issue, at a glance.
2. **Prevent drift**: deviations from the plan, the spec or the issue scope are surfaced and must be approved before agents act on them.
3. **Stop wasting time**: show who is waiting for a human answer and which agent is looping.

## Design principles

- **The plan is the backbone.** Every problem (question, deviation, loop) is attached to the plan step where it happened.
- **Verified vs declared.** Facts coming from tools (test results, CI, mutation report, file diff) are shown separately from claims written by an agent.
- **One "To decide" queue**, oldest item first, across all steps.
- **Time spent only.** No estimates or budgets in v1.
- **Agent-agnostic.** Must work with both Claude Code and OpenCode v2 agents.
- **Parallel by default.** Several orchestrators run at the same time, each in its own worktree, each picking its own ticket. The plugin must handle many active worktrees independently.

## Out of scope for v1

- Time estimates and step budgets
- Editing the plan from the UI
- Cost or token dashboards (token counts may still be used internally for loop detection)

## Design reference

Mockup (version 3, plan rail + step detail + "To decide" queue + agents + mobile view): [`docs/design/agent-flow-mockup.html`](design/agent-flow-mockup.html) (interactive, open in a browser) and [`docs/design/agent-flow-mockup.pdf`](design/agent-flow-mockup.pdf). The mockup text is in French and uses fictitious data: it is an information reference only. The product UI is in English.

The mockup shows budget bars: they are out of scope, show time spent only.

## Platform constraints (Paseo)

- The UI is a **workspace panel**, opened as a workspace tab.
- Panels are **React Native** components. The HTML mockup is a visual reference only, not reusable code.
- Plugins run on desktop, browser, iOS and Android. One codebase for desktop and mobile.
- Paseo compiles TypeScript itself; most plugins need no build step.
- Backend logic runs daemon-side through plugin RPCs and the Paseo TypeScript SDK.
- **The plugin API is experimental** and breaking changes are expected (a plugin declares its supported Paseo range in `paseo-plugin.json` → `requirements.paseo`; Agent Flow targets `">=0.11.4"`, the 0.8 entry-split baseline). Keep business logic out of the UI layer.

Docs: https://paseo.sh/docs/plugins and https://paseo.sh/docs/plugins/reference

## Architecture

```
agent-flow/
├── core/        Pure TypeScript, no host imports. Parsers, step timing,
│                drift detection, loop detection. Fully unit tested.
├── daemon/      Paseo adapter: watches worktree files, exposes RPCs,
│                calls the SDK (agent state, sending answers).
└── panel/       React Native panel. Display and user input only.
```

Rule: `panel` never computes anything. `daemon` never contains business rules. Everything that can be tested without a host lives in `core`.

The layout above is the Paseo host. A later local/standalone host reuses `core` unchanged; the exact host-adapter boundary is decided in Phase 0 (open question 7).

### Data directory (per worktree)

```
<worktree>/.agent-flow/
├── plan.json         Steps, status, start/end timestamps
├── decisions.jsonl   One line per decision, appended by agents
├── requests.jsonl    Questions and deviation approvals awaiting a human
├── responses.jsonl   Human answers, read back by agents
└── scope.json        Expected files/paths for the issue
```

## Data contracts (draft, to freeze in Phase 0)

### plan.json

```json
{
  "issue": "#142",
  "title": "Magic link authentication",
  "steps": [
    {
      "id": "s4",
      "title": "Implementation",
      "role": "dev-a",
      "status": "in_progress",
      "origin": "planned",
      "startedAt": "2026-10-22T10:31:00Z",
      "endedAt": null
    }
  ]
}
```

- `status`: `todo` | `in_progress` | `done`
- `origin`: `planned` | `proposed` (proposed steps require approval)

### decisions.jsonl

```json
{"at":"2026-10-22T11:20:00Z","step":"s4","role":"dev-a","model":"sonnet","kind":"decision","title":"Inject TimeProvider to test expiration","why":"Tests token lifetime without real waiting","rejected":["real waits in tests"],"confidence":"high"}
```

- `kind`: `decision` | `step_event` | `question` | `deviation`
- `confidence`: `high` | `medium` | `low`

### requests.jsonl / responses.jsonl

```json
{"id":"r-0007","at":"2026-10-22T11:48:00Z","step":"s4","role":"dev-b","type":"question","text":"Is the link valid on two devices?","options":["Single use","Valid 15 min everywhere"],"blocking":true}
```

```json
{"id":"r-0007","at":"2026-10-22T12:35:00Z","answer":"Single use"}
```

- `type`: `question` | `added_step` | `out_of_scope` | `out_of_spec`

## Phases

| Phase | What we build | Done when |
|---|---|---|
| **0. Framing** | Target the Paseo range `requirements.paseo: ">=0.11.4"` (decided, #10). Spike: hello-world workspace panel; confirm the SDK can read agent state and send a message to an agent. Freeze data contracts. Confirm capture options for Claude Code and OpenCode v2. | An empty panel renders on desktop and mobile. Contracts are frozen. Open questions below have answers. |
| **1. Data capture** | Hooks/plugins for Claude Code and OpenCode v2 that write `plan.json` with timestamps. CLAUDE.md / agent rules so every role appends to `decisions.jsonl`. | A real issue produces correct files with no human intervention, for both agent runtimes. |
| **2. Read-only panel** | Daemon watches `.agent-flow/`. Panel shows the plan rail with time spent per step, step detail, decisions per step, agent state. | A real issue can be followed end to end without opening a terminal. |
| **3. Verified facts** | Parse `dotnet test` results (TRX), CI status via `gh`, Stryker report. Display verified and declared facts separately. | Every completed step shows at least one verified fact. |
| **4. "To decide" queue** | Agents write to `requests.jsonl` and stop when `blocking`. Panel lists requests oldest first and writes answers to `responses.jsonl` / sends them through the SDK. | A question asked by an agent is answered from a phone and the agent resumes on its own. |
| **5. Drift detection** | Out-of-scope files (diff vs `scope.json`), proposed steps, modified Gherkin scenarios (file fingerprints), loops (same test failing 3 times in a row). | Each deviation type is detected on a deliberately provoked case. |
| **6. Multi-issue view** | Strip of active issues across worktrees with state: progressing, waiting on you, looping. | All active issues are visible without switching workspace. |

**MVP = Phases 0 to 2.** Phase 1 is the most critical: if capture is unreliable, everything downstream displays wrong data.

## Acceptance scenarios (Gherkin lite)

### Phase 1
```gherkin
Scenario: Step timing is captured automatically
  Given an agent starts the step "Implementation"
  When the agent marks the step as done
  Then plan.json contains startedAt and endedAt for that step

Scenario: Decisions are logged by every role
  Given an agent makes a technical choice
  Then decisions.jsonl contains a line with step, role, title, why and confidence
```

### Phase 2
```gherkin
Scenario: Time spent is visible per step
  Given a step started 38 minutes ago and is still in progress
  When I open the panel
  Then the step shows "38 min" and is marked as current

Scenario: Decisions are scoped to the selected step
  Given decisions exist for several steps
  When I select the step "Architecture"
  Then only decisions made during "Architecture" are listed
```

### Phase 3
```gherkin
Scenario: Verified and declared facts are distinguished
  Given dotnet test reports 3 of 5 scenarios passing
  And the agent declares "scenario 4 is almost done"
  Then the first fact is shown as verified with its source
  And the second fact is shown as declared by the agent
```

### Phase 4
```gherkin
Scenario: A blocking question pauses the agent
  Given an agent writes a blocking question
  Then the agent stops working on that step
  And the question appears in the "To decide" queue with its waiting time

Scenario: Answering from the panel resumes the agent
  Given a blocking question is in the queue
  When I choose an answer
  Then the answer is delivered to the agent
  And the agent resumes
```

### Phase 5
```gherkin
Scenario: Out-of-scope change is flagged
  Given scope.json lists the expected paths for the issue
  When an agent modifies a file outside those paths
  Then an "out_of_scope" request is added to the queue

Scenario: Loop is detected
  Given the same test fails 3 times in a row with the same error
  Then the agent is marked as looping
```

## Development rules

- TDD, Gherkin and mutation testing are mandatory, as for every project.
- `core` is tested classicist style (Chicago school): real collaborators, no mocks for internal code.
- Mutation testing on `core` with StrykerJS.
- `daemon` and `panel` stay thin; test them through integration tests where useful.

## Open questions (answer in Phase 0)

1. Which Paseo API version do we target: v0.7 or v0.8?

   Answer: neither "v0.7" nor "v0.8" as such — Paseo has no separate plugin API version; the plugin declares `requirements.paseo: ">=0.11.4"` in `paseo-plugin.json` (the 0.8 runtime-entry split into `index.client.*` / `index.server.*` is the baseline). Record: #10, `docs/technical/paseo/api-version.md`.

2. Can a plugin send a message to a running agent through the SDK, or must answers go through `responses.jsonl` only?

   Answer: pending — blocked by #27 (spike: message a running agent and decide how a blocked agent waits). Record: #27.

3. What is the OpenCode v2 equivalent of Claude Code hooks for capturing plan updates?

   Answer: OpenCode v2 has no hooks; the equivalent is a plugin module (`.opencode/plugins/*.js`, `export default { id, async setup(ctx) }`) using `ctx.tool.hook("execute.before" | "execute.after")` and the bus stream `ctx.event.subscribe()`; Claude Code keeps command hooks (JSON on stdin, registered in settings). Record: #12, `docs/technical/capture/events.md`.

4. How does a blocked agent wait: stop and poll `responses.jsonl`, or a Paseo-native mechanism?

   Answer: pending — blocked by #27 (spike: message a running agent and decide how a blocked agent waits). Record: #27.

5. Where does `scope.json` come from: a section of the GitHub issue template, or written by the PM/Architect role?

   Answer: derived from the `## Touches` section of the GitHub issue and written by a confined writer that reads the issue body, invoked by the role that runs `refine-ticket` (PM spawn or orchestrator); no implementing role and no Architect writes it. Record: #36, `docs/technical/decisions/scope-origin.md`.

6. Loop threshold: is "3 identical failures" enough, or do we also need a token-based threshold?

   Answer: "3 identical failures" is enough — a loop is the same test failing 3 consecutive runs with the same failure message, computed from verified test reports only; no token-based threshold in v1. Record: #36, `docs/technical/decisions/loop-threshold.md`.

7. Host-adapter boundary: what does a non-Paseo host (local CLI or web) need from `core`, and which interfaces does each host implement?

   Answer: functional core, host shell — `core` exposes only pure, synchronous functions over plain values (raw `.agent-flow/` text and instants in; values and `ContractError` lists out; nothing throws) and calls nothing on the host; each host implements six capabilities: file access, change notification, agent state, message delivery, clock, snapshot transport (message delivery is provisional — `responses.jsonl` floor decided, Paseo path pending #27). Record: #25, `docs/technical/decisions/host-adapter-boundary.md`.
