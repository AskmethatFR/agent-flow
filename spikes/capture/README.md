# Capture spike (#12)

Throwaway proofs that "step started" / "step done" events can be captured on Claude Code and OpenCode v2. The written finding is `docs/technical/capture/events.md`; the committed samples are its evidence.

## Layout

| Path | Role |
|---|---|
| `shared/recorder.mjs` | Sanitizer and append-only JSONL recorder used by both runtimes |
| `claude-code/` | `run.sh`, `settings.json` (hooks), `agents.json` (`step-worker`), `record-hook.mjs`, `samples/events.jsonl` |
| `opencode/` | `run.sh`, `opencode.json`, `.opencode/plugins/agent-flow-capture.js`, `samples/events.jsonl` |
| `verify.mjs` | Offline check of both sample files, no model call |

## Commands

```
bash spikes/capture/claude-code/run.sh
bash spikes/capture/opencode/run.sh precheck
AF_OPENCODE_MODEL=anthropic/claude-haiku-5-5 bash spikes/capture/opencode/run.sh
node spikes/capture/verify.mjs
```

Each `run.sh` deletes its own `samples/events.jsonl` first and makes exactly one model call under `timeout 300`.

## Prerequisites and versions

Claude Code 2.1.310, OpenCode 2.1.4, Node 22. No package install, no dependency.

| Runtime | Model | Cost |
|---|---|---|
| Claude Code | `haiku` (resolved `claude-haiku-5-5`), `--max-budget-usd 0.50` | 0.37 USD reported by the run |
| OpenCode | `anthropic/claude-haiku-5-5` | well under 0.01 USD reported per step |

## Isolation

Claude: `--settings` with this folder's hooks, `--setting-sources project` (drops user hooks), `--tools` limited to the task tools and `Agent`, `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`, `--no-session-persistence`. OpenCode: `--standalone`, project `.opencode/`, `opencode.json` denying `bash`, `edit`, `webfetch` and enabling `experimental.todo`.

Residuals: user CLAUDE.md files and global OpenCode plugins still load. Neither writes into the repository. The Claude sample keeps one `/tmp/claude-<uid>/...` output path inside the `Agent` tool response.

## Sanitization

The recorder replaces the repository root with `<repo>` and the home directory with `~`, reduces transcript paths to a basename, truncates strings over 200 characters, drops keys matching token, secret, key, auth, cookie or password, and redacts token-shaped strings. `verify.mjs` checks that no `/home/` and no token shape remains.

## Deviations from the plan

OpenCode needed one re-run: the first run found no `todowrite` tool until `experimental.todo` was set. `opencode models` failed twice with "Location plugins did not finish activating" and succeeded when run with debug logs.

## Definition of Done exemptions

No Gherkin (research), no mutation testing (no `core/`), no unit tests on the recorders (throwaway). Replaced by `verify.mjs`, observed red with no samples and green with both runs recorded.
