Feature: Agent state
  The step in progress shows the live state of the agent working on it.

  Scenario: The agent working on the current step is shown
    Given the agent "dev-a" is running on the step in progress
    When I open the panel
    Then the current step shows "dev-a" as running

  Scenario: A stopped agent is visible
    Given the agent on the step in progress has stopped
    When I open the panel
    Then the current step shows the agent as stopped
