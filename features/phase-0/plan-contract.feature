# context: Phase 0 contract freeze, plan.json
# origin: #23
@feature:plan-contract
Feature: Frozen data contracts
  Every file under .agent-flow/ is validated against a versioned schema.

  @scenario:S1
  Scenario Outline: A valid file is accepted
    Given a valid "<file>" sample
    When core validates it
    Then it is accepted

    Examples:
      | file            |
      | plan.json       |

  @scenario:S2
  Scenario: A step with an unknown status is rejected
    Given a plan.json whose step "s4" has status "paused"
    When core validates it
    Then it is rejected with an error naming step "s4" and field "status"
