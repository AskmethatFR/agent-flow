# context: Phase 0 contract freeze, requests.jsonl, responses.jsonl and scope.json
# origin: #24
@feature:request-contracts
Feature: Frozen data contracts
  Every file under .agent-flow/ is validated against a versioned schema.

  @scenario:S1
  Scenario Outline: A valid file is accepted
    Given a valid "<file>" sample
    When core validates it
    Then it is accepted

    Examples:
      | file            |
      | requests.jsonl  |
      | responses.jsonl |
      | scope.json      |

  @scenario:S2
  Scenario Outline: A malformed line is rejected with its line number
    Given a "<file>" with 1 valid line followed by a line that <defect>
    When core validates it
    Then it is rejected with an error naming line 2

    Examples:
      | file            | defect                                  |
      | requests.jsonl  | has the unknown request type "approval" |
      | responses.jsonl | is not valid JSON                       |

  @scenario:S3
  Scenario: An absolute path in scope.json is rejected
    Given a scope.json whose path entry "/etc/passwd" is absolute
    When core validates it
    Then it is rejected with an error naming field "paths"
