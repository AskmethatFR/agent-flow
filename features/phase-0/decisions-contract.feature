# context: Phase 0 contract freeze, decisions.jsonl
# origin: #32
@feature:decisions-contract
Feature: Frozen data contracts
  Every file under .agent-flow/ is validated against a versioned schema.

  @scenario:S1
  Scenario Outline: A valid file is accepted
    Given a valid "<file>" sample
    When core validates it
    Then it is accepted

    Examples:
      | file            |
      | decisions.jsonl |

  @scenario:S2
  Scenario: One malformed line does not hide the valid ones
    Given a decisions.jsonl with 3 valid lines and 1 malformed line
    When core reads it
    Then 3 decisions are returned
    And 1 error names the malformed line number
