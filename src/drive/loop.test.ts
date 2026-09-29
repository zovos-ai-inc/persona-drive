import assert from 'node:assert/strict'
import { test } from 'node:test'

import { wornAndLooped } from './loop.ts'

const create = { id: 'c01', kind: 'button', name: 'Create ticket', region: 'dialog' }
const step = (outcome: string) => ({
  route: '/app.html',
  control: { id: 'c01', kind: 'button', name: 'Create ticket' },
  outcome,
})

test('an option is worn after three no-progress uses on one route, until something there makes progress', () => {
  const controls = [{ ...create, target: 'Create ticket' }]
  const nothing = [
    step('no visible change'),
    step('refused: POST /api/tickets 422'),
    step('no visible change'),
  ]
  assert.deepEqual(wornAndLooped(nothing, '/app.html', new Map(), controls).worn, [
    'button "Create ticket"',
  ])
  const filled = [
    ...nothing,
    {
      ...step('the screen changed'),
      control: { id: 'c02', kind: 'textbox', name: 'Title' },
    },
  ]
  assert.deepEqual(wornAndLooped(filled, '/app.html', new Map(), controls).worn, [])
  assert.deepEqual(wornAndLooped(nothing, '/other', new Map(), controls).worn, [])
})

test('a page control that led back to a visited route three times is looped', () => {
  const controls = [
    { id: 'c00', kind: 'link', name: 'Contact', region: 'navigation', target: 'Contact' },
  ]
  const revisits = new Map([['link "Contact"', 3]])
  assert.deepEqual(wornAndLooped([], '/security.html', revisits, controls).looped, [
    'link "Contact"',
  ])
})
