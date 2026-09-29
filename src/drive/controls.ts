import { short, type PageControl } from '../capture/controls.ts'
import type { DriveControl } from '../rubric.ts'

/** Choice options stay near this many so the question reads cleanly (the harness options come on top). */
export const MAX_CONTROLS = 50
/** A repeated control (the same name up to its digits) is offered this many times. */
const MAX_REPEATS = 3
/** A native select with at most this many other options offers each as an option. */
export const MAX_SELECT_OPTIONS = 8
/** At most this many identifiers are taken from a goal, and this many `type` options offered per step. */
const MAX_TOKENS = 4
const MAX_TYPE_OPTIONS = 6
/** Over the cap, this many navigation links and this many footer links (in page order) are kept ahead of the page's own controls; a footer of ordinary size fits whole. */
const NAV_QUOTA = 12
const FOOTER_QUOTA = 24

/** A control offered to Jev, with what code needs to find and use it (never sent or stored). */
export interface OfferedControl extends DriveControl {
  /** The accessible name it is found by, unshortened and unredacted. */
  target: string
  /** A link's href, the stable way to find it again. */
  href?: string
  /** The option label or text to use, unredacted. */
  input?: string
}

/**
 * The identifiers a goal names, in order, at most 4: record ids such as
 * `F-2026-0022` or `INV-0042`, and phrases in double quotes.
 */
export function goalTokens(goal: string): string[] {
  const ids = goal.match(/\b[A-Z]{1,5}-\d{3,}(?:-\d{3,6})?\b/g) ?? []
  const quoted = [...goal.matchAll(/["“]([^"“”]{2,60})["”]/g)].map((m) => m[1] ?? '')
  return [...new Set([...ids, ...quoted])].slice(0, MAX_TOKENS)
}

/** A page control, or one of its native select options, or text typed into it. */
export type Candidate = PageControl & Pick<OfferedControl, 'action' | 'input'>

/**
 * The page controls with a native select's options in place of the select
 * (when it has 1 to 8 other options), and after each text box, search box or
 * non-select combobox a `type` option per goal identifier (at most 6 per step).
 */
export function expandControls(
  controls: readonly PageControl[],
  selects: Readonly<Record<string, readonly string[]>>,
  tokens: readonly string[],
): Candidate[] {
  let typing = 0
  return controls.flatMap((c): Candidate[] => {
    const options = c.kind === 'combobox' ? selects[c.name] : undefined
    if (options) {
      if (options.length === 0 || options.length > MAX_SELECT_OPTIONS) return [c]
      return options.map((o) => ({ ...c, action: 'select', input: o }))
    }
    if (!['textbox', 'searchbox', 'combobox'].includes(c.kind)) return [c]
    const typed = tokens
      .slice(0, Math.max(0, MAX_TYPE_OPTIONS - typing))
      .map((t): Candidate => ({ ...c, action: 'type', input: t }))
    typing += typed.length
    return [c, ...typed]
  })
}

const WORD = /[a-z]{4,}/g
/** Five-letter stems of a text's words of four letters or more. */
function stems(text: string): Set<string> {
  return new Set((text.toLowerCase().match(WORD) ?? []).map((w) => w.slice(0, 5)))
}

/**
 * The step's controls, at most 50 in page order. When there are more, a
 * control repeated with only its digits changed (a table's `Open 0022`, `Open
 * 0021`, …) is kept 3 times, unless its name holds one of the goal's
 * identifiers, and then those controls and the navigation links that share a
 * word stem with the goal come first, then the first 12 navigation links and
 * the first 24 footer links (a person who cannot see what they want looks at
 * the site's navigation, then its footer), then the rest of the page, then the
 * other navigation and footer links.
 */
export function driveControls(
  controls: readonly Candidate[],
  goal: string,
  max = MAX_CONTROLS,
): OfferedControl[] {
  const tokens = goalTokens(goal)
  const named = (c: Candidate) =>
    c.action === undefined && tokens.some((t) => c.name.includes(t))
  const repeats = new Map<string, number>()
  const kept = controls.filter((c) => {
    if (controls.length <= max || named(c)) return true
    const key = `${c.action ?? ''} ${c.input ?? ''} ${c.kind} ${c.name}`.replace(
      /\d+/g,
      '#',
    )
    const n = (repeats.get(key) ?? 0) + 1
    repeats.set(key, n)
    return n <= MAX_REPEATS
  })
  const goalStems = stems(goal)
  const seen = { navigation: 0, contentinfo: 0 }
  const quota = { navigation: NAV_QUOTA, contentinfo: FOOTER_QUOTA }
  const rank = (c: Candidate) => {
    if (named(c)) return 0
    if (c.region !== 'navigation' && c.region !== 'contentinfo') return 2
    if ([...stems(c.name)].some((s) => goalStems.has(s))) return 0
    return seen[c.region]++ < quota[c.region] ? 1 : 3
  }
  return kept
    .map((c, i) => ({ c, i, rank: rank(c) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map(({ c }, i) => ({
      id: `c${String(i).padStart(2, '0')}`,
      kind: c.kind,
      name: short(c.name),
      region: c.region,
      ...(c.action && c.input !== undefined
        ? { action: c.action, value: short(c.input), input: c.input }
        : {}),
      target: c.name,
      ...(c.href ? { href: c.href } : {}),
    }))
}

/** The highest-probability option that was not vetoed. */
export function pickOption(
  probabilities: Record<string, number>,
  vetoed: ReadonlySet<string>,
): { id: string; p: number } {
  const ranked = Object.entries(probabilities)
    .filter(([id]) => !vetoed.has(id))
    .sort((a, b) => b[1] - a[1])
  const [id, p] = ranked[0] ?? ['stuck', 0]
  return { id, p }
}
