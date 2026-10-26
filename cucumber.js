import { register } from 'tsx/esm/api'

register()

export default {
  paths: ['features/**/*.feature'],
  tags: 'not @manual',
  import: ['features/steps/**/*.ts'],
}
