import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const project = (name: string, root: string, include: string[]) => ({
  test: { name, root, include, environment: 'node' as const },
})

const panelProject = {
  ...project('panel', 'panel', ['**/*.test.{ts,tsx}']),
  resolve: {
    alias: { 'react-native': fileURLToPath(new URL('./panel/client/testing/react-native-double.ts', import.meta.url)) },
  },
}

export default defineConfig({
  test: {
    projects: [
      project('features', 'features', ['support/**/*.test.ts']),
      project('core', 'core', ['src/**/*.test.ts', 'test/**/*.test.ts']),
      project('daemon', 'daemon', ['src/**/*.test.ts']),
      panelProject,
      project('capture-shared', 'capture/shared', ['src/**/*.test.ts']),
      project('capture-claude-code', 'capture/claude-code', ['src/**/*.test.ts']),
      project('capture-opencode', 'capture/opencode', ['src/**/*.test.ts']),
    ],
  },
})
