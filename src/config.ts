import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

function env(name: string, fallback: string): string {
  const value = process.env[name]?.trim()
  return value ? value : fallback
}

export const config = {
  /** Where runs are written; each run gets its own timestamped directory. */
  outRoot: resolve(env('PERSONA_DRIVE_OUT', 'runs')),
  /** A Playwright browser server (`ws://…`) to connect to; empty launches Chromium locally. */
  browserWs: env('PERSONA_DRIVE_BROWSER_WS', ''),
}

/** Read lazily so browser-only commands run without a key. */
export function typesafeApiKey(): string {
  const key = process.env.TYPESAFE_API_KEY?.trim()
  if (!key) throw new Error('TYPESAFE_API_KEY is not set')
  return key
}

/** Create `<outRoot>/<timestamp>-<label>/` and return its path. */
export function newRunDir(label: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = join(config.outRoot, `${stamp}-${label}`)
  mkdirSync(dir, { recursive: true })
  return dir
}
