# Agent Flow

See where your AI agents are on their plan, what they decided, and what is waiting for you.

Agent Flow reads a small set of files that agents write into each worktree (`.agent-flow/`) and turns them into:

- a **plan rail** with the time spent on each step,
- a **step detail** with every decision made during that step,
- a **"To decide" queue** of questions and deviations waiting for a human, oldest first.

## Goals

1. **Know precisely where we are** on each issue, at a glance.
2. **Prevent drift**: deviations from the plan, the spec or the issue scope are surfaced and approved before agents act on them.
3. **Stop wasting time**: show who is waiting for a human answer and which agent is looping.

## Hosts and runtimes

- **Hosts**: [Paseo](https://paseo.sh) workspace panel first. The core is host-free, so a local/standalone host can follow.
- **Agent runtimes**: Claude Code and OpenCode v2.

## Status

Planning. The MVP is Phases 0 to 2 (framing, data capture, read-only panel).

- Product plan: [`docs/plan.md`](docs/plan.md)
- Acceptance scenarios: [`features/`](features/)
- Backlog: [issues](https://github.com/AskmethatFR/agent-flow/issues) and [milestones](https://github.com/AskmethatFR/agent-flow/milestones)

## License

[MIT](LICENSE)
