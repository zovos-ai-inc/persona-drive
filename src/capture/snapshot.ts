import type { Page, Response } from '@playwright/test'

import { redactDeep } from './redact.ts'

export interface ApiErrorRecord {
  method: string
  url: string
  status: number
  body: string
}

/** One settled screen as text: what Jev and the run see. */
export interface ScreenState {
  url: string
  /** Path and query of `url`. */
  route: string
  title: string
  h1: string | null
  /** Aria snapshot of the target's `main` region, or of `body` when it has none. */
  aria: string
  /** Aria snapshot of the topmost open dialog, when one is open. */
  dialog?: string
  alerts: string[]
  /** The first of the target's `failureTexts` shown on the screen. */
  failureText: string | null
  /** The target's `loading` indicator was still shown after the settle timeout. */
  loadingLeft: boolean
  consoleErrors: string[]
  pageErrors: string[]
  failedRequests: string[]
  /** fetch / XHR responses of status 400 and up. */
  apiErrors: ApiErrorRecord[]
  /** fetch / XHR POST / PATCH / PUT / DELETE responses of any status. */
  mutations: ApiErrorRecord[]
}

export interface Collector {
  /** Return everything seen since the last drain and start over. */
  drain(): Pick<
    ScreenState,
    'consoleErrors' | 'pageErrors' | 'failedRequests' | 'apiErrors' | 'mutations'
  > & { pending: Promise<unknown>[] }
}

const API_TYPES = new Set(['fetch', 'xhr'])
const MUTATIONS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

/**
 * Attach console / page-error / network listeners. Call BEFORE navigating: a
 * screen's first API reads fire during the navigation itself.
 */
export function attachCollectors(
  page: Page,
  isApi: (res: Response) => boolean = (res) =>
    API_TYPES.has(res.request().resourceType()),
): Collector {
  let seen = empty()
  page.on('console', (msg) => {
    if (msg.type() === 'error') seen.consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => {
    seen.pageErrors.push(err.stack ?? String(err))
  })
  page.on('requestfailed', (req) => {
    seen.failedRequests.push(
      `${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'failed'}`,
    )
  })
  page.on('response', (res) => {
    if (!isApi(res)) return
    const method = res.request().method()
    const mutation = MUTATIONS.has(method)
    if (res.status() < 400 && !mutation) return
    const target = seen
    target.pending.push(
      res
        .text()
        .catch(() => '<body unavailable>')
        .then((body) => {
          const record = {
            method,
            url: res.url(),
            status: res.status(),
            body: body.slice(0, 300),
          }
          if (res.status() >= 400) target.apiErrors.push(record)
          if (mutation) target.mutations.push(record)
        }),
    )
  })
  return {
    drain() {
      const out = seen
      seen = empty()
      return out
    },
  }
}

function empty(): ReturnType<Collector['drain']> {
  return {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    apiErrors: [],
    mutations: [],
    pending: [],
  }
}

const SETTLE_TIMEOUT_MS = 15_000
const NETWORK_IDLE_MS = 3_000
const DIALOGS = 'dialog[open], [role="dialog"], [role="alertdialog"]'

export interface SettleOptions {
  /** Selector of the screen's content region (default `main`). */
  main: string
  /** Selector of a loading indicator to wait until detached (optional). */
  loading?: string
  /** Texts that mean the screen failed to render, e.g. "Something went wrong". */
  failureTexts: readonly string[]
}

/**
 * Settle the current screen (`main` visible, the loading indicator gone,
 * network idle) and capture its state. Waits that time out are recorded
 * (`loadingLeft`, the `body` aria fallback), not thrown.
 */
export async function captureScreen(
  page: Page,
  collector: Collector,
  settle: SettleOptions,
): Promise<ScreenState> {
  const main = page.locator(settle.main).first()
  const hasMain = await main
    .waitFor({ state: 'visible', timeout: SETTLE_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false)
  const loadingLeft = settle.loading
    ? await page
        .locator(settle.loading)
        .first()
        .waitFor({ state: 'detached', timeout: SETTLE_TIMEOUT_MS })
        .then(() => false)
        .catch(() => true)
    : false
  await page
    .waitForLoadState('networkidle', { timeout: NETWORK_IDLE_MS })
    .catch(() => undefined)

  const aria = await (hasMain ? main : page.locator('body')).ariaSnapshot()
  const dialogs = page.locator(DIALOGS).filter({ visible: true })
  const dialog = (await dialogs.count()) ? await dialogs.last().ariaSnapshot() : undefined
  // innerText of a hidden element falls back to its textContent, so only visible alerts count.
  const alerts = await page
    .locator('[role="alert"]')
    .filter({ visible: true })
    .allInnerTexts()
  const text = `${aria}\n${dialog ?? ''}`
  const failureText = settle.failureTexts.find((t) => text.includes(t)) ?? null
  const h1s = await page.locator('h1').allInnerTexts()
  const { pending, ...signals } = collector.drain()
  await Promise.all(pending)

  const url = new URL(page.url())
  return redactDeep({
    url: page.url(),
    route: url.pathname + url.search,
    title: await page.title(),
    h1: h1s[0]?.trim() ?? null,
    aria,
    ...(dialog === undefined ? {} : { dialog }),
    alerts: alerts.map((t) => t.trim()).filter(Boolean),
    failureText,
    loadingLeft,
    ...signals,
  })
}
