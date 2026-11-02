import { describe, expect, it, vi } from 'vitest'
import type { PluginClientContext } from '@getpaseo/plugin/client'
import contribute from './index.client.tsx'
import { AgentFlowPanel } from './client/agent-flow-panel.tsx'

const fakeClient = () => {
  const removePanel = vi.fn(async () => {})
  const removeCommand = vi.fn(async () => {})
  const addWorkspacePanel = vi.fn(() => removePanel)
  const addCommandCenterItem = vi.fn(() => removeCommand)
  const client = { addWorkspacePanel, addCommandCenterItem } as unknown as PluginClientContext
  return { client, addWorkspacePanel, addCommandCenterItem, removePanel, removeCommand }
}

describe('client entry', () => {
  it('registers the Agent Flow workspace panel under the stable id', () => {
    const { client, addWorkspacePanel } = fakeClient()
    contribute(client)
    expect(addWorkspacePanel).toHaveBeenCalledExactlyOnceWith({
      id: 'agent-flow',
      title: 'Agent Flow',
      icon: 'PanelsTopLeft',
      context: 'workspace',
      Component: AgentFlowPanel,
    })
  })

  it('registers a Command Center item that opens that panel', () => {
    const { client, addCommandCenterItem } = fakeClient()
    contribute(client)
    expect(addCommandCenterItem).toHaveBeenCalledOnce()
    const item = (addCommandCenterItem.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(item).toMatchObject({
      id: 'open-agent-flow',
      title: 'Open Agent Flow',
      icon: 'PanelsTopLeft',
      context: 'workspace',
    })
    const openPanel = vi.fn()
    ;(item.onSelect as (context: { openPanel: typeof openPanel }) => void)({ openPanel })
    expect(openPanel).toHaveBeenCalledExactlyOnceWith('agent-flow')
  })

  it('removes both contributions on cleanup', async () => {
    const { client, removePanel, removeCommand } = fakeClient()
    await contribute(client)()
    expect(removePanel).toHaveBeenCalledOnce()
    expect(removeCommand).toHaveBeenCalledOnce()
  })
})
