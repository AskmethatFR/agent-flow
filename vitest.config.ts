import { defineConfig } from 'vitest/config'

const project = (name: string, root: string, include: string[]) => ({
  test: { name, root, include, environment: 'node' as const },
})

export default defineConfig({
  test: {
    projects: [
      project('core', 'core', ['src/**/*.test.ts', 'test/**/*.test.ts']),
      project('daemon', 'daemon', ['src/**/*.test.ts']),
      project('panel', 'panel', ['**/*.test.{ts,tsx}']),
      project('capture-shared', 'capture/shared', ['src/**/*.test.ts']),
      project('capture-claude-code', 'capture/claude-code', ['src/**/*.test.ts']),
      project('capture-opencode', 'capture/opencode', ['src/**/*.test.ts']),
    ],
  },
})
