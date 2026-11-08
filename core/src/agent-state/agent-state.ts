export type AgentDisplayState = 'running' | 'stopped' | 'unknown'

const displayStates: ReadonlyMap<string, AgentDisplayState> = new Map([
  ['running', 'running'],
  ['initializing', 'running'],
  ['idle', 'stopped'],
  ['error', 'stopped'],
  ['closed', 'stopped'],
])

export const displayStateOf = (status: string): AgentDisplayState =>
  displayStates.get(status) ?? 'unknown'
