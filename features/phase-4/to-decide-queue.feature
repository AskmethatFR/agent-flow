@wip
Feature: "To decide" queue
  Requests awaiting a human are listed oldest first, and answers reach the agent.

  Scenario: A blocking question pauses the agent
    Given an agent writes a blocking question
    Then the agent stops working on that step
    And the question appears in the "To decide" queue with its waiting time

  Scenario: Answering from the panel resumes the agent
    Given a blocking question is in the queue
    When I choose an answer
    Then the answer is delivered to the agent
    And the agent resumes
