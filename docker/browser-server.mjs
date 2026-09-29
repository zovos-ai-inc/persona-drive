// A headed Chromium on the container's virtual display, offered as a Playwright browser
// server: `PERSONA_DRIVE_BROWSER_WS=ws://browser:3000/` makes runs use it, and noVNC on
// :6080 shows the window. Fixed launch options: nothing a client sends changes them.
import { chromium } from '@playwright/test'

const server = await chromium.launchServer({
  channel: 'chromium',
  headless: false,
  host: '0.0.0.0',
  port: 3100,
  wsPath: '/',
  args: ['--window-position=0,0', '--window-size=1280,860'],
})
console.log(`browser server on ${server.wsEndpoint()}`)
process.on('SIGTERM', () => void server.close().then(() => process.exit(0)))
