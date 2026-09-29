import type { Locator, Page } from '@playwright/test'

import type { OfferedControl } from './controls.ts'

/** After typing into a search field, how long to wait for the search it starts before pressing Enter. */
const SEARCH_MS = 2_000
const DIALOGS = 'dialog[open], [role="dialog"], [role="alertdialog"]'

/** The text a persona types into a free text box when the goal names nothing to type. */
export function baselineFor(type: string, marker: string): string {
  if (type === 'number') return '1'
  if (type === 'date')
    return new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
  if (type === 'email') return `${marker.toLowerCase()}@example.com`
  return `${marker} baseline`
}

export function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Perform a page control; returns the value typed or selected, if any. */
export async function actOn(
  page: Page,
  control: OfferedControl,
  marker: string,
  rand: () => number,
): Promise<string | undefined> {
  const dialogs = page.locator(DIALOGS).filter({ visible: true })
  const scope: Page | Locator = (await dialogs.count()) ? dialogs.last() : page
  // A link is found by its href: its accessible name can gain a live count or
  // badge after the snapshot was taken, so the name may no longer match.
  const loc = (
    control.kind === 'link' && control.href
      ? scope.locator(`a[href="${control.href.replace(/"/g, '\\"')}"]`)
      : scope.getByRole(control.kind as 'button', { name: control.target, exact: true })
  )
    .filter({ visible: true })
    .first()
  if (control.action === 'select' && control.input !== undefined) {
    await loc.selectOption({ label: control.input })
    return control.input
  }
  if (control.action === 'type' && control.input !== undefined) {
    // A search field searches as the text is typed; Enter opens its first hit.
    // Enter in any other field could submit its form.
    const search = await loc.evaluate(
      (el) =>
        (el instanceof HTMLInputElement && el.type === 'search') ||
        ['combobox', 'searchbox'].includes(el.getAttribute('role') ?? '') ||
        /search/i.test(
          `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('placeholder') ?? ''}`,
        ),
    )
    const searched = search
      ? page
          .waitForResponse((r) => ['fetch', 'xhr'].includes(r.request().resourceType()), {
            timeout: SEARCH_MS,
          })
          .catch(() => undefined)
      : undefined
    await loc.fill(control.input)
    if (searched) {
      await searched
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      )
      await loc.press('Enter')
    }
    return control.input
  }
  switch (control.kind) {
    case 'checkbox':
    case 'switch':
      await loc.setChecked(!(await loc.isChecked()))
      return undefined
    case 'radio':
      await loc.check()
      return undefined
    case 'textbox':
    case 'searchbox': {
      const type = await loc.evaluate((el) =>
        el instanceof HTMLInputElement ? el.type : 'text',
      )
      const value = baselineFor(type, marker)
      await loc.fill(value)
      return value
    }
    case 'combobox': {
      const options = await loc.evaluate((el) =>
        el instanceof HTMLSelectElement
          ? [...el.options].filter((o) => !o.disabled && !o.selected).map((o) => o.label)
          : null,
      )
      if (options === null || options.length === 0) {
        await loc.click()
        return undefined
      }
      const label = options[Math.floor(rand() * options.length)] ?? ''
      await loc.selectOption({ label })
      return label
    }
    default:
      await loc.click()
      return undefined
  }
}
