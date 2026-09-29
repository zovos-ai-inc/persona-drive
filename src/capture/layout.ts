import type { Page } from '@playwright/test'

/** Viewport-relative box, CSS pixels. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** sRGB 0–255 channels and alpha 0–1, as a 1×1 canvas renders the computed colour. */
export type Rgba = [number, number, number, number]

/**
 * What the page reports; `layoutFacts` turns it into text in code. While a
 * dialog is open, `underDialog` marks the controls, clipped text, tables and
 * clipping containers outside the topmost one (under its backdrop).
 */
export interface RawLayout {
  viewport: { width: number; height: number }
  /**
   * Visible interactive elements, each box cut to what is painted (viewport and
   * clipping ancestors); `within` holds the indices of interactive ancestors.
   */
  controls: {
    label: string
    box: Box
    within: number[]
    underDialog?: boolean
    /** Inside a fixed or sticky container (a header that stays put while the page scrolls). */
    pinned?: boolean
  }[]
  /** Text of elements whose own text is wider than their box. */
  clipped: { text: string; ellipsis: boolean; underDialog?: boolean }[]
  /** The focused element, when it is not the body. */
  focused: { label: string; box: Box } | null
  /** Visible text with its colour and the background composited beneath it. */
  texts: { text: string; fg: Rgba; bg: Rgba; large: boolean }[]
  /** Loading indicators and how long this document has shown each one. */
  busy: { label: string; ageMs: number }[]
  /**
   * Tables (`<table>`, ARIA tables and grids, and sets of CSS-grid rows that
   * share a column template, left edge and list): the header row's cells
   * with their left edge, and each body row's cell left edges.
   */
  tables: {
    head: { label: string; x: number }[] | null
    rows: number[][]
    underDialog?: boolean
  }[]
  /**
   * Containers that hide their horizontal overflow with content cut off past
   * their right edge: how far the content runs past it, and the first text cut.
   */
  overflowing: {
    label: string
    hiddenPx: number
    first: string
    underDialog?: boolean
  }[]
  /** Dialogs whose content sits in a column much narrower than a layout grid inside them. */
  narrow: { label: string; column: number; width: number }[]
}

/** WCAG 2.2 AA minimum contrast for normal and for large text. */
export const CONTRAST_MIN = 4.5
export const CONTRAST_MIN_LARGE = 3
/** Under this share of its minimum a contrast is stated as far under it, else slightly under. */
const FAR_UNDER = 2 / 3
/** A loading indicator shown at least this long is a fact. */
export const BUSY_MS = 5_000
/** Facts of one kind past this many become one `(+K more …)` line. */
const PER_KIND = 5
/** Overlaps thinner than this in either direction are borders touching. */
const OVERLAP_PX = 4
/** Cells of one column whose left edges differ by more than this are misaligned. */
export const ALIGN_PX = 4
const TEXT_CHARS = 60

function quote(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return `"${flat.length > TEXT_CHARS ? `${flat.slice(0, TEXT_CHARS)}…` : flat}"`
}

function channel(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance([r, g, b]: Rgba): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** `top` alpha-composited over an opaque `bottom`. */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3]
  return [
    top[0] * a + bottom[0] * (1 - a),
    top[1] * a + bottom[1] * (1 - a),
    top[2] * a + bottom[2] * (1 - a),
    1,
  ]
}

/** WCAG contrast ratio of a (possibly translucent) text colour over an opaque background. */
export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const a = luminance(over(fg, bg))
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function overlaps(a: Box, b: Box): boolean {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w >= OVERLAP_PX && h >= OVERLAP_PX
}

function offscreen(box: Box, vp: RawLayout['viewport']): string | null {
  if (box.y + box.height <= 0) return 'above'
  if (box.y >= vp.height) return 'below'
  if (box.x + box.width <= 0) return 'left of'
  if (box.x >= vp.width) return 'right of'
  return null
}

function capped(kind: string, lines: string[]): string[] {
  const unique = [...new Set(lines)]
  if (unique.length <= PER_KIND) return unique
  return [
    ...unique.slice(0, PER_KIND),
    `(+${String(unique.length - PER_KIND)} more ${kind} facts)`,
  ]
}

