# context: Phase 3 capture, the verified-facts file written when a tool run ends
# origin: #125
@feature:fact-capture
Feature: Capture: verified facts are kept in a sixth contract file
  Every tool run the capture host observes leaves one line in `.agent-flow/verified-facts.jsonl`, so a fact outlives the run. The file is a frozen contract file like the five before it: the contract check accepts it and still refuses any other name.

  @scenario:S1
  Scenario Outline: A qa subagent's vitest run leaves one fact on its step
    Given a plan whose step "1" is in progress for the role qa
    When a subagent of type "<agentType>" runs "npx vitest run --reporter=json --outputFile=reports/vitest/vitest.json" and it ends <outcome>, <passed> of <total> tests passed
    Then verified-facts.jsonl holds one line on step "1", attachment role, role qa, roleFrom host, with <passed> passed of <total> and <failedSuites> failed suites
    And that line passes the contract check

    Examples:
      | agentType        | outcome | passed | total | failedSuites |
      | qa               | passing | 3      | 3     | 0            |
      | qa               | failing | 2      | 3     | 1            |
      | agentic-team:qa  | passing | 3      | 3     | 0            |

  @scenario:S2
  Scenario: Two vitest runs leave two facts, in run order
    Given a plan whose step "1" is in progress for the role qa
    And a subagent of type "qa" runs "npx vitest run --reporter=json --outputFile=reports/vitest/vitest.json" and it ends passing, 3 of 3 tests passed
    When a subagent of type "qa" runs "npx vitest run --reporter=json --outputFile=reports/vitest/vitest.json" and it ends failing, 2 of 5 tests passed
    Then verified-facts.jsonl holds two lines in run order, on step "1", the first with 3 passed of 3 and the second with 2 passed of 5
    And that line passes the contract check

  @scenario:S4
  Scenario Outline: A run attaches to the only step in progress when it is another role's, marked only-step
    Given a plan whose step "1" is in progress for the role dev-a
    When <runner> runs "npx vitest run --reporter=json --outputFile=reports/vitest/vitest.json" and it ends passing, 3 of 3 tests passed
    Then verified-facts.jsonl holds one line on step "1", attachment only-step, role <role>, roleFrom <roleFrom>, with 3 passed of 3 and 0 failed suites
    And that line passes the contract check

    Examples:
      | runner                             | role | roleFrom |
      | a subagent of type "qa"            | qa   | host     |
      | a subagent of type "other:qa"      | null | null     |
      | the main session                   | null | null     |

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
