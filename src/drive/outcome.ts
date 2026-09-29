import type { ScreenState } from '../capture/snapshot.ts'

export function dialogName(aria: string | undefined): string | null {
  if (aria === undefined) return null
  return /^\s*- (?:alert)?dialog(?: "((?:[^"\\]|\\.)*)")?/.exec(aria)?.[1] ?? '(unnamed)'
}

/** A one-line, code-derived description of what an option did. */
export function outcomeOf(
  before: ScreenState,
  after: ScreenState,
  extra: {
    actError?: string
    blocked: string[]
    option: string
    /** The marker of text this goal typed, once the goal has saved something. */
    typed?: string
    /** `scroll_down` found the window already at the end of the screen. */
    atBottom?: boolean
  },
): string {
  const parts: string[] = []
  const shown = (s: ScreenState) =>
    extra.typed === undefined
      ? undefined
      : `${s.aria}\n${s.dialog ?? ''}`
          .split('\n')
          .find((l) => l.includes(extra.typed ?? '') && !/^\s*- '?textbox\b/.test(l))
  if (extra.actError) parts.push(`could not act: ${extra.actError.slice(0, 120)}`)
  for (const w of extra.blocked) parts.push(`blocked write ${w}`)
  if (after.route !== before.route) parts.push(`went to ${after.route}`)
  const was = dialogName(before.dialog)
  const now = dialogName(after.dialog)
  if (was !== now) {
    if (was !== null) parts.push(`closed dialog "${was}"`)
    if (now !== null) parts.push(`opened dialog "${now}"`)
  }
  for (const m of after.mutations) {
    const path = new URL(m.url).pathname
    parts.push(
      `${m.status < 400 ? 'saved' : 'refused'}: ${m.method} ${path} ${String(m.status)}`,
    )
  }
  for (const a of after.alerts.filter((x) => !before.alerts.includes(x))) {
    parts.push(`alert: ${a.replace(/\s+/g, ' ').slice(0, 120)}`)
  }
  const line = shown(after)
  if (line !== undefined && shown(before) === undefined) {
    const text = line
      .replace(/^\s*- /, '')
      .replace(/\s+/g, ' ')
      .slice(0, 100)
    parts.push(`text typed in this session is shown: ${text}`)
  }
  if (parts.length) return parts.join('; ')
  if (extra.option === 'scroll_down') {
    return extra.atBottom ? 'scrolled down: already at the bottom' : 'scrolled down'
  }
  if (extra.option === 'scroll_up') return 'scrolled up to the top'
  if (extra.option === 'wait') return 'waited'
  return after.aria === before.aria && after.dialog === before.dialog
    ? 'no visible change'
    : 'the screen changed'
}
