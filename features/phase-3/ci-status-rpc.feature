# context: Phase 3 daemon reports the CI status of the worktree's pull request with the snapshot
# origin: #115
@feature:ci-status-rpc
Feature: CI status in the snapshot
  The daemon asks gh, read-only and from the worktree, for the status of the pull request of the worktree's branch and hands the raw output to core; core maps it.

  @scenario:S1
  Scenario: The CI status of the worktree's pull request is reported as the verified CI fact
    Given a worktree has the step "dev-a" in progress
    And gh reports a pull request at head commit "678b2c7355d66c094c072c5dcc2cb8ec26d70c68" whose checks all passed
    When the panel asks for the snapshot of that worktree with its CI status
    Then the snapshot carries a verified CI fact for head commit "678b2c7355d66c094c072c5dcc2cb8ec26d70c68" in state "passed"

  @scenario:S2
  Scenario Outline: A gh failure leaves the rest of the snapshot intact
    Given a worktree has the step "dev-a" in progress
    And gh <outcome>
    When the panel asks for the snapshot of that worktree with its CI status
    Then the steps of the snapshot are intact
    And the snapshot reports no CI fact
    And the snapshot carries exactly one error, labelled "ci-status"

    Examples:
      | outcome                                     |
      | is not installed                            |
      | exits with a failure                        |
      | does not answer in time                     |
      | answers with more output than the bound     |

  @scenario:S3
  Scenario: gh is run once, read-only, from the worktree
    Given a worktree has the step "dev-a" in progress
    And gh reports a pull request at head commit "678b2c7355d66c094c072c5dcc2cb8ec26d70c68" whose checks all passed
    When the panel asks for the snapshot of that worktree with its CI status
    Then gh was run once from that worktree with the arguments "pr view --json headRefOid,statusCheckRollup"

  @scenario:S4
  Scenario: Nothing an agent wrote reaches the gh arguments
    Given a worktree has the step "dev-a" in progress
    And the plan of that worktree is titled "--repo attacker/repo"
    And gh reports a pull request at head commit "678b2c7355d66c094c072c5dcc2cb8ec26d70c68" whose checks all passed
    When the panel asks for the snapshot of that worktree with its CI status
    Then gh was run once from that worktree with the arguments "pr view --json headRefOid,statusCheckRollup"
