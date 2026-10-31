import { describe, expect, it } from 'vitest'
import scopeSchema from '../../../schemas/scope.schema.json' with { type: 'json' }
import { validateScope } from './index'

const validScope = {
  issue: '#24',
  paths: [
    'schemas/**',
    'core/src/contracts/**',
    'features/phase-0/request-contracts.feature',
    'features/steps/data-contracts.steps.ts',
  ],
}

const scopeText = (overlays: Record<string, unknown> = {}): string =>
  JSON.stringify({ ...validScope, ...overlays })

const pathsText = (...paths: unknown[]): string => scopeText({ paths })

const error = (location: string | null, field: string | null, message: string) => ({
  file: 'scope.json',
  location,
  field,
  message,
})

const rejection = (location: string | null, field: string | null, message: string) => ({
  accepted: false,
  errors: [error(location, field, message)],
})

const entryRejection = (index: number, message: string) => error(`paths[${index}]`, 'paths', message)

const separator = 'must use / as the only separator'
const relative = 'must be relative to the repository root'
const segment = 'must not contain an empty, . or .. segment'
const wholeSegment = 'must use ** only as a whole segment'
const literal = 'must name at least one literal character'
const magic = 'must not start with ! or : or contain a control character'
const tooMany = error(null, null, 'too many errors, only the first 100 are shown')

describe('scope.schema.json', () => {
  it('declares the schema version in its $id', () => {
    expect(scopeSchema.$id).toBe('urn:agent-flow:schema:scope:1')
  })
})

