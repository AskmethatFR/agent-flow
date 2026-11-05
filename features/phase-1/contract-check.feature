# context: Phase 1 exit, read-only contract check of every file under .agent-flow/
# origin: #17
@feature:contract-check
Feature: Contract check of .agent-flow files
  A read-only check tells whether every file under .agent-flow/ honours its frozen contract.

  @scenario:S1
  Scenario: Files that honour their contracts are reported as checked
    Given a worktree whose .agent-flow holds a valid plan.json and a valid decisions.jsonl
    When the contract check runs on the worktree
    Then it reports plan.json and decisions.jsonl as checked and exits with status 0

  @scenario:S2
  Scenario: A contract violation is reported with its file and line
    Given a worktree whose .agent-flow holds a decisions.jsonl with a malformed second line
    When the contract check runs on the worktree
    Then it reports an error naming decisions.jsonl and line 2 and exits with status 1

  @scenario:S3
  Scenario Outline: An unsafe layout is refused
    Given a worktree whose .agent-flow has <layout>
    When the contract check runs on the worktree
    Then it reports an error for <layout> and exits with status 1

    Examples:
      | layout                        |
      | a symlinked contract file     |
      | a file that is not a contract |
      | a leftover temporary file     |
      | no .agent-flow directory      |
