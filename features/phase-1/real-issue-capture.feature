Feature: Capture on a real issue
  Phase 1 is done when a real issue produces correct files with no human intervention.

  Scenario Outline: A real issue produces correct .agent-flow files
    Given a real issue is worked end to end by <runtime> agents
    When the issue reaches its last step
    Then plan.json lists every step with startedAt and endedAt
    And decisions.jsonl holds at least one decision per role that ran
    And every file under .agent-flow/ passes contract validation
    And no human edited any file under .agent-flow/

    Examples:
      | runtime     |
      | Claude Code |
      | OpenCode v2 |
