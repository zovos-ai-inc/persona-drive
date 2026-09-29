import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseControls, vetoByCode } from './controls.ts'

const ARIA = `- banner:
  - link "Home" [ref=e1] [cursor=pointer]:
    - /url: /
- navigation "Primary":
  - link "Pricing":
    - /url: /pricing
  - link "Docs" [disabled]:
    - /url: /docs
  - link "Community":
    - /url: https://discord.example/lumen
- main:
  - heading "Welcome" [level=1]
  - button "Request a demo"
  - button "Request a demo"
  - 'button "Sort: name"'
  - textbox "Search"
  - button "Delete account"
- dialog "Sign in":
  - textbox "Email"`

test('parseControls gives each enabled control its nearest landmark, once, and links their href', () => {
  assert.deepEqual(
    parseControls(ARIA).map(
      (c) => `${c.region} ${c.kind} ${c.name}${c.href ? ` -> ${c.href}` : ''}`,
    ),
    [
      'banner link Home -> /',
      'navigation link Pricing -> /pricing',
      'navigation link Community -> https://discord.example/lumen',
      'main button Request a demo',
      'main button Sort: name',
      'main textbox Search',
      'main button Delete account',
      'dialog textbox Email',
    ],
  )
})

test('vetoByCode drops destructive names and links that leave the origin', () => {
  const { kept, vetoed } = vetoByCode(parseControls(ARIA), 'https://lumen.example')
  assert.deepEqual(
    vetoed.map((v) => `${v.by} ${v.name}`),
    ['origin Community', 'name Delete account'],
  )
  assert.equal(kept.length, 6)
})
