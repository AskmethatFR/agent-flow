Feature: Step timing capture
  plan.json records when each step starts and ends, with no human intervention.

  Scenario Outline: Step timing is captured automatically
    Given a <runtime> agent starts the step "Implementation"
    When the agent marks the step as done
    Then plan.json contains startedAt and endedAt for that step
    And endedAt is not earlier than startedAt

    Examples:
      | runtime     |
      | Claude Code |
      | OpenCode v2 |

  Scenario Outline: Only one step is in progress at a time
    Given a <runtime> agent has the step "Architecture" in progress
    When the agent starts the step "Implementation"
    Then "Architecture" is done with an endedAt
    And "Implementation" is in progress with a startedAt

    Examples:
      | runtime     |
      | Claude Code |
      | OpenCode v2 |
