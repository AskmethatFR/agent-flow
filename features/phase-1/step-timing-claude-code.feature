# context: Phase 1 step timing capture, Claude Code runtime
# origin: #14
@feature:step-timing-claude-code
Feature: Step timing capture
  plan.json records when each step starts and ends, with no human intervention.

  @scenario:S1
  Scenario Outline: Step timing is captured automatically
    Given a <runtime> agent starts the step "Implementation"
    When the agent marks the step as done
    Then plan.json contains startedAt and endedAt for that step
    And endedAt is not earlier than startedAt

    Examples:
      | runtime     |
      | Claude Code |

  # origin: #88
  @scenario:S3
  Scenario Outline: Steps started together are each timed from their own start to their own end
    Given a <runtime> agent has the step "Architecture" in progress
    When the agent starts the step "Implementation"
    And the agent marks the step "Architecture" as done
    Then "Architecture" is done with an endedAt
    And step "Architecture" ended after step "Implementation" started
    And "Implementation" is in progress with a startedAt

    Examples:
      | runtime     |
      | Claude Code |

  # origin: #90
  @scenario:S4
  Scenario Outline: Reopening a completed step times the rework as its own step
    Given a <runtime> agent has completed the step "Implementation"
    When the agent reopens the step "Implementation"
    Then "Implementation" is done with an endedAt
    And "Implementation (rework 1)" is in progress with a startedAt

    Examples:
      | runtime     |
      | Claude Code |
