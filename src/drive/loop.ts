import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Browser, BrowserContext, Page } from '@playwright/test'

import { ariaFollow, ariaHead, ariaStart } from '../capture/aria.ts'
import { launchBrowser } from '../capture/browser.ts'
import {
  parseControls,
  short,
  vetoByCode,
  type PageControl,
  type Vetoed,
} from '../capture/controls.ts'
import { collectLayout, layoutFacts } from '../capture/layout.ts'
import { redact } from '../capture/redact.ts'
import {
  attachCollectors,
  captureScreen,
  type Collector,
  type ScreenState,
} from '../capture/snapshot.ts'
import { config } from '../config.ts'
import { BudgetExceededError, JevClient } from '../jev.ts'
import type { Goal, Persona } from '../persona.ts'
import {
  driveControlText,
  driveQuestions,
  driveState,
  NO_LAYOUT_FACTS,
  partsToAsk,
  type DriveState,
} from '../rubric.ts'
import { signIn, type Target } from '../target.ts'
import { THRESHOLDS } from '../thresholds.ts'
import { signalsOf, type Answer, type GoalResult, type Step } from '../types.ts'
import { actOn, prng } from './act.ts'
import { bandGoal } from './band.ts'
import {
  driveControls,
  expandControls,
  goalTokens,
  pickOption,
  type OfferedControl,
} from './controls.ts'
import { outcomeOf } from './outcome.ts'
import { renderReport, type RunMeta } from './report.ts'

const RECENT = 8
const STUCK_TWICE = 2
const ACTION_TIMEOUT_MS = 10_000
const SETTLE_MS = 3_000
const WAIT_MS = 2_000
/** An option taken this many times from one route in a goal is left out. */
const MAX_USES = 3
/** A page control that has led this many times to a route already visited in the goal is left out. */
const MAX_REVISITS = 3
const MAX_VISITED = 20
/** `scroll_down` moves the `ariaHead` window this many lines (of 60, so some stay in view). */
const SCROLL_LINES = 50
const DIALOGS = 'dialog[open], [role="dialog"], [role="alertdialog"]'
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
/** Outcomes that count toward an option being worn: nothing happened. */
const NO_PROGRESS =
  /^(no visible change|waited|scrolled down: already at the bottom|could not act|refused:|chose )/

export interface RunOptions {
  target: Target
  persona: Persona
  /** Only the goals with these ids. */
  only?: readonly string[]
  steps: number
  budgetUsd?: number
  seed: number
  /** Run `writes: true` goals too (they change data on the target). */
  allowWrites: boolean
  headed: boolean
  video: boolean
  screenshots: boolean
}

/** One captured screen with what the driver needs beside `ScreenState`. */
export interface Observed {
  state: ScreenState
  layout: string[]
  /** Page controls after the code veto (the open dialog's only, when one is open). */
  controls: PageControl[]
  /** Each native select's enabled options other than the selected one, by accessible name. */
  selects: Record<string, string[]>
  vetoed: Vetoed[]
}

/** Settle and capture the screen, its layout facts and its controls. */
export async function observe(
  page: Page,
  collector: Collector,
  target: Target,
  scrolled = false,
): Promise<Observed> {
  const state = await captureScreen(page, collector, target)
  const layout = layoutFacts(await collectLayout(page)).filter(
    (l) => !(scrolled && l.startsWith('focus off-screen')),
  )
  // Controls are found again by their own names, so they are parsed unredacted;
  // Jev and the run see `short()` names only.
  const dialogs = page.locator(DIALOGS).filter({ visible: true })
  const scope = (await dialogs.count()) ? dialogs.last() : page.locator('body')
  const aria = await scope.ariaSnapshot()
  const { kept, vetoed } = vetoByCode(parseControls(aria), target.baseUrl)
  const selects: Record<string, string[]> = {}
  for (const c of kept.filter((x) => x.kind === 'combobox')) {
    const options = await scope
      .getByRole('combobox', { name: c.name, exact: true })
      .filter({ visible: true })
      .first()
      .evaluate((el) =>
        el instanceof HTMLSelectElement
          ? [...el.options].filter((o) => !o.disabled && !o.selected).map((o) => o.label)
          : null,
      )
      .catch(() => null)
    if (options) selects[c.name] = options
  }
  return { state, layout, controls: kept, selects, vetoed }
}

