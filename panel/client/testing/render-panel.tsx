import { act, create } from 'react-test-renderer'
import type { ReactTestRendererJSON } from 'react-test-renderer'
import { PluginRpcProvider } from '@getpaseo/plugin/client/host'
import type { PluginWorkspacePanelProps } from '@getpaseo/plugin/client'
import { AgentFlowPanel } from '../agent-flow-panel.tsx'

type Invoke = (method: string, input: unknown) => Promise<unknown>
type Layout = PluginWorkspacePanelProps['layout']

const theme = {
  colors: {
    surface0: '#000',
    surface1: '#111',
    surface2: '#222',
    border: '#333',
    foreground: '#fff',
    foregroundMuted: '#aaa',
    accent: '#08f',
    accentForeground: '#fff',
    statusSuccess: '#0a0',
    statusWarning: '#fa0',
    statusDanger: '#f00',
  },
} as unknown as PluginWorkspacePanelProps['theme']

const panelProps = (workspaceId: string, compact: boolean): PluginWorkspacePanelProps => ({
  context: 'workspace',
  workspaceId,
  theme,
  host: { id: 'test-host', label: 'Test host' },
  layout: { compact, platform: 'web' } satisfies Layout,
})

const textsOf = (node: ReactTestRendererJSON | ReactTestRendererJSON[] | null): string[] => {
  if (node === null) return []
  if (Array.isArray(node)) return node.flatMap((child) => textsOf(child))
  const children = node.children ?? []
  if (node.type === 'Text') return [children.map((child) => (typeof child === 'string' ? child : '')).join('')]
  return children.flatMap((child) => (typeof child === 'string' ? [] : textsOf(child)))
}

const findText = (node: ReactTestRendererJSON | ReactTestRendererJSON[] | null, content: string): ReactTestRendererJSON | undefined => {
  if (node === null) return undefined
  if (Array.isArray(node)) return node.map((child) => findText(child, content)).find((found) => found !== undefined)
  const children = node.children ?? []
  if (node.type === 'Text' && children.join('') === content) return node
  return children.map((child) => (typeof child === 'string' ? undefined : findText(child, content))).find((found) => found !== undefined)
}

export type RenderedPanel = {
  texts(): string[]
  styleOf(content: string): { color?: string } | undefined
  surface(): unknown
  rootPadding(): unknown
  update(workspaceId: string): Promise<void>
  unmount(): Promise<void>
}

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export const renderPanel = async (
  invoke: Invoke,
  options: { workspaceId?: string; compact?: boolean } = {},
): Promise<RenderedPanel> => {
  const compact = options.compact ?? false
  const element = (workspaceId: string) => (
    <PluginRpcProvider invoke={invoke}>
      <AgentFlowPanel {...panelProps(workspaceId, compact)} />
    </PluginRpcProvider>
  )
  let renderer!: ReturnType<typeof create>
  await act(async () => {
    renderer = create(element(options.workspaceId ?? 'w1'))
  })
  return {
    texts: () => textsOf(renderer.toJSON() as ReactTestRendererJSON | ReactTestRendererJSON[] | null),
    styleOf: (content) =>
      findText(renderer.toJSON() as ReactTestRendererJSON | ReactTestRendererJSON[] | null, content)?.props.style as
        | { color?: string }
        | undefined,
    surface: () => ((renderer.toJSON() as ReactTestRendererJSON).props.style as { backgroundColor?: unknown }).backgroundColor,
    rootPadding: () => {
      const root = renderer.toJSON() as ReactTestRendererJSON
      const style = root.props.contentContainerStyle as { padding?: unknown } | undefined
      return style?.padding
    },
    update: async (workspaceId) => {
      await act(async () => {
        renderer.update(element(workspaceId))
      })
    },
    unmount: async () => {
      await act(async () => {
        renderer.unmount()
      })
    },
  }
}
