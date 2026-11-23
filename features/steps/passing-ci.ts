import type { CiStatusSource } from '@agent-flow/daemon/snapshot'

export const passingRollupOf = (headCommit: string): string =>
  JSON.stringify({
    headRefOid: headCommit,
    statusCheckRollup: [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' }],
  })

export const passingCiOf =
  (headCommit: string): CiStatusSource =>
  async () => ({ status: passingRollupOf(headCommit) })
