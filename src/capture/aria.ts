/** Rough token estimate used for every budget decision: characters / 4. */
export function estimateTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return Math.ceil(text.length / 4)
}

const ROW = /^(\s*)- (row|option|radio|listitem)\b/

/**
 * Collapse table rows (and select options, radio groups, list items) beyond
 * `maxRows` in an aria snapshot into one `… (+K more rows)` line per run, so
 * the count is stated in the state and Jev never has to count.
 */
export function truncateAria(aria: string, maxRows: number): string {
  const out: string[] = []
  let indent: string | null = null
  let kind = 'row'
  let rows = 0
  let dropped = 0
  const closeRun = () => {
    if (indent !== null && dropped > 0) {
      out.push(`${indent}- text: "… (+${String(dropped)} more ${kind}s)"`)
    }
    indent = null
    rows = 0
    dropped = 0
  }
  for (const line of aria.split('\n')) {
    const row = ROW.exec(line)
    if (row) {
      const rowIndent = row[1] ?? ''
      if (indent !== rowIndent || kind !== row[2]) closeRun()
      indent = rowIndent
      kind = row[2] ?? 'row'
      rows++
      if (rows > maxRows) dropped++
    } else if (
      indent !== null &&
      !line.startsWith(`${indent} `) &&
      !line.startsWith(`${indent}- text:`)
    ) {
      closeRun()
    }
    if (dropped === 0) out.push(line)
  }
  closeRun()
  return out.join('\n')
}

/**
 * Strip the annotations a Playwright MCP snapshot adds to every node
 * (`[ref=e12]`, `[cursor=pointer]`, `[active]`): they mean nothing to Jev.
 */
export function cleanAria(aria: string): string {
  return aria.replace(/ \[(?:ref=[^\]]+|cursor=[^\]]+|active)\]/g, '')
}

const HEAD_LINES = 60
const MAX_TABLE_ROWS = 10
/** The first line of a scrolled `ariaHead`, in place of the line it covers. */
export const SCROLLED = '- text: "(scrolled down: the top of the screen is above this)"'
const H1 = /^\s*- heading ".*" \[level=1\]/

/**
 * The screen's own content: the aria snapshot from its level-1 heading on.
 * Site chrome above it (skip links, search, account menu) is the same on every
 * screen. A snapshot without a level-1 heading is kept whole.
 */
export function screenBody(aria: string): string {
  const lines = aria.split('\n')
  const start = lines.findIndex((line) => H1.test(line))
  return (start === -1 ? lines : lines.slice(start)).join('\n')
}

/** The line `ariaHead` starts at for `offset`: the last 60 lines are as far as a scroll reaches. */
export function ariaStart(aria: string, offset: number): number {
  const lines = truncateAria(screenBody(aria), MAX_TABLE_ROWS).split('\n')
  return Math.max(0, Math.min(offset, lines.length - HEAD_LINES))
}

/**
 * The offset after activating the control named `name`: when its line in
 * `before` sits below the window at `offset`, the browser scrolled the page to
 * it, so the window moves to 10 lines above it in `after`; else `offset`.
 */
export function ariaFollow(
  before: string,
  after: string,
  name: string,
  offset: number,
): number {
  const lines = truncateAria(screenBody(before), MAX_TABLE_ROWS).split('\n')
  const line = lines.findIndex((l) => l.includes(`"${name}"`))
  return line < offset + HEAD_LINES ? offset : ariaStart(after, line - 10)
}

/**
 * 60 lines of `screenBody`, table rows past 10 collapsed first: the first 60,
 * or from `offset` (see `ariaStart`) with a first line saying the screen is
 * scrolled.
 */
export function ariaHead(aria: string, offset = 0): string {
  const start = ariaStart(aria, offset)
  const lines = truncateAria(screenBody(aria), MAX_TABLE_ROWS).split('\n')
  if (start === 0) return lines.slice(0, HEAD_LINES).join('\n')
  return [SCROLLED, ...lines.slice(start + 1, start + HEAD_LINES)].join('\n')
}