/**
 * The layout facts a user could see as broken, as short text lines (empty when
 * there are none): interactive elements drawn over each other (nested ones
 * excepted, and a pinned header over content scrolled under it), text wider than its box, a focused element outside the viewport,
 * text under the WCAG AA contrast minimum for its size (far under below two
 * thirds of it, else slightly under), and loading indicators shown for 5 s or
 * more. Every comparison is made here, so the lines only state results. While
 * a dialog is open, only what is inside the topmost one is compared: controls,
 * clipped text, tables and clipping containers under its backdrop are left out.
 */
export function layoutFacts(raw: RawLayout): string[] {
  const overlap: string[] = []
  raw.controls.forEach((a, i) => {
    raw.controls.slice(i + 1).forEach((b, k) => {
      const j = i + 1 + k
      if (a.underDialog || b.underDialog) return
      if (a.within.includes(j) || b.within.includes(i)) return
      // A pinned header over page content that scrolled under it is by design.
      if (!!a.pinned !== !!b.pinned) return
      if (overlaps(a.box, b.box)) {
        overlap.push(
          `overlap: ${quote(a.label)} and ${quote(b.label)} are drawn over each other`,
        )
      }
    })
  })
  const clipped = raw.clipped
    .filter((c) => !c.underDialog)
    .map(
      (c) =>
        `clipped: ${quote(c.text)} is cut off at its right edge${c.ellipsis ? ' with an ellipsis' : ''}`,
    )
  const focus: string[] = []
  const where = raw.focused ? offscreen(raw.focused.box, raw.viewport) : null
  if (raw.focused && where) {
    focus.push(
      `focus off-screen: the focused ${quote(raw.focused.label)} is ${where} the visible area`,
    )
  }
  const contrast = raw.texts.flatMap((t) => {
    const min = t.large ? CONTRAST_MIN_LARGE : CONTRAST_MIN
    const ratio = contrastRatio(t.fg, t.bg)
    if (ratio >= min) return []
    const how = ratio < min * FAR_UNDER ? 'far under' : 'slightly under'
    return [
      `low contrast: ${quote(t.text)} has contrast ${(Math.floor(ratio * 10) / 10).toFixed(1)}:1, ${how} the ${String(min)}:1 minimum for its size`,
    ]
  })
  const busy = raw.busy
    .filter((b) => b.ageMs >= BUSY_MS)
    .map((b) => `stuck loading: ${quote(b.label)} has shown for 5 seconds or more`)
  const columns = raw.tables.filter((t) => !t.underDialog).flatMap(tableFacts)
  const cut = raw.overflowing
    .filter((o) => !o.underDialog)
    .map(
      (o) =>
        `clipped content: ${quote(o.label)} hides content ${String(Math.round(o.hiddenPx))} px past its right edge, from ${quote(o.first)} on`,
    )
  const narrow = raw.narrow.map(
    (n) =>
      `narrow column: the dialog ${quote(n.label)} lays its content out in a ${String(Math.round(n.column))} px column, under half of its ${String(Math.round(n.width))} px width`,
  )
  return [
    ...capped('overlap', overlap),
    ...capped('clipped', clipped),
    ...capped('clipped content', cut),
    ...capped('column', columns),
    ...narrow,
    ...focus,
    ...capped('low contrast', contrast),
    ...capped('loading', busy),
  ]
}

/**
 * One table's alignment facts, at most two: the columns whose cells' left
 * edges differ by more than 4 px across the body rows (those with the most
 * common cell count), and the header cells more than 4 px off the median left
 * edge of their column.
 */
function tableFacts(t: RawLayout['tables'][number]): string[] {
  const counts = new Map<number, number>()
  for (const r of t.rows) counts.set(r.length, (counts.get(r.length) ?? 0) + 1)
  const [cells] = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] ?? [0]
  const rows = t.rows.filter((r) => r.length === cells)
  if (cells < 2 || rows.length < 2) return []
  const head = t.head?.length === cells ? t.head : null
  const drifting: string[] = []
  const offHeaders: string[] = []
  let drift = 0
  let off = 0
  for (let j = 0; j < cells; j++) {
    const xs = rows.map((r) => r[j] ?? 0).sort((a, b) => a - b)
    const label = head?.[j]?.label
    const name = label ? quote(label) : `number ${String(j + 1)}`
    const spread = (xs.at(-1) ?? 0) - (xs[0] ?? 0)
    if (spread > ALIGN_PX) {
      drifting.push(name)
      drift = Math.max(drift, spread)
    }
    const median = xs[Math.floor(xs.length / 2)] ?? 0
    const gap = Math.abs((head?.[j]?.x ?? median) - median)
    if (gap > ALIGN_PX) {
      offHeaders.push(name)
      off = Math.max(off, gap)
    }
  }
  const facts: string[] = []
  if (drifting.length) {
    facts.push(
      `misaligned column: the cells of ${drifting.length === 1 ? 'column' : 'columns'} ${drifting.join(', ')} start at different positions from row to row, up to ${String(Math.round(drift))} px apart`,
    )
  }
  if (offHeaders.length) {
    facts.push(
      `misaligned header: the ${offHeaders.length === 1 ? 'header' : 'headers'} of ${offHeaders.length === 1 ? 'column' : 'columns'} ${offHeaders.join(', ')} ${offHeaders.length === 1 ? 'starts' : 'start'} up to ${String(Math.round(off))} px away from the cells below`,
    )
  }
  return facts
}

