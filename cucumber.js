import { registerHooks } from 'node:module'
import { register } from 'tsx/esm/api'

register()

const reactNativeDouble = new URL('./panel/client/testing/react-native-double.ts', import.meta.url).href

const childProcessDouble = new URL('./features/support/child-process-double.ts', import.meta.url).href
const daemonSnapshotWiring = new URL('./daemon/src/snapshot/index.ts', import.meta.url).href

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'node:child_process' && context.parentURL === daemonSnapshotWiring) {
      return nextResolve(childProcessDouble, context)
    }
    return nextResolve(specifier === 'react-native' ? reactNativeDouble : specifier, context)
  },
})

export default {
  paths: ['features/**/*.feature'],
  tags: 'not @manual',
  import: ['features/steps/**/*.ts'],
}
