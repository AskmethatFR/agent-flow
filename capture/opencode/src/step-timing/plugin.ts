import { captureStepTiming } from './step-timing'

type HostContext = { readonly tool?: { readonly hook?: unknown } | null } | null | undefined

export type StepTimingPluginOptions = {
  readonly worktree: string | undefined
  readonly now: () => Date
}

export function createStepTimingPlugin({ worktree, now }: StepTimingPluginOptions) {
  return {
    id: 'agent-flow.step-timing',
    async setup(ctx: HostContext): Promise<(() => void) | undefined> {
      const tool = ctx?.tool
      if (worktree === undefined || worktree === '' || typeof tool?.hook !== 'function') return undefined
      let active = true
      tool.hook('execute.after', (event: unknown): void => {
        if (!active) return
        try {
          captureStepTiming(event, worktree, now)
        } catch {}
      })
      return () => {
        active = false
      }
    },
  }
}
