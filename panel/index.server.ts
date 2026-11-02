import type { PluginServerContext } from '@getpaseo/plugin/server'
import { registerSnapshot } from './server/snapshot.ts'

export default function contribute(server: PluginServerContext): () => void {
  registerSnapshot(server)
  return () => {}
}
