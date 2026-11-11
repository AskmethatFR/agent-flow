# context: Phase 3 core snapshot, facts per step, declared facts derived from decisions.jsonl
# origin: #109
@feature:snapshot-facts
Feature: Core snapshot: facts per step
  Core attaches facts to each plan step, so the panel and the daemon read facts and compute nothing.

  @scenario:S1
  Scenario: A step carries one declared fact per decision
    Given the plan has a step "s1" and decisions are logged for "s1"
    When the snapshot is built
    Then step "s1" carries one fact per decision
    And each fact has origin "declared", a source and a label

  @scenario:S2
  Scenario: A step without decisions carries an empty fact list
    Given the plan has a step "s2" and no decision is logged for "s2"
    When the snapshot is built
    Then step "s2" carries an empty fact list

  @scenario:S3
  Scenario: Declared facts are listed in the order they were logged
    Given the plan has a step "s1" and decisions "first" and "second" are logged for "s1"
    When the snapshot is built
    Then the facts of step "s1" are labeled "first" then "second"

  @scenario:S4
  Scenario: A malformed decisions.jsonl line yields errors, never a throw
    Given decisions.jsonl contains a malformed line
    When the snapshot is built
    Then the valid decisions are present as facts
    And the snapshot reports the malformed line

  @scenario:S5
  Scenario: The frozen step fields keep their shape when facts are added
    Given the plan has a step "s1" and decisions are logged for "s1"
    When the snapshot is built
    Then step "s1" keeps its frozen fields id, title, role, status, origin and timeSpent
