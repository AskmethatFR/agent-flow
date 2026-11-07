import { lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'

export const snapshotOf = (root: string): Map<string, string> => {
  const entries = new Map<string, string>()
  for (const relative of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
    const path = join(root, relative)
    const stats = lstatSync(path)
    if (stats.isSymbolicLink()) entries.set(relative, `link:${readlinkSync(path)}`)
    else if (stats.isDirectory()) entries.set(relative, 'dir')
    else entries.set(relative, `file:${readFileSync(path, 'utf8')}`)
  }
  return entries
}
