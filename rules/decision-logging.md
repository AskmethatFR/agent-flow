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

Fill the placeholders and run it as is:

```sh
node "${AGENT_FLOW_HOME:?}/capture/shared/bin/agent-flow-decision.mjs" "${AGENT_FLOW_WORKTREE:-$(git rev-parse --show-toplevel)}" "{\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",$(cat <<'DECISION'
"role":"<role>","kind":"decision","title":"<title>","why":"<why>","rejected":[<rejected>],"confidence":"<confidence>"
DECISION
)}"
```

- `<role>`: your role id.
- `<title>`: the choice, in one short line.
- `<why>`: the reason for the choice.
- `<rejected>`: the options you did not take, as JSON strings separated by commas, for example `"A","B"`. May be empty.
- `<confidence>`: `high`, `medium` or `low`.

## Rules

- Write every value as the inside of a JSON string: escape `"` and `\`, and write a newline as `\n`. The heredoc is quoted, so the shell never reads your text.
- Never write a line that is exactly `DECISION` inside a value.
- Always set `kind` to `decision`. Never log a question or a deviation.
- Never set `step` or `at`. The command attaches the step in progress and the time.
- Exit code 0 means the decision is logged, and the command prints nothing.
- Exit code 1 means it was refused, with the reason as JSON on stderr. Fix the cause and retry once, then carry on with your work. When the reason is `no step is in progress`, do not invent a step.
- Never write `.agent-flow/decisions.jsonl` any other way: no `>>`, no editor.
- Never put a secret, a token, or copied prompt or tool output into `<title>` or `<why>`.