const INTERACTIVE =
  'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="combobox"]'
const BUSY =
  '[aria-busy="true"], [role="progressbar"]:not([aria-valuenow]), progress:not([value]), [class*="skeleton"], [class*="spinner"], [role="status"]'
const MAX_ELEMENTS = 400
const TABLE_CELLS =
  '[role="cell"], [role="gridcell"], [role="columnheader"], [role="rowheader"]'
const DIALOGS = 'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]'
/** Content running this far past a clipping container's right edge is cut off. */
const OVERFLOW_PX = 8
/** Tables and rows measured per page. */
const MAX_TABLES = 20
const MAX_ROWS = 60
/** A dialog's layout grid at least this wide is checked for a narrow content column. */
const NARROW_MIN_PX = 480

/**
 * Measure the page for `layoutFacts`. Colours are normalised through a 1×1
 * canvas so any CSS colour syntax (oklch, color-mix) comes back as sRGB. A
 * loading indicator's age is kept per element in the document, so it counts
 * from the first capture that saw it. CSS-grid rows are grouped into a table
 * by their column template (the inline one, else their first class), left
 * edge and the list they sit in (a row's width is left out: a row whose
 * tracks overflow is wider than the rest); a row whose class differs from the
 * rest, or that holds column headers, is the header. Of the visible open
 * dialogs, the topmost is the one drawn over the others where they overlap,
 * else the last in document order (the last opened).
 */
