import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { instruction, patchLastOutcome, splitDialog } from './ask.ts'

test('splitDialog lifts the last open dialog out of the page snapshot', () => {
  const aria =
    '- main:\n  - button "Open"\n- dialog "Sign in":\n  - textbox "Email"\n  - button "Go"\n- contentinfo:\n  - link "Terms"'
  const { aria: page, dialog } = splitDialog(aria)
  assert.equal(dialog, '- dialog "Sign in":\n  - textbox "Email"\n  - button "Go"')
  assert.equal(page, '- main:\n  - button "Open"\n- contentinfo:\n  - link "Terms"')
  assert.equal(splitDialog('- main:\n  - button "Open"').dialog, undefined)
})

test('instruction says how to perform each kind of option', () => {
  const base = {
    id: 'c00',
    text: '',
    kind: 'link',
    name: 'Pricing',
    region: 'navigation',
    p: 0.8,
  }
  assert.equal(instruction(base), 'Click the link "Pricing" in the navigation region.')
  assert.equal(
    instruction({
      ...base,
      kind: 'combobox',
      name: 'Status',
      action: 'select',
      value: 'Open',
    }),
    'Select "Open" in the combobox "Status" in the navigation region.',
  )
  assert.match(
    instruction({
      ...base,
      kind: 'searchbox',
      name: 'Search',
      action: 'type',
      value: 'fees',
    }),
    /^Type "fees" into the searchbox "Search"/,
  )
  assert.match(
    instruction({ ...base, id: 'scroll_down', kind: 'option', name: 'scroll_down' }),
    /^Scroll down/,
  )
  assert.match(
    instruction({ ...base, id: 'done', kind: 'option', name: 'done' }),
    /^Stop/,
  )
})

test("patchLastOutcome fills in the last step's outcome and keeps the rest of the record", () => {
  const file = join(mkdtempSync(join(tmpdir(), 'ask-')), 'steps.jsonl')
  writeFileSync(
    file,
    '{"step":1,"outcome":"pending","answers":{"goalMet":{"type":"noul","noul":0.1}}}\n{"step":2,"outcome":"pending","files":{"state":"step-002.json"}}\n',
  )
  patchLastOutcome(file, 'went to /docs.html')
  const lines = readFileSync(file, 'utf8').trim().split('\n')
  assert.equal(lines.length, 2)
  assert.deepEqual(JSON.parse(lines[1] ?? ''), {
    step: 2,
    outcome: 'went to /docs.html',
    files: { state: 'step-002.json' },
  })
  assert.match(lines[0] ?? '', /pending/)
})
