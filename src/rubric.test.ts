import assert from 'node:assert/strict'
import { test } from 'node:test'

import { driveQuestions, partsToAsk } from './rubric.ts'

test('a parts goal asks one Noul per unmet part in place of goalMet, and offers no done', () => {
  const parts = partsToAsk(['See A.', 'See B.', 'See C.'], ['See A.', 'See C.'])
  assert.deepEqual(parts, { part_1: 'See A.', part_3: 'See C.' })
  const q = driveQuestions([], new Set(), { parts, dialog: true })
  assert.deepEqual(
    Object.keys(q).filter((id) => id.startsWith('part_') || id === 'goalMet'),
    ['part_1', 'part_3'],
  )
  assert.match(JSON.stringify(q.part_3), /See C\./)
  const next = q.next as { criteria: Record<string, string> }
  assert.equal(next.criteria.done, undefined)
  assert.ok(next.criteria.escape)
  const plain = driveQuestions([], new Set())
  assert.ok(plain.goalMet)
  assert.equal(
    (plain.next as { criteria: Record<string, string> }).criteria.escape,
    undefined,
  )
})

test('a destructive Noul is asked only for the controls in ask', () => {
  const controls = [
    { id: 'c00', kind: 'button', name: 'Save', region: 'main' },
    { id: 'c01', kind: 'button', name: 'Close', region: 'main' },
  ]
  const q = driveQuestions(controls, new Set(['c01']))
  assert.ok(q.destructive_c01)
  assert.equal(q.destructive_c00, undefined)
})
