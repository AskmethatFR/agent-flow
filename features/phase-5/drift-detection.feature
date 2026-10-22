@wip
Feature: Drift detection
  Deviations from the plan, the spec or the issue scope are surfaced for approval.

  Scenario: Out-of-scope change is flagged
    Given scope.json lists the expected paths for the issue
    When an agent modifies a file outside those paths
    Then an "out_of_scope" request is added to the queue

  Scenario: Loop is detected
    Given the same test fails 3 times in a row with the same error
    Then the agent is marked as looping
