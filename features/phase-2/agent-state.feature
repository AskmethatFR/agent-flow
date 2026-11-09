# context: Phase 2 panel, state of the agent on the current step
# origin: #21
@feature:agent-state
Feature: Agent state
  The step in progress shows the live state of the agent working on it.

  @scenario:S1
  Scenario: The agent working on the current step is shown
    Given the agent "dev-a" is running on the step in progress
    When I open the panel
    Then the current step shows "dev-a" as running

  @scenario:S2
  Scenario: A stopped agent is visible
    Given the agent on the step in progress has stopped
    When I open the panel
    Then the current step shows the agent as stopped

  @scenario:S3
  Scenario: The agent state refreshes without reopening the panel
    Given the agent "dev-a" is running on the step in progress
    And I have opened the panel
    When the agent stops
    Then the current step shows the agent as stopped without reopening the panel
