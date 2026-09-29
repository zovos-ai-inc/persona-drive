import { chromium, type Browser } from '@playwright/test'

import { config } from '../config.ts'

/**
 * The browser a run drives. `channel: 'chromium'` is Playwright's full Chromium
 * build (new headless, real Chrome behaviour), not the headless shell. With
 * `PERSONA_DRIVE_BROWSER_WS` set it is the browser a Playwright server offers
 * instead, which can be a headed one on a display you can watch.
 */
export async function launchBrowser(headed: boolean): Promise<Browser> {
  if (config.browserWs) return chromium.connect(config.browserWs)
  return chromium.launch({ channel: 'chromium', headless: !headed })
}