describe('validateScope', () => {
  it('accepts this ticket own scope', () => {
    expect(validateScope(scopeText())).toEqual({ accepted: true })
  })

  it('accepts an empty path list', () => {
    expect(validateScope(pathsText())).toEqual({ accepted: true })
  })

  it.each([
    'core/src/contracts/**',
    '**/*.feature',
    'docs/**',
    '.github/workflows/ci.yml',
    'a..b/c',
    'features/phase-0/request-contracts.feature',
    'a/**/b',
    '**/x',
    'src/*.ts',
    'a.b',
    '1:x',
    'a/c:x',
    'a b',
    'a!b',
    'ab:c',
    'docs/x:y.md',
    'a/!b',
    'a/:b',
    'x!',
    'xy:',
    '~x',
    'a~b',
    'a\u0080b',
  ])('accepts the path entry %j', (entry) => {
    expect(validateScope(pathsText(entry))).toEqual({ accepted: true })
  })

  it.each([
    ['a backslash-separated entry', 'core\\src', separator],
    ['a UNC entry', '\\\\server\\share', separator],
    ['a backslash after a drive letter', 'C:\\repo', separator],
    ['an absolute entry', '/etc/passwd', relative],
    ['a drive-letter entry with a slash', 'C:/repo/x', relative],
    ['a lowercase drive-relative entry', 'c:x', relative],
    ['a single-letter colon entry, where drive-letter wins', 'a:b', relative],
    ['an absolute catch-all, where absolute wins', '/**', relative],
    ['a parent entry', '..', segment],
    ['a leading parent entry', '../x', segment],
    ['an interior parent entry', 'a/../b', segment],
    ['a trailing parent entry', 'a/..', segment],
    ['the current-directory entry', '.', segment],
    ['a leading current-directory entry', './a', segment],
    ['an interior current-directory entry', 'a/./b', segment],
    ['a trailing current-directory entry', 'a/.', segment],
    ['an empty interior segment', 'a//b', segment],
    ['a trailing slash', 'a/', segment],
    ['a trailing double star glued to a name', 'a**', wholeSegment],
    ['a leading double star glued to a name', '**b/c', wholeSegment],
    ['a triple star', '***', wholeSegment],
    ['a double star glued to a name in the last segment', 'a/b**', wholeSegment],
    ['a negation entry', '!x', magic],
    ['a lone bang', '!', magic],
    ['a negated nested entry', '!a/b', magic],
    ['a pathspec root entry', ':/*', magic],
    ['a pathspec exclude entry', ':!x', magic],
    ['a lone colon', ':', magic],
    ['an entry with a NUL', 'a\u0000b', magic],
    ['an entry with a tab', 'a\tb', magic],
    ['an entry with a line feed', 'a\nb', magic],
    ['an entry with a DEL', 'a\u007fb', magic],
    ['an entry with the last C0 control', 'a\u001fb', magic],
    ['an entry starting with a control', '\u0001x', magic],
    ['an entry ending with a control', 'x\u0001', magic],
    ['an absolute negation, where absolute wins', '/!x', relative],
    ['a negation with a parent segment, where segment wins', '!/../x', segment],
    ['a negated double star, where whole-segment wins', '!**', wholeSegment],
    ['a control with a backslash, where separator wins', 'a\t\\b', separator],
    ['a control with a glued double star, where whole-segment wins', 'a\t**b', wholeSegment],
    ['the bare double star', '**', literal],
    ['the bare single star', '*', literal],
    ['a star on every segment', '**/*', literal],
    ['a double star after a star', '*/**', literal],
    ['a double star on every segment', '**/**', literal],
  ])('rejects %s (%j) with a fixed message', (_, entry, message) => {
    expect(validateScope(pathsText(entry))).toEqual({
      accepted: false,
      errors: [entryRejection(0, message)],
    })
  })

  it('locates a rejected entry by its position and never echoes it', () => {
    const result = validateScope(pathsText('docs/**', '/etc/passwd', 'src/*.ts'))
    expect(result).toEqual({ accepted: false, errors: [entryRejection(1, relative)] })
    expect(JSON.stringify(result)).not.toContain('passwd')
  })

  it('reports one error per rejected entry, in order', () => {
    expect(validateScope(pathsText('/a', 'ok', '../b', 'c\\d', '**'))).toEqual({
      accepted: false,
      errors: [
        entryRejection(0, relative),
        entryRejection(2, segment),
        entryRejection(3, separator),
        entryRejection(4, literal),
      ],
    })
  })

  it('reports an empty entry from the schema, not from the path rules', () => {
    expect(validateScope(pathsText(''))).toEqual(rejection('paths[0]', 'paths', 'length must be at least 1'))
  })

  it('reports schema violations instead of path-entry errors when both exist', () => {
    expect(validateScope(scopeText({ issue: '24', paths: ['/etc/passwd'] }))).toEqual(
      rejection(null, 'issue', 'must match ^#[1-9][0-9]{0,8}$'),
    )
  })

  it.each(['#24', '#1', '#123456789', '#9'])('accepts the issue %j', (issue) => {
    expect(validateScope(scopeText({ issue }))).toEqual({ accepted: true })
  })

  it.each(['24', '#0', '#', '#01', '#1234567890', '# 24', '#24\n', 'issue-24', '#２４'])(
    'rejects the issue %j',
    (issue) => {
      expect(validateScope(scopeText({ issue }))).toEqual(
        rejection(null, 'issue', 'must match ^#[1-9][0-9]{0,8}$'),
      )
    },
  )

  it.each(['issue', 'paths'])('rejects a scope missing its %s', (key) => {
    const { [key]: _removed, ...scope } = validScope as Record<string, unknown>
    expect(validateScope(JSON.stringify(scope))).toEqual(rejection(null, key, 'is required'))
  })

  it.each([
    ['issue', 7, 'must be string'],
    ['paths', 'docs/**', 'must be array'],
  ])('rejects a scope whose %s is %j', (key, value, message) => {
    expect(validateScope(scopeText({ [key]: value }))).toEqual(rejection(null, key, message))
  })

  it.each([
    [7, 'must be string'],
    [null, 'must be string'],
    ['', 'length must be at least 1'],
  ])('rejects a path entry that is %j', (entry, message) => {
    expect(validateScope(pathsText('docs/**', entry))).toEqual(
      rejection('paths[1]', 'paths', message),
    )
  })

  it('rejects an undeclared field', () => {
    expect(validateScope(scopeText({ extra: 1 }))).toEqual(rejection(null, 'extra', 'is not allowed'))
  })

  it('rejects an undeclared field whose name cannot be shown without naming it', () => {
    expect(validateScope(scopeText({ 'a b\u0007': 1 }))).toEqual(
      rejection(null, null, 'has a field whose name cannot be shown'),
    )
  })

  it.each(['7', 'null', '"text"', '[]'])('rejects a document that is %s', (text) => {
    expect(validateScope(text)).toEqual(rejection(null, null, 'must be object'))
  })

  it.each(['{', 'not json', ''])('rejects text that is not JSON (%j)', (text) => {
    expect(validateScope(text)).toEqual(rejection(null, null, 'is not valid JSON'))
  })

  const paddedTo = (length: number): string => {
    const text = scopeText()
    return text + ' '.repeat(length - text.length)
  }

  it('accepts a document of exactly 1048576 characters', () => {
    expect(validateScope(paddedTo(1_048_576))).toEqual({ accepted: true })
  })

  it.each([paddedTo(1_048_577), 'x'.repeat(1_048_577)])(
    'rejects a document of 1048577 characters with the single ceiling error without parsing it',
    (text) => {
      expect(validateScope(text)).toEqual(rejection(null, null, 'exceeds 1048576 characters'))
    },
  )

  it.each([100, 101, 150])('caps %i rejected entries at 100 errors', (count) => {
    const result = validateScope(pathsText(...Array.from({ length: count }, () => '/x')))
    if (result.accepted) throw new Error('expected a rejection')
    const shown = Math.min(count, 100)
    expect(result.errors.slice(0, shown)).toEqual(
      Array.from({ length: shown }, (_, index) => entryRejection(index, relative)),
    )
    expect(result.errors.slice(shown)).toEqual(count > 100 ? [tooMany] : [])
  })

  it('caps schema violations at 100 errors followed by the cap marker', () => {
    const result = validateScope(pathsText(...Array.from({ length: 150 }, () => 7)))
    if (result.accepted) throw new Error('expected a rejection')
    expect(result.errors).toHaveLength(101)
    expect(result.errors[99]).toEqual(error('paths[99]', 'paths', 'must be string'))
    expect(result.errors[100]).toEqual(tooMany)
  })
})
