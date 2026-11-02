import { registerHooks } from 'node:module'
import { register } from 'tsx/esm/api'

register()

const reactNativeDouble = new URL('./panel/client/testing/react-native-double.ts', import.meta.url).href

registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === 'react-native' ? reactNativeDouble : specifier, context)
  },
})

export default {
  paths: ['features/**/*.feature'],
  tags: 'not @manual',
  import: ['features/steps/**/*.ts'],
}
