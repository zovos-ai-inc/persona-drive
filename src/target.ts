import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { BrowserContext } from '@playwright/test'
import { parse } from 'yaml'

/** A target file: the site under test and how to settle and sign in to it. */
export interface Target {
  name: string
  baseUrl: string
  /** Selector of the screen's content region (default `main`). */
  main: string
  /** Selector of a loading indicator to wait until detached. */
  loading?: string
  /** Texts that mean the screen failed to render. */
  failureTexts: string[]
  /** A Playwright storage state file (cookies, local storage) to start signed in. */
  storageState?: string
  /** A module whose default export signs a fresh context in: `async (context) => void`. */
  signIn?: string
  viewport: { width: number; height: number }
}

export function parseTarget(text: string, source: string): Target {
  const doc = parse(text) as Partial<Target> | null
  const fail = (why: string) => new Error(`${source}: ${why}`)
  if (!doc || typeof doc.name !== 'string' || !doc.name.trim()) throw fail('needs a name')
  if (typeof doc.baseUrl !== 'string' || !/^https?:\/\//.test(doc.baseUrl)) {
    throw fail('needs an http(s) baseUrl')
  }
  const dir = dirname(resolve(source))
  const str = (v: unknown, key: string): string | undefined => {
    if (v === undefined) return undefined
    if (typeof v !== 'string' || !v.trim()) throw fail(`${key} must be a string`)
    return v
  }
  const failureTexts = doc.failureTexts ?? []
  if (!Array.isArray(failureTexts) || failureTexts.some((t) => typeof t !== 'string')) {
    throw fail('failureTexts must be a list of strings')
  }
  const viewport = doc.viewport ?? { width: 1280, height: 800 }
  if (typeof viewport.width !== 'number' || typeof viewport.height !== 'number') {
    throw fail('viewport needs width and height')
  }
  const storageState = str(doc.storageState, 'storageState')
  const signIn = str(doc.signIn, 'signIn')
  return {
    name: doc.name.trim(),
    baseUrl: doc.baseUrl.replace(/\/$/, ''),
    main: str(doc.main, 'main') ?? 'main',
    ...(doc.loading === undefined ? {} : { loading: str(doc.loading, 'loading') }),
    failureTexts,
    ...(storageState === undefined ? {} : { storageState: resolve(dir, storageState) }),
    ...(signIn === undefined ? {} : { signIn: resolve(dir, signIn) }),
    viewport,
  }
}

export function loadTarget(file: string, baseUrl?: string): Target {
  const target = parseTarget(readFileSync(file, 'utf8'), file)
  return baseUrl ? { ...target, baseUrl: baseUrl.replace(/\/$/, '') } : target
}

/** Run the target's `signIn` module on a fresh context, when it has one. */
export async function signIn(target: Target, context: BrowserContext): Promise<void> {
  if (!target.signIn) return
  const mod = (await import(pathToFileURL(target.signIn).href)) as {
    default?: (context: BrowserContext) => Promise<void>
  }
  if (typeof mod.default !== 'function') {
    throw new Error(`${target.signIn}: default export must be an async (context) => void`)
  }
  await mod.default(context)
}
