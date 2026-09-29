import assert from 'node:assert/strict'
import { test } from 'node:test'

import { driveControlText } from '../rubric.ts'
import {
  driveControls,
  expandControls,
  goalTokens,
  MAX_CONTROLS,
  MAX_SELECT_OPTIONS,
  pickOption,
} from './controls.ts'

test('driveControls caps at 50: goal-matching links, a dozen navigation and the footer, then the page', () => {
  const nav = Array.from({ length: 30 }, (_, i) => ({
    kind: 'link' as const,
    name: `Screen ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`,
    region: 'navigation',
  }))
  const main = Array.from({ length: 35 }, (_, i) => ({
    kind: 'button' as const,
    name: `Action ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`,
    region: 'main',
  }))
  const footer = Array.from({ length: 10 }, (_, i) => ({
    kind: 'link' as const,
    name: `Footer ${String.fromCharCode(97 + i)}`,
    region: 'contentinfo',
  }))
  const all = [
    ...nav,
    { kind: 'link' as const, name: 'Pricing plans', region: 'navigation' },
    ...main,
    ...footer,
  ]
  const controls = driveControls(all, 'Find the pricing for a small bank.')
  assert.equal(controls.length, MAX_CONTROLS)
  // The goal-matching link, 12 navigation links and the whole footer, then the page.
  assert.equal(controls.filter((c) => c.region === 'navigation').length, 13)
  assert.equal(controls.filter((c) => c.region === 'contentinfo').length, 10)
  assert.equal(controls.filter((c) => c.region === 'main').length, 27)
  assert.ok(controls.some((c) => c.name === 'Pricing plans'))
  assert.deepEqual(controls.map((c) => c.id).slice(0, 2), ['c00', 'c01'])
})

test('a control naming a goal identifier is kept past the repeat cap', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    kind: 'button' as const,
    name: `Open INV-${String(i + 1).padStart(4, '0')}`,
    region: 'main',
  }))
  const names = driveControls(rows, 'Open invoice INV-0011', 8).map((c) => c.name)
  assert.deepEqual(names, [
    'Open INV-0001',
    'Open INV-0002',
    'Open INV-0003',
    'Open INV-0011',
  ])
})

test('goalTokens takes record ids and quoted phrases from the goal', () => {
  assert.deepEqual(
    goalTokens('Trace F-2026-0022 to INV-0042 and search for "overdraft fees".'),
    ['F-2026-0022', 'INV-0042', 'overdraft fees'],
  )
  assert.deepEqual(goalTokens('See every policy with its owner.'), [])
})

test('a native select offers its options up to the cap; a field offers the goal tokens typed into it', () => {
  const controls = [
    { kind: 'combobox' as const, name: 'Status', region: 'main' },
    { kind: 'combobox' as const, name: 'Owner', region: 'main' },
    { kind: 'searchbox' as const, name: 'Search', region: 'banner' },
    { kind: 'button' as const, name: 'Filter', region: 'main' },
  ]
  const many = Array.from(
    { length: MAX_SELECT_OPTIONS + 1 },
    (_, i) => `Person ${String(i)}`,
  )
  const offered = driveControls(
    expandControls(controls, { Status: ['Open', 'Closed'], Owner: many }, [
      'overdraft fees',
    ]),
    'Find "overdraft fees"',
  )
  assert.deepEqual(offered.map(driveControlText), [
    'select "Open" in combobox "Status"',
    'select "Closed" in combobox "Status"',
    'combobox "Owner"',
    'searchbox "Search"',
    'type "overdraft fees" into searchbox "Search"',
    'button "Filter"',
  ])
  const typed = offered.find((c) => c.action === 'type')
  assert.deepEqual([typed?.input, typed?.target], ['overdraft fees', 'Search'])
})

test('pickOption takes the most probable option that was not vetoed', () => {
  const probs = { c00: 0.6, c01: 0.3, done: 0.1 }
  assert.deepEqual(pickOption(probs, new Set()), { id: 'c00', p: 0.6 })
  assert.deepEqual(pickOption(probs, new Set(['c00'])), { id: 'c01', p: 0.3 })
})
