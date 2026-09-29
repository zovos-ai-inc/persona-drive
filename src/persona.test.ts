import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { test } from 'node:test'

import { loadPersona, parsePersona } from './persona.ts'
import { loadTarget, parseTarget } from './target.ts'

const HEAD = 'name: Sam\nrole: visitor\ncares: the price\n'

test('parsePersona validates the header, ids, starts, writes and parts', () => {
  const ok = parsePersona(
    `${HEAD}goals:\n  - id: a-b\n    text: See it.\n    start: /x\n    writes: true\n`,
    'f',
  )
  assert.equal(ok.goals[0]?.writes, true)
  assert.throws(() => parsePersona(`${HEAD}goals: []\n`, 'f'), /needs goals/)
  assert.throws(
    () => parsePersona('role: x\ncares: y\ngoals: [{id: a, text: t}]\n', 'f'),
    /needs a name/,
  )
  assert.throws(
    () => parsePersona(`${HEAD}goals:\n  - id: A b\n    text: t\n`, 'f'),
    /lower-case/,
  )
  assert.throws(
    () => parsePersona(`${HEAD}goals:\n  - id: a\n    text: t\n    start: x\n`, 'f'),
    /start must be a route/,
  )
  const parts = (list: string) =>
    parsePersona(`${HEAD}goals:\n  - id: a\n    text: t\n    parts: ${list}\n`, 'f')
  assert.equal(parts('[See A., See B.]').goals[0]?.parts?.length, 2)
  assert.throws(() => parts('[See A.]'), /parts must be 2 to 4/)
  assert.throws(() => parts('[See A., See A.]'), /parts must be 2 to 4/)
})

test('parseTarget fills defaults and resolves file paths beside the target file', () => {
  const t = parseTarget(
    'name: t\nbaseUrl: https://example.com/\nsignIn: ./sign-in.ts\n',
    '/tmp/targets/t.yaml',
  )
  assert.equal(t.baseUrl, 'https://example.com')
  assert.equal(t.main, 'main')
  assert.deepEqual(t.viewport, { width: 1280, height: 800 })
  assert.equal(t.signIn, '/tmp/targets/sign-in.ts')
  assert.throws(() => parseTarget('name: t\nbaseUrl: ftp://x\n', 'f'), /baseUrl/)
})

test('every shipped persona and target file parses', () => {
  for (const f of readdirSync('personas').filter((f) => f.endsWith('.yaml')))
    loadPersona(`personas/${f}`)
  for (const f of readdirSync('targets').filter((f) => f.endsWith('.yaml')))
    loadTarget(`targets/${f}`)
})