/** The Jev state for one step. */
export function stepState(
  o: Pick<Observed, 'state' | 'layout'>,
  ctx: {
    persona: DriveState['persona']
    goal: Goal
    writes: DriveState['writes']
    controls: OfferedControl[]
    recent: DriveState['recent']
    visited: DriveState['visited']
    parts?: DriveState['parts']
    /** The `ariaHead` offset `scroll_down` has reached (of the dialog when one is open). */
    offset?: number
  },
): DriveState {
  const offset = ctx.offset ?? 0
  return {
    persona: ctx.persona,
    goal: ctx.goal.text,
    writes: ctx.writes,
    screen: {
      route: o.state.route,
      title: o.state.h1 ?? o.state.title,
      ariaHead: ariaHead(o.state.aria, o.state.dialog ? 0 : offset),
      ...(o.state.dialog ? { dialog: ariaHead(o.state.dialog, offset) } : {}),
      alerts: o.state.alerts,
      failureText: o.state.failureText,
    },
    layout: o.layout.length ? o.layout.map(redact) : [NO_LAYOUT_FACTS],
    controls: ctx.controls.map(
      ({ target: _target, input: _input, href: _href, ...c }) => c,
    ),
    ...(ctx.parts ? { parts: ctx.parts } : {}),
    recent: ctx.recent,
    visited: ctx.visited,
  }
}

/**
 * The options left out this step: any taken 3 times on this route without
 * progress since the last step here that made some (so a loop cannot fill the
 * step budget, while a submit that failed on an empty form is offered again
 * once the form has been filled), and any page control that has led back to
 * an already visited route 3 times (so a cycle between screens ends).
 */
export function wornAndLooped(
  steps: readonly Pick<Step, 'route' | 'control' | 'outcome'>[],
  route: string,
  revisits: ReadonlyMap<string, number>,
  controls: readonly OfferedControl[],
): { worn: string[]; looped: string[] } {
  const uses = new Map<string, number>()
  for (const t of steps.filter((t) => t.route === route)) {
    if (!NO_PROGRESS.test(t.outcome)) {
      uses.clear()
      continue
    }
    const k = t.control.kind === 'option' ? t.control.name : driveControlText(t.control)
    uses.set(k, (uses.get(k) ?? 0) + 1)
  }
  const worn = [...uses]
    .filter(([k, n]) => n >= MAX_USES && k !== 'stuck')
    .map(([k]) => k)
  const looped = [...revisits]
    .filter(([, n]) => n >= MAX_REVISITS)
    .map(([k]) => k)
    .filter((k) => controls.some((x) => driveControlText(x) === k))
  return { worn, looped }
}

interface Run {
  opts: RunOptions
  runDir: string
  runId: string
  jev: JevClient
  /** Destructive verdicts by `kind\0name`, shared by every goal of the run. */
  destructive: Map<string, number>
}

async function contextFor(
  browser: Browser,
  r: Run,
  videoDir: string,
): Promise<BrowserContext> {
  const { target } = r.opts
  const context = await browser.newContext({
    baseURL: target.baseUrl,
    viewport: target.viewport,
    ...(target.storageState ? { storageState: target.storageState } : {}),
    ...(r.opts.video ? { recordVideo: { dir: videoDir, size: target.viewport } } : {}),
  })
  await signIn(target, context)
  return context
}

