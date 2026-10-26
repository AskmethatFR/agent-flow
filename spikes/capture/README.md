# Capture spike (#12)

Throwaway proofs that "step started" / "step done" events can be captured on Claude Code and OpenCode v2. The written finding is `docs/technical/capture/events.md`; the committed samples are its evidence.

## Layout

| Path | Role |
|---|---|
| `shared/recorder.mjs` | Sanitizer and append-only JSONL recorder used by both runtimes |
| `shared/secrets.mjs` | The single list of secret key names, token shapes and path leaks, used by the recorder and by `verify.mjs` |
| `shared/finalize-samples.mjs` | Deterministic post-processing: trims records after the run's end marker and re-applies the sanitizer to both committed samples |
| `claude-code/` | `run.sh`, `settings.json` (hooks), `agents.json` (`step-worker`), `record-hook.mjs`, `samples/events.jsonl` |
| `opencode/` | `run.sh`, `opencode.json`, `.opencode/plugins/agent-flow-capture.js`, `samples/events.jsonl` |
| `verify.mjs` | Offline check of both sample files and of the leak detectors, no model call |

## Commands

```
bash spikes/capture/claude-code/run.sh
bash spikes/capture/opencode/run.sh precheck
AF_OPENCODE_MODEL=anthropic/claude-haiku-5-5 bash spikes/capture/opencode/run.sh
node spikes/capture/shared/finalize-samples.mjs
node spikes/capture/verify.mjs
```

Each `run.sh` deletes its own `samples/events.jsonl` first. `run.sh` without a subcommand makes exactly one model call under `timeout 300`; `precheck` makes none.

## Warning: the OpenCode plugin must stay opt-in

The plugin is inert unless `AF_CAPTURE_FILE` names its output file; only `opencode/run.sh` sets it, and only on the `opencode run` call (and on the `precheck` gate check, which writes to a scratch file it deletes). Without that gate, a project plugin registered in the long-lived `opencode serve --service` process records all OpenCode traffic on the machine into the committed sample (this happened: 11 stray records at review time, 36 at the final trim). Run any OpenCode command that loads the folder with `--standalone` where the command supports it (`opencode debug config` has no such flag; `precheck` only counts a string in its output). A service started before the gate existed still holds the old plugin in memory and needs a restart. After any OpenCode activity on the machine, run `node spikes/capture/shared/finalize-samples.mjs` then `node spikes/capture/verify.mjs`: `verify.mjs` fails when a record follows the run's `location.shutdown`.

## Prerequisites and versions

Claude Code 2.1.310, OpenCode 2.1.4, Node 22. No package install, no dependency.

| Runtime | Model | Cost |
|---|---|---|
| Claude Code | `haiku` (resolved `claude-haiku-5-5`), `--max-budget-usd 0.50` | 0.37 USD reported by the run |
| OpenCode | `anthropic/claude-haiku-5-5` | well under 0.01 USD reported per step |

## Isolation

Claude: `--settings` with this folder's hooks, `--setting-sources project` (drops user hooks), `--tools` limited to the task tools and `Agent`, `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`, `--no-session-persistence`.

OpenCode: `--standalone` gives the run a private server process; it does not isolate user configuration. `opencode.json` is deny-by-default (`*` denied, only `todowrite` and the subagent tool allowed), `step-worker` is denied everything, and `experimental.todo` is enabled. Because `--auto` approves whatever is not denied, that deny list is the real boundary.

Residuals: user CLAUDE.md files, global OpenCode plugins and global MCP servers still load (their tools are denied, but the connection events are in the sample). None of them writes into the repository.

## Samples provenance

The committed samples were captured by the delivery commit `f04e8a3` configuration, which pre-dates the hardening above (no env gate, only `bash`, `edit`, `webfetch` denied). The hardened configuration was checked with `opencode debug config` and the `precheck` gate check only; no new model call was made. After capture, `finalize-samples.mjs` trimmed records appended after the run's end marker and re-applied the extended sanitizer.

## Sanitization

The recorder replaces the repository root and the home directory (slash form and dash-encoded form) with placeholders, rewrites the numeric uid in `/tmp/claude-<uid>` paths, reduces transcript paths to a basename, truncates strings over 200 characters, drops keys matching token, secret, key, auth, cookie, password, passwd or credential, and redacts the token shapes listed in `shared/secrets.mjs`. This is a denylist, not a production control. `verify.mjs` checks the same list against the samples and checks that the detectors flag a fixture for each shape.

## Deviations from the plan

OpenCode needed one re-run: the first run found no `todowrite` tool until `experimental.todo` was set. `opencode models` sometimes fails with "Location plugins did not finish activating"; `precheck` retries it up to three times.

## Definition of Done exemptions

No Gherkin (research), no mutation testing (no `core/`), no unit tests on the recorders (throwaway). Replaced by `verify.mjs`, observed red with no samples and again red for each check added after review before it went green.
