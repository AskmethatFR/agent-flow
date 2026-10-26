export type JsonSchema = {
  readonly $schema?: string
  readonly $id?: string
  readonly title?: string
  readonly description?: string
  readonly type?: string | readonly string[]
  readonly enum?: readonly string[]
  readonly minLength?: number
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
  'minLength',
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

const violation = (path: Path, message: string): SchemaViolation => ({ path, message })

function* walk(schema: JsonSchema, value: unknown, path: Path): Generator<SchemaViolation> {
  const types = typeNames(schema)
  if (types.length > 0 && !types.some((name) => matchesType(name, value))) {
    yield violation(path, `must be ${types.join(' or ')}`)
    return
  }
  if (schema.enum !== undefined && !schema.enum.includes(value as string)) {
    yield violation(path, `must be one of ${schema.enum.join(', ')}`)
    return
  }
  const { items } = schema
  if (typeof value === 'string' && [...value].length < (schema.minLength ?? 0)) {
    yield violation(path, `length must be at least ${schema.minLength}`)
    return
  }
  if (isObject(value)) {
    yield* walkObject(schema, value, path)
  } else if (items !== undefined && Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* walk(items, item, [...path, index])
  }
}

function* walkObject(schema: JsonSchema, value: object, path: Path): Generator<SchemaViolation> {
  for (const key of schema.required ?? []) {
    if (!Object.hasOwn(value, key)) yield violation([...path, key], 'is required')
  }
  const properties = schema.properties ?? {}
  for (const [key, child] of Object.entries(value)) {
    if (Object.hasOwn(properties, key)) {
      yield* walk(properties[key] as JsonSchema, child, [...path, key])
    } else if (schema.additionalProperties === false) {
      yield violation([...path, key], 'is not allowed')
    }
  }
}

export function findViolations(schema: JsonSchema, value: unknown): Iterable<SchemaViolation> {
  assertSupported(schema)
  return walk(schema, value, [])
}
