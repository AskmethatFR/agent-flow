import { describe, expect, it } from 'vitest'
import { displayStateOf } from './agent-state'

describe('displayStateOf', () => {
  it.each([
    ['running', 'running'],
    ['initializing', 'running'],
    ['idle', 'stopped'],
    ['error', 'stopped'],
    ['closed', 'stopped'],
  ])('shows the listed host status %s as %s', (status, expected) => {
    expect(displayStateOf(status)).toBe(expected)
  })

  it.each([
    'paused',
    '',
    'RUNNING',
    ' running',
    'running ',
    'constructor',
    '__proto__',
    'toString',
    'hasOwnProperty',
  ])('shows the status %j, which is not in the list, as unknown', (status) => {
    expect(displayStateOf(status)).toBe('unknown')
  })

  it.each([undefined, null, 42, {}, ['running']])(
    'shows the non-text value %j as unknown without throwing',
    (value) => {
      expect(displayStateOf(value as unknown as string)).toBe('unknown')
    },
  )
})
