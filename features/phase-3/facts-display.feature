# context: Phase 3 panel step detail, verified and declared facts of the selected step shown apart
# origin: #113
@feature:facts-display
Feature: Step detail: verified and declared facts
  Step detail tells a fact a tool verified from a claim an agent declared, at a glance: each fact carries its badge and its source, and the panel shows the snapshot's labels as they are.

  @scenario:S1
  Scenario: A verified fact and a declared fact are shown apart, each with its source
    Given a step whose snapshot lists the verified fact "3 of 5 passing" from "vitest" then the declared fact "scenario 4 is almost done" from "decisions.jsonl"
    When I open the detail of that step
    Then the step detail lists "3 of 5 passing" with a Verified badge and the source "vitest"
    And the step detail lists "scenario 4 is almost done" with a Declared badge and the source "decisions.jsonl", after the first

  @scenario:S2
  Scenario: Fact labels are rendered exactly as the snapshot carries them
    Given a step whose snapshot lists the verified fact "tests: 2/7 PASS" from "vitest" then the declared fact "SCENARIO 4 is ALMOST done!" from "decisions.jsonl"
    When I open the detail of that step
    Then the step detail shows the labels "tests: 2/7 PASS" and "SCENARIO 4 is ALMOST done!" unchanged, with no text added

  @scenario:S3
  Scenario: A step without facts shows no badge, no source and no claim
    Given a step whose snapshot lists no fact
    When I open the detail of that step
    Then the step detail shows no Verified badge, no Declared badge, no source line and no statement about facts