export async function collectLayout(page: Page): Promise<RawLayout> {
  // No named inner functions here: tsx wraps them in a `__name` helper the page lacks.
  return page.evaluate(
    ({
      interactiveSel,
      busySel,
      max,
      cellSel,
      dialogSel,
      overflowPx,
      maxTables,
      maxRows,
      narrowMin,
    }) => {
      const vis = { opacityProperty: true, visibilityProperty: true }
      const open = [...document.querySelectorAll(dialogSel)].filter((el) =>
        el.checkVisibility(vis),
      )
      // Of two dialogs, the one drawn at the centre of the area they share;
      // the later in document order when they share none.
      const topDialog = open.reduce<Element | undefined>((top, d) => {
        if (!top) return d
        const [a, r] = [top.getBoundingClientRect(), d.getBoundingClientRect()]
        const [left, right] = [Math.max(a.left, r.left), Math.min(a.right, r.right)]
        const [upper, lower] = [Math.max(a.top, r.top), Math.min(a.bottom, r.bottom)]
        if (right <= left || lower <= upper) return d
        const hit = document.elementFromPoint((left + right) / 2, (upper + lower) / 2)
        return top.contains(hit) && !d.contains(hit) ? top : d
      }, undefined)
      const interactive = [...document.querySelectorAll(interactiveSel)]
        .filter((el) => el.checkVisibility(vis))
        .slice(0, max)
      const busyEls = [...document.querySelectorAll(busySel)]
        .filter((el) => el.checkVisibility(vis))
        .filter(
          (el) =>
            !el.matches('[role="status"]') ||
            (el as HTMLElement).innerText.includes('Loading'),
        )
      const active = document.activeElement
      const focusEl =
        active && active !== document.body && active !== document.documentElement
          ? active
          : null
      const described = new Map<Element, { label: string; box: Box }>()
      for (const el of [...interactive, ...busyEls, ...(focusEl ? [focusEl] : [])]) {
        const r = el.getBoundingClientRect()
        const label = (
          el.getAttribute('aria-label') ??
          ((el as HTMLElement).innerText || el.getAttribute('placeholder')) ??
          ''
        ).trim()
        described.set(el, {
          label: label || el.tagName.toLowerCase(),
          box: { x: r.x, y: r.y, width: r.width, height: r.height },
        })
      }

      // A control's box as painted: cut to the viewport and to every ancestor
      // that clips its overflow (a scrolled sidebar), so a control scrolled out
      // of view overlaps nothing. Fully cut-away controls are left out.
      const painted = interactive.flatMap((el) => {
        const r = el.getBoundingClientRect()
        let [left, top, right, bottom] = [r.left, r.top, r.right, r.bottom]
        left = Math.max(left, 0)
        top = Math.max(top, 0)
        right = Math.min(right, window.innerWidth)
        bottom = Math.min(bottom, window.innerHeight)
        for (let p = el.parentElement; p; p = p.parentElement) {
          const style = getComputedStyle(p)
          if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
          const c = p.getBoundingClientRect()
          left = Math.max(left, c.left)
          top = Math.max(top, c.top)
          right = Math.min(right, c.right)
          bottom = Math.min(bottom, c.bottom)
        }
        if (right - left < 1 || bottom - top < 1) return []
        return [
          { el, box: { x: left, y: top, width: right - left, height: bottom - top } },
        ]
      })
      const index = new Map(painted.map(({ el }, i) => [el, i]))
      const controls = painted.map(({ el, box }) => {
        const within: number[] = []
        for (let p = el.parentElement; p; p = p.parentElement) {
          const i = index.get(p)
          if (i !== undefined) within.push(i)
        }
        let pinned = false
        for (let p: Element | null = el; p; p = p.parentElement) {
          const position = getComputedStyle(p).position
          if (position === 'fixed' || position === 'sticky') pinned = true
        }
        return {
          label: described.get(el)?.label ?? '',
          box,
          within,
          underDialog: !!topDialog && !topDialog.contains(el),
          pinned,
        }
      })

      const textEls = [...document.body.querySelectorAll('*')]
        .filter((el) =>
          [...el.childNodes].some(
            (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim(),
          ),
        )
        .filter((el) => el.checkVisibility(vis))
        // Visually hidden (screen-reader only) text is a 1-pixel box.
        .filter((el) => el.clientWidth > 1 && el.clientHeight > 1)
        .slice(0, max)
      const clipped = textEls
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .filter((el) => getComputedStyle(el).overflowX !== 'visible')
        .map((el) => ({
          text: (el as HTMLElement).innerText,
          ellipsis: getComputedStyle(el).textOverflow === 'ellipsis',
          underDialog: !!topDialog && !topDialog.contains(el),
        }))

      // Each text's colour and the background colours beneath it, nearest first,
      // up to the first opaque one; null when a background image is in the stack.
      const stacks = textEls
        .filter((el) => !el.closest(':disabled, [aria-disabled="true"]'))
        .map((el) => {
          const style = getComputedStyle(el)
          const layers: string[] = []
          for (let node: Element | null = el; node; node = node.parentElement) {
            const s = getComputedStyle(node)
            if (s.backgroundImage !== 'none') return null
            layers.push(s.backgroundColor)
          }
          const size = parseFloat(style.fontSize)
          return {
            text: (el as HTMLElement).innerText,
            color: style.color,
            layers,
            large: size >= 24 || (Number(style.fontWeight) >= 700 && size >= 18.66),
          }
        })
        .filter((x) => x !== null)
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      const rgba = new Map<string, Rgba>()
      for (const color of new Set(stacks.flatMap((x) => [x.color, ...x.layers]))) {
        if (!ctx) break
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = '#000'
        ctx.fillStyle = color
        ctx.fillRect(0, 0, 1, 1)
        const d = ctx.getImageData(0, 0, 1, 1).data
        rgba.set(color, [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 0) / 255])
      }
      const texts = stacks.flatMap((x) => {
        const fg = rgba.get(x.color)
        if (!fg) return []
        const layers = x.layers.map((l) => rgba.get(l) ?? ([0, 0, 0, 0] as Rgba))
        const opaque = layers.findIndex((l) => l[3] >= 1)
        // The canvas (white) is beneath a stack with no opaque layer.
        let bg: Rgba = [255, 255, 255, 1]
        for (const top of layers
          .slice(0, opaque === -1 ? undefined : opaque + 1)
          .reverse()) {
          bg = [
            top[0] * top[3] + bg[0] * (1 - top[3]),
            top[1] * top[3] + bg[1] * (1 - top[3]),
            top[2] * top[3] + bg[2] * (1 - top[3]),
            1,
          ]
        }
        return [{ text: x.text, fg, bg, large: x.large }]
      })

      const w = window as unknown as { __zqaBusySince?: WeakMap<Element, number> }
      const since = (w.__zqaBusySince ??= new WeakMap())
      const now = performance.now()
      const busy = busyEls.map((el) => {
        if (!since.has(el)) since.set(el, now)
        return {
          label: described.get(el)?.label ?? '',
          ageMs: now - (since.get(el) ?? now),
        }
      })

      // Tables: each row's visible cells' left edges; `<table>` and ARIA
      // tables first, then sets of CSS-grid rows outside them.
      const all = [...document.body.querySelectorAll('*')].filter((el) =>
        el.checkVisibility(vis),
      )
      const tables: RawLayout['tables'] = []
      const tableRoots = all.filter((el) =>
        el.matches('table, [role="table"], [role="grid"], [role="treegrid"]'),
      )
      for (const t of tableRoots.slice(0, maxTables)) {
        const rowEls =
          t instanceof HTMLTableElement
            ? [...t.rows]
            : [...t.querySelectorAll('[role="row"]')].filter(
                (r) =>
                  r.closest('table, [role="table"], [role="grid"], [role="treegrid"]') ===
                  t,
              )
        let head: { label: string; x: number }[] | null = null
        const rows: number[][] = []
        for (const r of rowEls.filter((x) => x.checkVisibility(vis)).slice(0, maxRows)) {
          const cells = (
            r instanceof HTMLTableRowElement
              ? [...r.cells]
              : [...r.querySelectorAll(cellSel)]
          ).filter((c) => c.checkVisibility(vis))
          const isHead =
            cells.length > 0 &&
            cells.every(
              (c) => c.tagName === 'TH' || c.getAttribute('role') === 'columnheader',
            )
          if (isHead && head === null && rows.length === 0) {
            head = cells.map((c) => ({
              label: (c as HTMLElement).innerText.trim(),
              x: c.getBoundingClientRect().left,
            }))
          } else {
            rows.push(cells.map((c) => c.getBoundingClientRect().left))
          }
        }
        tables.push({ head, rows, underDialog: !!topDialog && !topDialog.contains(t) })
      }
      const groups = new Map<string, Element[]>()
      const lists = new Map<Element, number>()
      for (const el of all) {
        if (!(el instanceof HTMLElement)) continue
        const display = getComputedStyle(el).display
        if (display !== 'grid' && display !== 'inline-grid') continue
        if (el.closest('table, [role="table"], [role="grid"], [role="treegrid"]'))
          continue
        if ([...el.children].filter((c) => c.checkVisibility(vis)).length < 2) continue
        const template = el.style.gridTemplateColumns || el.classList[0]
        if (!template) continue
        // The list the row sits in: its nearest ancestor with three or more
        // children (a row may be wrapped with a checkbox of its own).
        let list = el.parentElement
        while (list && list.children.length < 3) list = list.parentElement
        if (!list) continue
        if (!lists.has(list)) lists.set(list, lists.size)
        const key = `${template}|${String(Math.round(el.getBoundingClientRect().left))}|${String(lists.get(list))}`
        const g = groups.get(key) ?? []
        g.push(el)
        groups.set(key, g)
      }
      for (const g of [...groups.values()].filter((x) => x.length >= 3)) {
        if (tables.length >= maxTables) break
        // Leave out a grid nested in another row of the same set.
        const rowEls = g.filter((el) => !g.some((o) => o !== el && o.contains(el)))
        if (rowEls.length < 3) continue
        const classes = new Map<string, number>()
        for (const el of rowEls)
          classes.set(el.className, (classes.get(el.className) ?? 0) + 1)
        const common = [...classes].sort((a, b) => b[1] - a[1])[0]?.[0]
        const first = rowEls[0]
        const headEl =
          first &&
          (first.className !== common || first.querySelector('th, [role="columnheader"]'))
            ? first
            : null
        tables.push({
          head: headEl
            ? [...headEl.children]
                .filter((c) => c.checkVisibility(vis))
                .map((c) => ({
                  label: (c as HTMLElement).innerText.trim(),
                  x: c.getBoundingClientRect().left,
                }))
            : null,
          rows: rowEls
            .filter((el) => el !== headEl)
            .slice(0, maxRows)
            .map((el) =>
              [...el.children]
                .filter((c) => c.checkVisibility(vis))
                .map((c) => c.getBoundingClientRect().left),
            ),
          underDialog: !!topDialog && !!first && !topDialog.contains(first),
        })
      }

      // Containers that clip horizontal overflow, with visible content cut
      // off past their right edge (not content an inner clipping box holds).
      const overflowing: RawLayout['overflowing'] = []
      for (const el of all) {
        if (!(el instanceof HTMLElement) || el.children.length === 0) continue
        if (el.scrollWidth <= el.clientWidth + overflowPx || el.clientWidth <= 40)
          continue
        const ox = getComputedStyle(el).overflowX
        if (ox !== 'hidden' && ox !== 'clip') continue
        const right = el.getBoundingClientRect().right
        let hidden = 0
        let firstCut = ''
        for (const d of [...el.querySelectorAll('*')].slice(0, max)) {
          if (!(d instanceof HTMLElement) || !d.checkVisibility(vis)) continue
          const dr = d.getBoundingClientRect()
          if (dr.width <= 1 || dr.right <= right + overflowPx) continue
          if (
            ![...d.childNodes].some(
              (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim(),
            )
          )
            continue
          let inner = false
          for (let p = d.parentElement; p && p !== el; p = p.parentElement) {
            if (getComputedStyle(p).overflowX !== 'visible') inner = true
          }
          if (inner) continue
          if (!firstCut) firstCut = d.innerText
          hidden = Math.max(hidden, dr.right - right)
        }
        if (!firstCut) continue
        const heading = el.querySelector('h1, h2, h3, h4, [role="heading"]')
        overflowing.push({
          label:
            el.getAttribute('aria-label') ||
            (heading as HTMLElement | null)?.innerText ||
            el.innerText.slice(0, 80),
          hiddenPx: hidden,
          first: firstCut,
          underDialog: !!topDialog && !topDialog.contains(el),
        })
      }

      // A dialog's layout grid of two or more column tracks whose visible
      // children all sit in under half of its width, in a column at least
      // 120 px tall (the other tracks left empty).
      const narrow: RawLayout['narrow'] = []
      for (const dlg of all.filter((el) => el.matches(dialogSel))) {
        const grids = [dlg, ...dlg.querySelectorAll('*')].filter(
          (el) =>
            el.checkVisibility(vis) &&
            ['grid', 'inline-grid'].includes(getComputedStyle(el).display) &&
            getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length >= 2 &&
            el.clientWidth >= narrowMin,
        )
        for (const g of grids) {
          const kids = [...g.children]
            .filter((c) => c.checkVisibility(vis))
            .map((c) => c.getBoundingClientRect())
          if (kids.length === 0) continue
          const left = Math.min(...kids.map((k) => k.left))
          const column = Math.max(...kids.map((k) => k.right)) - left
          const tall =
            Math.max(...kids.map((k) => k.bottom)) - Math.min(...kids.map((k) => k.top))
          if (column * 2 >= g.clientWidth || tall < 120) continue
          const heading = dlg.querySelector('h1, h2, h3, h4, [role="heading"]')
          const named = (dlg.getAttribute('aria-labelledby') ?? '')
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.innerText ?? '')
            .join(' ')
            .trim()
          narrow.push({
            label:
              named ||
              dlg.getAttribute('aria-label') ||
              (heading as HTMLElement | null)?.innerText ||
              '(unnamed)',
            column,
            width: g.clientWidth,
          })
          break
        }
      }

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        controls,
        clipped,
        focused: focusEl ? (described.get(focusEl) ?? null) : null,
        texts,
        busy,
        tables,
        overflowing,
        narrow,
      }
    },
    {
      interactiveSel: INTERACTIVE,
      busySel: BUSY,
      max: MAX_ELEMENTS,
      cellSel: TABLE_CELLS,
      dialogSel: DIALOGS,
      overflowPx: OVERFLOW_PX,
      maxTables: MAX_TABLES,
      maxRows: MAX_ROWS,
      narrowMin: NARROW_MIN_PX,
    },
  )
}
