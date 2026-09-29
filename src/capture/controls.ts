import { redact } from './redact.ts'

const KINDS = [
  'button',
  'link',
  'tab',
  'menuitem',
  'checkbox',
  'radio',
  'switch',
  'combobox',
  'textbox',
  'searchbox',
] as const
export type Kind = (typeof KINDS)[number]
// A control line of an aria snapshot: `- button "Save"`, `- 'link "A: b"'` (YAML-quoted), with
// any trailing annotations (`[disabled]`, `[ref=e3]`, `: text`).
const CONTROL = new RegExp(
  `^(\\s*)- ('?)(${KINDS.join('|')}) "((?:[^"\\\\]|\\\\.)+)"(.*)$`,
)
const URL_LINE = /^\s*- \/url: (.+)$/
const LANDMARK =
  /^(\s*)- '?(navigation|main|dialog|alertdialog|banner|complementary|contentinfo|search|form|region)\b/
const NAME_CHARS = 80

export interface PageControl {
  kind: Kind
  name: string
  /** A link's `/url`, as the aria snapshot shows it. */
  href?: string
  /** The nearest enclosing landmark (`navigation`, `main`, `dialog`, …), or `page`. */
  region: string
}

/**
 * The enabled controls named in an aria snapshot, in page order, each with its
 * nearest landmark; a kind+name seen twice is kept once.
 */
export function parseControls(aria: string): PageControl[] {
  const out: PageControl[] = []
  const seen = new Set<string>()
  const lines = aria.split('\n')
  const landmarks: { indent: number; role: string }[] = []
  for (const [i, line] of lines.entries()) {
    const depth = line.length - line.trimStart().length
    while ((landmarks.at(-1)?.indent ?? -1) >= depth) landmarks.pop()
    const landmark = LANDMARK.exec(line)
    if (landmark?.[2]) landmarks.push({ indent: depth, role: landmark[2] })
    const m = CONTROL.exec(line)
    if (!m) continue
    const [, indent = '', quote, kind, raw = '', rest = ''] = m
    if (rest.includes('[disabled]')) continue
    const unquoted = quote ? raw.replace(/''/g, "'") : raw
    const name = unquoted.replace(/\\(.)/g, '$1')
    const key = `${kind ?? ''}\u0000${name}`
    if (seen.has(key)) continue
    seen.add(key)
    const control: PageControl = {
      kind: kind as Kind,
      name,
      region: landmarks.at(-1)?.role ?? 'page',
    }
    if (kind === 'link') {
      for (const next of lines.slice(i + 1)) {
        if (!next.startsWith(`${indent} `)) break
        const url = URL_LINE.exec(next)?.[1]
        if (url) {
          control.href = url.trim().replace(/^["']|["']$/g, '')
          break
        }
      }
    }
    out.push(control)
  }
  return out
}

/** Controls whose name says they destroy data or end the session are never offered. */
export const DESTRUCTIVE_NAME =
  /\b(delete|remove|sign out|log out|logout|revoke|archive|reset|purge|disconnect|deactivate|unsubscribe)\b/i

export interface Vetoed {
  kind: string
  name: string
  by: 'name' | 'origin' | 'jev' | 'worn' | 'looped'
  p?: number
}

/** Drop controls by name and links that leave the target's origin. */
export function vetoByCode(
  controls: readonly PageControl[],
  baseUrl: string,
): { kept: PageControl[]; vetoed: Vetoed[] } {
  const origin = new URL(baseUrl).origin
  const kept: PageControl[] = []
  const vetoed: Vetoed[] = []
  for (const c of controls) {
    if (DESTRUCTIVE_NAME.test(c.name)) {
      vetoed.push({ kind: c.kind, name: short(c.name), by: 'name' })
    } else if (c.href !== undefined && !offsite(c.href, baseUrl)) {
      kept.push(c)
    } else if (c.href !== undefined) {
      vetoed.push({ kind: c.kind, name: short(c.name), by: 'origin' })
    } else {
      kept.push(c)
    }
  }
  return { kept, vetoed }
  function offsite(href: string, base: string): boolean {
    try {
      return new URL(href, base).origin !== origin
    } catch {
      return true
    }
  }
}

/** A name as Jev and the run see it: redacted and at most 80 characters. */
export function short(name: string): string {
  const r = redact(name)
  return r.length > NAME_CHARS ? `${r.slice(0, NAME_CHARS)}…` : r
}
