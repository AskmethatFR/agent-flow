export type JsonSchema = {
  readonly $schema?: string
  readonly $id?: string
  readonly title?: string
  readonly description?: string
  readonly type?: string | readonly string[]
  readonly enum?: readonly string[]
  readonly required?: readonly string[]
  readonly properties?: Readonly<Record<string, JsonSchema>>
  readonly additionalProperties?: boolean
  readonly items?: JsonSchema
}

type Path = readonly (string | number)[]

export type SchemaViolation = {
  readonly path: Path
  readonly message: string
}

const isObject = (value: unknown): value is object =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const typeMatchers: Readonly<Record<string, (value: unknown) => boolean>> = {
  object: isObject,
  array: Array.isArray,
  string: (value) => typeof value === 'string',
  null: (value) => value === null,
}

const matchesType = (name: string, value: unknown): boolean =>
  (typeMatchers[name] as (value: unknown) => boolean)(value)

const supportedKeywords = new Set([
  '$schema',
  '$id',
  'title',
  'description',
  'type',
  'enum',
  'required',
  'properties',
  'additionalProperties',
  'items',
])

const typeNames = (schema: JsonSchema): readonly string[] =>
  schema.type === undefined ? [] : [schema.type].flat()

const assertSupported = (schema: JsonSchema): void => {
  for (const keyword of Object.keys(schema)) {
    if (!supportedKeywords.has(keyword)) throw new Error(`unsupported schema keyword: ${keyword}`)
  }
  for (const name of typeNames(schema)) {
    if (!Object.hasOwn(typeMatchers, name)) throw new Error(`unsupported schema type: ${name}`)
  }
  if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) {
    throw new Error('unsupported additionalProperties')
  }
  Object.values(schema.properties ?? {}).forEach(assertSupported)
  if (schema.items !== undefined) assertSupported(schema.items)
}

const violation = (path: Path, message: string): SchemaViolation[] => [{ path, message }]

const walk = (schema: JsonSchema, value: unknown, path: Path): SchemaViolation[] => {
  const types = typeNames(schema)
  if (types.length > 0 && !types.some((name) => matchesType(name, value))) {
    return violation(path, `must be ${types.join(' or ')}`)
  }
  if (schema.enum !== undefined && !schema.enum.includes(value as string)) {
    return violation(path, `must be one of ${schema.enum.join(', ')}`)
  }
  if (isObject(value)) return walkObject(schema, value, path)
  if (schema.items !== undefined && Array.isArray(value)) {
    const items = schema.items
    return value.flatMap((item, index) => walk(items, item, [...path, index]))
  }
  return []
}

const walkObject = (schema: JsonSchema, value: object, path: Path): SchemaViolation[] => {
  const missing = (schema.required ?? [])
    .filter((key) => !Object.hasOwn(value, key))
    .flatMap((key) => violation([...path, key], 'is required'))
  const properties = schema.properties ?? {}
  const nested = Object.entries(value).flatMap(([key, child]) => {
    if (Object.hasOwn(properties, key)) {
      return walk(properties[key] as JsonSchema, child, [...path, key])
    }
    return schema.additionalProperties === false ? violation([...path, key], 'is not allowed') : []
  })
  return [...missing, ...nested]
}

export function findViolations(schema: JsonSchema, value: unknown): SchemaViolation[] {
  assertSupported(schema)
  return walk(schema, value, [])
}