/** Pursue one goal in a fresh context; returns its result and whether the budget ended it. */
async function runGoal(
  browser: Browser,
  r: Run,
  goal: Goal,
): Promise<{ record: GoalResult; budget: boolean }> {
  const { opts, runDir } = r
  const { target, persona } = opts
  const dir = join(runDir, goal.id)
  mkdirSync(dir, { recursive: true })
  const videoDir = join(runDir, '.video', goal.id)
  const context = await contextFor(browser, r, videoDir)
  context.setDefaultTimeout(ACTION_TIMEOUT_MS)
  const started = Date.now()
  const cost0 = r.jev.stats()
  const writes: DriveState['writes'] = goal.writes ? 'allowed' : 'read-only'
  const origin = new URL(target.baseUrl).origin
  let blocked: string[] = []
  await context.route('**/*', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    // The persona never leaves the site: off-origin navigations are refused.
    if (req.isNavigationRequest() && url.origin !== origin) {
      await route.abort('blockedbyclient')
      return
    }
    // A read-only goal changes nothing: any state-changing call to the site is refused.
    if (
      writes === 'read-only' &&
      url.origin === origin &&
      !READ_METHODS.has(req.method())
    ) {
      blocked.push(`${req.method()} ${url.pathname}`)
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })
  await context.tracing.start({ screenshots: true, snapshots: true })
  const page = await context.newPage()
  const collector = attachCollectors(page)
  const jsDialogs: string[] = []
  page.on('dialog', (d) => {
    jsDialogs.push(`${d.type()}: ${d.message().slice(0, 200)}`)
    // Dismiss: accepting a confirm() could run the action it guards.
    void d.dismiss().catch(() => undefined)
  })
  const who = { name: persona.name, role: persona.role, cares: persona.cares }
  const rand = prng(opts.seed)
  const marker = `persona-drive-${r.runId}`
  const steps: Step[] = []
  const recent: DriveState['recent'] = []
  const jevErrors: string[] = []
  let ended: GoalResult['ended'] = 'steps'
  let budget = false
  let stuck = 0
  let typed = false
  let saved = false
  let scrolled = false
  let offset = 0
  const tokens = goalTokens(goal.text)
  const partsMet = new Map<string, number>()
  const visited = new Map<string, Omit<DriveState['visited'][number], 'route'>>()
  const revisits = new Map<string, number>()
  const arrive = (route: string) => {
    const v = visited.get(route)
    visited.delete(route)
    visited.set(route, { ...v, arrivals: (v?.arrivals ?? 0) + 1 })
  }
  const cacheKey = (x: OfferedControl) =>
    `${x.kind}\0${x.action ? driveControlText(x) : x.name}`

  await page.goto(goal.start ?? '/').catch(() => undefined)
  let current = await observe(page, collector, target)
  arrive(current.state.route)
  for (let step = 1; step <= opts.steps; step++) {
    const unmet = goal.parts?.filter((x) => !partsMet.has(x))
    const controls = driveControls(
      expandControls(current.controls, current.selects, tokens),
      [goal.text, ...(unmet ?? [])].join(' '),
    )
    const cached = new Map<string, number>()
    for (const x of controls) {
      const p = r.destructive.get(cacheKey(x))
      if (p !== undefined) cached.set(x.id, p)
    }
    const ask = new Set(controls.filter((x) => !cached.has(x.id)).map((x) => x.id))
    const parts = goal.parts && unmet ? partsToAsk(goal.parts, unmet) : undefined
    const state = stepState(current, {
      persona: who,
      goal,
      writes,
      controls,
      recent: recent.slice(-RECENT),
      visited: [...visited].slice(-MAX_VISITED).map(([route, v]) => ({ route, ...v })),
      ...(unmet ? { parts: { met: [...partsMet.keys()], unmet } } : {}),
      offset,
    })
    const tag = `step-${String(step).padStart(3, '0')}`
    writeFileSync(join(dir, `${tag}.json`), JSON.stringify(state, null, 2) + '\n')
    const files: Step['files'] = { state: join(goal.id, `${tag}.json`) }
    if (opts.screenshots) {
      await page
        .screenshot({ path: join(dir, `${tag}.jpg`), type: 'jpeg', quality: 60 })
        .then(() => (files.screenshot = join(goal.id, `${tag}.jpg`)))
        .catch(() => undefined)
    }
    let answers: Record<string, Answer>
    try {
      const result = await r.jev.judge(
        driveState(state, ask),
        driveQuestions(controls, ask, {
          scrolled: offset > 0,
          dialog: current.state.dialog !== undefined,
          parts,
        }),
        { label: `${goal.id} step ${String(step)}` },
      )
      answers = result.answers
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        ended = 'budget'
        budget = true
      } else {
        ended = 'error'
        jevErrors.push(`step ${String(step)}: ${String(err).split('\n')[0] ?? ''}`)
      }
      break
    }
    const vetoed: Vetoed[] = [...current.vetoed]
    const jevVetoed = new Set<string>()
    for (const x of controls) {
      const a = answers[`destructive_${x.id}`]
      if (ask.has(x.id) && a?.type === 'noul') r.destructive.set(cacheKey(x), a.noul)
      const p = cached.get(x.id) ?? (a?.type === 'noul' ? a.noul : undefined)
      if (p !== undefined && p >= THRESHOLDS.noul.destructive.yes) {
        jevVetoed.add(x.id)
        vetoed.push({
          kind: x.kind,
          name: short(x.action ? driveControlText(x) : x.name),
          by: 'jev',
          p,
        })
      }
    }
    const { worn, looped } = wornAndLooped(steps, current.state.route, revisits, controls)
    for (const x of controls) {
      const k = driveControlText(x)
      if (worn.includes(k)) {
        jevVetoed.add(x.id)
        vetoed.push({ kind: x.kind, name: x.name, by: 'worn' })
      } else if (looped.includes(k)) {
        jevVetoed.add(x.id)
        vetoed.push({ kind: x.kind, name: x.name, by: 'looped' })
      }
    }
    for (const k of worn) jevVetoed.add(k)
    const notes: string[] = []
    const next = answers.next
    const probabilities = next?.type === 'choice' ? next.probabilities : {}
    let pick = pickOption(probabilities, jevVetoed)
    // Jev's Choice can keep going after its own goalMet says the goal is met;
    // once a writes goal has saved, that Noul ends it.
    const met = answers.goalMet
    if (
      saved &&
      met?.type === 'noul' &&
      met.noul >= THRESHOLDS.noul.goalMet.yes &&
      pick.id !== 'done'
    ) {
      pick = { id: 'done', p: probabilities.done ?? 0 }
      notes.push(`ended by code: goalMet ${met.noul.toFixed(2)} after a save`)
    }
    for (const [id, text] of Object.entries(parts ?? {})) {
      const a = answers[id]
      if (a?.type === 'noul' && a.noul >= THRESHOLDS.noul.partMet.yes)
        partsMet.set(text, step)
    }
    if (goal.parts && partsMet.size === goal.parts.length) {
      pick = { id: 'done', p: probabilities.done ?? 0 }
      notes.push('ended by code: every part met')
    }
    const chosen = controls.find((x) => x.id === pick.id)
    const control: Step['control'] = chosen
      ? {
          id: chosen.id,
          kind: chosen.kind,
          name: chosen.name,
          region: chosen.region,
          ...(chosen.action ? { action: chosen.action } : {}),
        }
      : { id: pick.id, kind: 'option', name: pick.id }
    const kept = Object.fromEntries(
      Object.entries(answers).filter(
        ([id]) => id !== 'next' && !id.startsWith('destructive_'),
      ),
    )
    blocked = []
    jsDialogs.length = 0
    let actError: string | undefined
    if (pick.id !== 'done' && pick.id !== 'stuck') {
      try {
        if (chosen) {
          const value = await actOn(page, chosen, marker, rand)
          if (value !== undefined) control.value = chosen.value ?? short(value)
          if (value?.startsWith(marker)) typed = true
        } else if (pick.id === 'wait') {
          await page.waitForTimeout(WAIT_MS)
        } else if (pick.id === 'scroll_down') {
          await page.mouse.wheel(0, 600)
        } else if (pick.id === 'scroll_up') {
          await page.mouse.wheel(0, -100_000)
        } else if (pick.id === 'go_back') {
          await page.goBack()
        } else if (pick.id === 'escape') {
          await page.keyboard.press('Escape')
        }
      } catch (err) {
        actError = String(err).split('\n')[0] ?? ''
      }
      await page
        .waitForLoadState('networkidle', { timeout: SETTLE_MS })
        .catch(() => undefined)
      if (pick.id === 'scroll_down' || pick.id === 'scroll_up') scrolled = true
      else if (pick.id !== 'wait') scrolled = false
    }
    const after =
      pick.id === 'done' || pick.id === 'stuck'
        ? current
        : await observe(page, collector, target, scrolled)
    if (jsDialogs.length)
      notes.push(...jsDialogs.map((d) => `script dialog dismissed: ${d}`))
    // The window follows scrolling on one screen, and a page control activated
    // below it (the browser scrolls to it); a new route or a dialog opening or
    // closing starts it at the top again.
    const was = offset
    if (
      after.state.route !== current.state.route ||
      (after.state.dialog === undefined) !== (current.state.dialog === undefined) ||
      pick.id === 'scroll_up'
    ) {
      offset = 0
    } else if (pick.id === 'scroll_down') {
      offset = ariaStart(after.state.dialog ?? after.state.aria, offset + SCROLL_LINES)
    } else if (chosen && after.state.dialog === undefined) {
      offset = ariaFollow(current.state.aria, after.state.aria, chosen.target, offset)
    }
    const outcome =
      pick.id === 'done' || pick.id === 'stuck'
        ? `chose ${pick.id}`
        : outcomeOf(current.state, after.state, {
            actError,
            blocked,
            option: pick.id,
            atBottom: pick.id === 'scroll_down' && offset <= was,
            ...(typed && (saved || after.state.mutations.some((m) => m.status < 400))
              ? { typed: marker }
              : {}),
          })
    if (after.state.mutations.some((m) => m.status < 400)) saved = true
    const record: Step = {
      step,
      route: current.state.route,
      control,
      outcome,
      nextProb: pick.p,
      answers: kept,
      layout: current.layout,
      signals: signalsOf(after.state),
      vetoed,
      writesBlocked: [...blocked],
      ...(actError ? { actError } : {}),
      notes,
      files,
    }
    steps.push(record)
    appendFileSync(join(dir, 'steps.jsonl'), JSON.stringify(record) + '\n')
    const label = chosen ? driveControlText(chosen) : pick.id
    recent.push({ step, control: label, outcome })
    const here = visited.get(current.state.route)
    if (here) here.last = { control: label, outcome }
    if (after.state.route !== current.state.route) {
      if (chosen && visited.has(after.state.route)) {
        revisits.set(label, (revisits.get(label) ?? 0) + 1)
      }
      arrive(after.state.route)
    }
    process.stderr.write(
      `${goal.id} ${String(step)}/${String(opts.steps)} ${record.route} ${label} (P ${pick.p.toFixed(2)}) -> ${outcome}\n`,
    )
    current = after
    stuck = pick.id === 'stuck' ? stuck + 1 : 0
    if (pick.id === 'done') {
      ended = 'done'
      break
    }
    if (stuck >= STUCK_TWICE) {
      ended = 'stuck'
      break
    }
  }

  const cost1 = r.jev.stats()
  const record: GoalResult = {
    persona: { name: persona.name, role: persona.role },
    goal,
    steps,
    ended,
    jev: {
      calls: cost1.calls - cost0.calls,
      inputTokens: cost1.inputTokens - cost0.inputTokens,
      costUsd: cost1.costUsd - cost0.costUsd,
    },
    ms: Date.now() - started,
    jevErrors,
    band: 'OK',
    reasons: [],
    files: { steps: join(goal.id, 'steps.jsonl') },
  }
  Object.assign(record, bandGoal(record))
  const keepTrace = record.band === 'FAIL' || record.band === 'LIKELY'
  const trace = join(goal.id, 'trace.zip')
  await context.tracing.stop(keepTrace ? { path: join(runDir, trace) } : {})
  if (keepTrace) record.files.trace = trace
  const video = page.video()
  await context.close()
  if (video) {
    const name = join(goal.id, 'video.webm')
    await video.saveAs(join(runDir, name))
    await video.delete().catch(() => undefined)
    record.files.video = name
  }
  appendFileSync(join(runDir, 'results.jsonl'), JSON.stringify(record) + '\n')
  return { record, budget }
}

