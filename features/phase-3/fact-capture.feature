# context: Phase 3 capture, the verified-facts file written when a tool run ends
# origin: #125
@feature:fact-capture
Feature: Capture: verified facts are kept in a sixth contract file
  Every tool run the capture host observes leaves one line in `.agent-flow/verified-facts.jsonl`, so a fact outlives the run. The file is a frozen contract file like the five before it: the contract check accepts it and still refuses any other name.

  @scenario:S9
  Scenario: The contract check accepts the sixth file and still refuses other names
    Given a worktree whose .agent-flow holds a valid verified-facts.jsonl and a stray verified-facts.json
    When the contract check runs on the worktree
    Then it reports one error, for verified-facts.json not being a contract file, and exits with status 1

  @scenario:S10
  Scenario Outline: A fact line carrying failure text is refused
    Given a worktree whose .agent-flow holds a verified-facts.jsonl whose second line carries "<key>" with a failure text
    When the contract check runs on the worktree
    Then it reports one error naming verified-facts.jsonl, line 2 and the key "<key>" as not allowed, and exits with status 1
    And the failure text appears in neither its output nor its error output

    Examples:
      | key             |
      | failureMessages |
      | error_message   |
