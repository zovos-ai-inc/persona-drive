import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ariaFollow, ariaHead, cleanAria, SCROLLED, truncateAria } from './aria.ts'

test('cleanAria strips Playwright MCP annotations', () => {
  assert.equal(
    cleanAria(
      '- link "Pricing" [ref=e5] [cursor=pointer]:\n  - /url: /pricing\n- button "Go" [active]',
    ),
    '- link "Pricing":\n  - /url: /pricing\n- button "Go"',
  )
})

test('truncateAria collapses rows past the cap into one counted line', () => {
  const aria = [
    '- table:',
    ...Array.from({ length: 12 }, (_, i) => `  - row "r${String(i)}"`),
    '- button "Next"',
  ].join('\n')
  const out = truncateAria(aria, 10).split('\n')
  assert.equal(out.length, 13)
  assert.equal(out[11], '  - text: "… (+2 more rows)"')
  assert.equal(out[12], '- button "Next"')
})

test('ariaHead moves its 60-line window by offset, never past the last 60 lines', () => {
  const aria = [
    '- heading "Findings" [level=1]',
    ...Array.from({ length: 199 }, (_, i) => `- text: line ${String(i + 1)}`),
  ].join('\n')
  const top = ariaHead(aria).split('\n')
  assert.equal(top.length, 60)
  assert.equal(top[0], '- heading "Findings" [level=1]')
  const scrolled = ariaHead(aria, 50).split('\n')
  assert.equal(scrolled.length, 60)
  assert.deepEqual([scrolled[0], scrolled[1]], [SCROLLED, '- text: line 51'])
  assert.equal(ariaHead(aria, 500).split('\n').at(-1), '- text: line 199')
})

test('ariaFollow moves the window to a control activated below it', () => {
  const aria = [
    '- heading "Threads" [level=1]',
    ...Array.from({ length: 150 }, (_, i) => `- button "Open thread ${String(i + 1)}"`),
  ].join('\n')
  assert.equal(ariaFollow(aria, aria, 'Open thread 20', 0), 0)
  assert.equal(ariaFollow(aria, aria, 'Open thread 100', 0), 90)
  assert.equal(ariaFollow(aria, aria, 'Open thread 100', 50), 50)
})
