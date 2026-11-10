# context: Phase 3 spike, which tool outputs are verified facts and how a fact attaches to a step, read against the decision record by hand
# origin: #108
@feature:verified-facts-spike @manual
Feature: Verified facts spike
  The spike is research: its scenarios are read against docs/technical/decisions/verified-facts.md, not run by cucumber-js.

  @scenario:S1
  Scenario: Each source lists its report format, writer and location
    Given the decision record for the verified facts
    When a reader looks up each candidate source
    Then each source lists its report format, writer and location

  @scenario:S2
  Scenario: The attachment rule is shown on a real run, tied or untied per source
    Given the decision record for the verified facts
    When a reader looks at the real run recorded for each source
    Then the attachment rule is shown on that run, with each source tied or untied

  @scenario:S3
  Scenario: An unmatched report follows the recorded rule
    Given the decision record for the verified facts
    When a report matches no plan step
    Then it follows the rule recorded for an unmatched report

  @scenario:S4
  Scenario: The verified/declared separator is named and a new field is flagged as a contract change
    Given the decision record for the verified facts
    When a reader looks up the separator between verified and declared facts
    Then the separator is named
    And a new field is flagged as a contract change

  @scenario:S5
  Scenario: A no-tools step shows the rule chosen
    Given the decision record for the verified facts
    When a reader looks at a step that ran no tools
    Then the rule chosen is shown, pending decision (a)

  @scenario:S6
  Scenario: The timebox ends in a result or inconclusive with what blocks
    Given the decision record for the verified facts
    When a reader looks at how the timebox ended
    Then it ends in a result or in "inconclusive + what blocks"
