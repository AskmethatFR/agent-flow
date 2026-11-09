# context: Phase 1 capture, operator-run commands
# origin: #83 (Security S1)
@feature:launch-cache-confinement
Feature: Operator-run commands keep their transform cache out of the shared temporary directory
  Hooks and commands the project ships run TypeScript through tsx. On a shared machine
  another local user must not be able to plant code that runs as the operator.

  @scenario:S1
  Scenario Outline: No cached code is written to the shared temporary directory
    Given an empty shared temporary directory
    When the operator runs <entry point>
    Then the shared temporary directory holds no cached transformed code

    Examples:
      | entry point                       |
      | the Claude Code step timing hook  |
      | agent-flow-plan                   |
      | agent-flow-decision               |
      | agent-flow-check                  |
