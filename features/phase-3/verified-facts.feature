@wip
Feature: Verified and declared facts
  Facts from tools are shown apart from claims written by an agent.

  Scenario: Verified and declared facts are distinguished
    Given dotnet test reports 3 of 5 scenarios passing
    And the agent declares "scenario 4 is almost done"
    Then the first fact is shown as verified with its source
    And the second fact is shown as declared by the agent
