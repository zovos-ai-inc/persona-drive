# Targets

A target file names the site under test and how to settle and sign in to it.

```yaml
name: my-app # used in run directory names and the report
baseUrl: https://app.example.com
main: main # selector of the screen's content region (default: main)
loading: '[aria-busy="true"]' # optional: wait until this is gone before judging a screen
failureTexts: # optional: texts that mean the screen failed to render
  - Something went wrong
storageState: ./auth/state.json # optional: Playwright storage state to start signed in
signIn: ./sign-in.ts # optional: module whose default export signs a context in
viewport: { width: 1280, height: 800 }
```

`signIn` is how an app with its own session scheme plugs in. The module gets a fresh
`BrowserContext` and must leave it signed in, for example by minting a dev session
through `context.request` so the cookie lands in the page's own jar:

```ts
import type { BrowserContext } from '@playwright/test'

export default async function signIn(context: BrowserContext): Promise<void> {
  const res = await context.request.post('/api/auth/dev-token', {
    data: { sub: 'analyst@example.com', role: 'analyst' },
  })
  if (res.status() !== 200) throw new Error(`dev-token returned ${String(res.status())}`)
}
```

Relative paths in `storageState` and `signIn` resolve beside the target file.