/** Pursue every goal of the persona on the target; returns the run directory. */
export async function runPersona(opts: RunOptions, runDir: string): Promise<string> {
  const notes: string[] = []
  let goals = opts.persona.goals.filter((g) => !opts.only || opts.only.includes(g.id))
  if (!opts.allowWrites) {
    const writes = goals.filter((g) => g.writes)
    if (writes.length) {
      notes.push(
        `left out writes goals (run with --allow-writes): ${writes.map((g) => g.id).join(', ')}`,
      )
    }
    goals = goals.filter((g) => !g.writes)
  }
  if (!goals.length) throw new Error('no goals to run')

  const started = Date.now()
  const jev = new JevClient({ runDir, budgetUsd: opts.budgetUsd })
  const r: Run = {
    opts,
    runDir,
    runId: started.toString(36),
    jev,
    destructive: new Map(),
  }
  notes.unshift(
    `steps ${String(opts.steps)} per goal; seed ${String(opts.seed)}; browser ${config.browserWs || (opts.headed ? 'local headed' : 'local headless')}`,
  )
  const records: GoalResult[] = []
  const browser = await launchBrowser(opts.headed)
  try {
    for (const goal of goals) {
      const { record, budget } = await runGoal(browser, r, goal)
      records.push(record)
      if (budget) {
        notes.push('budget exceeded: remaining goals skipped')
        break
      }
    }
  } finally {
    await browser.close()
    rmSync(join(runDir, '.video'), { recursive: true, force: true })
  }
  const meta: RunMeta = {
    target: opts.target.name,
    baseUrl: opts.target.baseUrl,
    persona: `${opts.persona.name} (${opts.persona.role})`,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    jev: jev.stats(),
    notes,
  }
  writeFileSync(join(runDir, 'run.json'), JSON.stringify(meta, null, 2) + '\n')
  writeFileSync(join(runDir, 'report.md'), renderReport(meta, records))
  return runDir
}
