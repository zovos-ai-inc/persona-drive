import assert from 'node:assert/strict'
import { test } from 'node:test'

import { contrastRatio, layoutFacts, type RawLayout } from './layout.ts'

const WHITE = [255, 255, 255, 1] as const
const BLACK = [0, 0, 0, 1] as const

function raw(over: Partial<RawLayout>): RawLayout {
  return {
    viewport: { width: 1280, height: 800 },
    controls: [],
    clipped: [],
    focused: null,
    texts: [],
    busy: [],
    tables: [],
    overflowing: [],
    narrow: [],
    ...over,
  }
}

const box = (x: number, y: number, width = 100, height = 30) => ({ x, y, width, height })

test('a healthy layout has no facts', () => {
  const facts = layoutFacts(
    raw({
      controls: [
        { label: 'Save', box: box(0, 0), within: [] },
        { label: 'Cancel', box: box(110, 0), within: [] },
      ],
      focused: { label: 'Save', box: box(0, 0) },
      texts: [{ text: 'Findings', fg: [...BLACK], bg: [...WHITE], large: false }],
      busy: [{ label: 'Loading…', ageMs: 1_200 }],
    }),
  )
  assert.deepEqual(facts, [])
})

test('overlapping controls are a fact unless one is inside the other or they only touch', () => {
  const facts = layoutFacts(
    raw({
      controls: [
        { label: 'Save', box: box(0, 0), within: [] },
        { label: 'Cancel', box: box(60, 10), within: [] },
        { label: 'Row F-1', box: box(0, 100, 400, 40), within: [] },
        { label: 'Open', box: box(10, 105), within: [2] },
        { label: 'Next', box: box(97, 0), within: [] },
      ],
    }),
  )
  assert.deepEqual(facts, [
    'overlap: "Save" and "Cancel" are drawn over each other',
    'overlap: "Cancel" and "Next" are drawn over each other',
  ])
})

test('clipped text, off-screen focus and stuck loaders are stated as results', () => {
  const facts = layoutFacts(
    raw({
      clipped: [{ text: 'Overdraft disclosure methodology', ellipsis: true }],
      focused: { label: 'Open finding', box: box(0, 900) },
      busy: [
        { label: 'Loading…', ageMs: 5_000 },
        { label: 'spinner', ageMs: 4_999 },
      ],
    }),
  )
  assert.deepEqual(facts, [
    'clipped: "Overdraft disclosure methodology" is cut off at its right edge with an ellipsis',
    'focus off-screen: the focused "Open finding" is below the visible area',
    'stuck loading: "Loading…" has shown for 5 seconds or more',
  ])
})

test('contrast uses the WCAG ratio, the large-text minimum, and translucent text over its background', () => {
  assert.equal(contrastRatio([...BLACK], [...WHITE]).toFixed(1), '21.0')
  // #777 on white is 4.48:1 (stated as 4.4, rounded down): under 4.5 for body
  // text, over 3 for large text.
  const grey = [119, 119, 119, 1] as [number, number, number, number]
  const facts = layoutFacts(
    raw({
      texts: [
        { text: 'Due soon', fg: grey, bg: [...WHITE], large: false },
        { text: 'Findings tracker', fg: grey, bg: [...WHITE], large: true },
        { text: 'faint', fg: [0, 0, 0, 0.3], bg: [...WHITE], large: false },
      ],
    }),
  )
  assert.deepEqual(facts, [
    'low contrast: "Due soon" has contrast 4.4:1, slightly under the 4.5:1 minimum for its size',
    'low contrast: "faint" has contrast 2.1:1, far under the 4.5:1 minimum for its size',
  ])
})

test('each kind keeps five facts and states how many more there are; long text is cut', () => {
  const facts = layoutFacts(
    raw({
      clipped: Array.from({ length: 8 }, (_, i) => ({
        text: `${String(i)} ${'x'.repeat(70)}`,
        ellipsis: false,
      })),
    }),
  )
  assert.equal(facts.length, 6)
  assert.equal(facts[5], '(+3 more clipped facts)')
  assert.match(facts[0] ?? '', /^clipped: "0 x{58}…" is cut off/)
})

test('table columns: cells drifting between rows and a header off its column are one fact each', () => {
  const facts = layoutFacts(
    raw({
      tables: [
        {
          // The findings register before platform #2983: each row its own grid,
          // so the 1fr title resolved per row and every column after it drifted.
          head: [
            { label: 'ID', x: 44 },
            { label: 'Title', x: 150 },
            { label: 'Owner', x: 200 },
          ],
          rows: [
            [44, 150, 240],
            [44, 150, 197],
            [44, 150, 241],
            [44, 150],
          ],
        },
        // Aligned, and a table whose header does not match its rows' cells.
        {
          head: null,
          rows: [
            [0, 100],
            [0, 102],
            [0, 101],
          ],
        },
        {
          head: [{ label: 'Only', x: 0 }],
          rows: [
            [0, 100],
            [0, 100],
          ],
        },
      ],
    }),
  )
  assert.deepEqual(facts, [
    'misaligned column: the cells of column "Owner" start at different positions from row to row, up to 44 px apart',
    'misaligned header: the header of column "Owner" starts up to 40 px away from the cells below',
  ])
})

test('clipped containers and a dialog squeezed into a narrow column are stated with their sizes', () => {
  const facts = layoutFacts(
    raw({
      overflowing: [
        { label: 'Coverage', hiddenPx: 158.4, first: 'C-2025-0016 control chip' },
      ],
      narrow: [{ label: 'Version history', column: 320, width: 879 }],
    }),
  )
  assert.deepEqual(facts, [
    'clipped content: "Coverage" hides content 158 px past its right edge, from "C-2025-0016 control chip" on',
    'narrow column: the dialog "Version history" lays its content out in a 320 px column, under half of its 879 px width',
  ])
})

test('while a dialog is open, what lies under its backdrop is not compared', () => {
  const facts = layoutFacts(
    raw({
      controls: [
        { label: 'Save', box: box(0, 0), within: [], underDialog: true },
        { label: 'Cancel', box: box(60, 10), within: [], underDialog: true },
        { label: 'Close', box: box(50, 5), within: [] },
        { label: 'Confirm', box: box(80, 5), within: [] },
      ],
      clipped: [{ text: 'pat.lee@example.com', ellipsis: true, underDialog: true }],
      tables: [
        {
          head: null,
          rows: [
            [0, 100],
            [0, 140],
            [0, 100],
          ],
          underDialog: true,
        },
      ],
      overflowing: [{ label: 'Coverage', hiddenPx: 40, first: 'C-1', underDialog: true }],
    }),
  )
  assert.deepEqual(facts, ['overlap: "Close" and "Confirm" are drawn over each other'])
})

test('a pinned header over content scrolled under it is not an overlap; two pinned controls are', () => {
  const facts = layoutFacts(
    raw({
      controls: [
        { label: 'Lumen home', box: box(0, 0), within: [], pinned: true },
        { label: 'Pricing', box: box(90, 0), within: [], pinned: true },
        { label: 'Explore →', box: box(0, 10), within: [] },
      ],
    }),
  )
  assert.deepEqual(facts, [
    'overlap: "Lumen home" and "Pricing" are drawn over each other',
  ])
})
