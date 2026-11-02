import { createStepTimingPlugin } from './plugin'

export default createStepTimingPlugin({ worktree: process.env.AGENT_FLOW_WORKTREE, now: () => new Date() })
