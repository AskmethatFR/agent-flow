Feature: Frozen data contracts
  Every file under .agent-flow/ is validated against a versioned schema.

  Scenario Outline: A valid file is accepted
    Given a valid "<file>" sample
    When core validates it
    Then it is accepted

    Examples:
      | file            |
      | plan.json       |
      | decisions.jsonl |
      | requests.jsonl  |
      | responses.jsonl |
      | scope.json      |

  Scenario: A step with an unknown status is rejected
    Given a plan.json whose step "s4" has status "paused"
    When core validates it
    Then it is rejected with an error naming step "s4" and field "status"

  Scenario: One malformed line does not hide the valid ones
    Given a decisions.jsonl with 3 valid lines and 1 malformed line
    When core reads it
    Then 3 decisions are returned
    And 1 error names the malformed line number
