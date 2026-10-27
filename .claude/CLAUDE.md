# Agent Flow — project rules

Extends the global agentic-team rules; never replaces them.

## Architecture

- `core/`: pure TypeScript, no host import (no Paseo, no Node-only host API). Parsers, step timing, drift and loop detection. Everything testable without a host lives here.
- Host adapters (`daemon/` for Paseo, a local host later): file watching, RPCs, SDK calls. No business rule.
- `panel/`: React Native. Display and user input only, never computes.
- The Paseo plugin API is experimental (Agent Flow targets `requirements.paseo: ">=0.11.4"`, 0.8 entry-split baseline): keep host code thin so a breaking change stays in the adapter.

## Development

- TDD, Gherkin and mutation testing are mandatory. Scenarios live in `features/phase-N/`; `@wip` marks scenarios of phases not yet sliced.
- `core` is tested classicist style (Chicago school): real collaborators, no mocks for internal code.
- Mutation testing on `core` with StrykerJS.
- Adapters and `panel` are tested through integration tests where useful.
- Data contracts under `.agent-flow/` are frozen in Phase 0; changing one is a contract change (Security lane).
- Everything is written in English, UI text included (the French mockup is reference only).

## Backlog

- One epic per phase; MVP = Phases 0–2. Tickets follow `.github/ISSUE_TEMPLATE/slice.yml`.
- Tooling needs go to `docs/TOOLING-BACKLOG.md`, never to an issue.
