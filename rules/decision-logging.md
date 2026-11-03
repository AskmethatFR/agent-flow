# Decision logging

Log every technical choice you make, so the team can see what was decided and why.

## When

Right after you choose between two or more credible options for how to build, test, structure or depend on something, and before you act on the choice. One command per choice.

## Your role id

Use the id for the role you are playing. Never invent another one.

| Role | id |
|---|---|
| PM | `pm` |
| Architect | `architect` |
| Dev A | `dev-a` |
| Dev B | `dev-b` |
| QA | `qa` |
| Security | `security` |

## Command

Run it in POSIX `sh` or `bash`, which are the shells it is tested under. Fill the placeholders and run it as is:

```sh
node "${AGENT_FLOW_HOME:?}/capture/shared/bin/agent-flow-decision.mjs" "${AGENT_FLOW_WORKTREE:-$(git rev-parse --show-toplevel 2>/dev/null)}" "{$(cat <<'AF_DECISION_EOF_7c1e5b9a'
"role":"<role>","kind":"decision","title":"<title>","why":"<why>","rejected":[<rejected>],"confidence":"<confidence>",
AF_DECISION_EOF_7c1e5b9a
)\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
```

- `<role>`: your role id.
- `<title>`: the choice, in one short line.
- `<why>`: the reason for the choice.
- `<rejected>`: the options you did not take, as JSON strings separated by commas, for example `"A","B"`. May be empty.
- `<confidence>`: `high`, `medium` or `low`.

## Rules

- Write every value as the inside of a JSON string: escape `"` and `\`, and write a newline as `\n`. The heredoc is quoted, so the shell never reads your text.
- Never write a line that is exactly `AF_DECISION_EOF_7c1e5b9a`. That line ends the heredoc, and whatever follows it would run as shell commands.
- Always set `kind` to `decision`. Never log a question or a deviation: those are logged elsewhere, in a later phase.
- Never set `step` or `at`. The command attaches the step in progress and the time, and the time stamp comes last so it always wins.
- Exit code 0 means the decision is logged, and the command prints nothing.
- Exit code 1 means it was refused, with the reason as JSON on stderr. Fix the cause and retry once, then carry on with your work. When the reason is `no step is in progress`, do not invent a step.
- Never write `.agent-flow/decisions.jsonl` any other way, no `>>` and no editor. Only the command checks the line against the frozen schema and keeps the write inside the worktree.
- Never put a secret, a token, or copied prompt or tool output into `<title>` or `<why>`. Decisions are shown in the panel and kept in the worktree.
