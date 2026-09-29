import { createHash } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { ariaStart, cleanAria } from '../capture/aria.ts'
import { parseControls, short, vetoByCode, type Vetoed } from '../capture/controls.ts'
import { redact } from '../capture/redact.ts'
import type { ScreenState } from '../capture/snapshot.ts'
import { BudgetExceededError, JevClient } from '../jev.ts'
import type { Goal, Persona } from '../persona.ts'
import {
  driveControlText,
  driveQuestions,
  driveState,
  partsToAsk,
  type DriveState,
} from '../rubric.ts'
import { THRESHOLDS } from '../thresholds.ts'
import type { Answer, Step } from '../types.ts'
import { driveControls, expandControls, goalTokens, pickOption } from './controls.ts'
import { dialogName, outcomeOf } from './outcome.ts'
import { stepState, wornAndLooped } from './loop.ts'

const RECENT = 8
const MAX_VISITED = 20
const SCROLL_LINES = 50

/**
 * What one `ask` session remembers between calls: the executor (a person, or
 * Claude Code with its browser tools) holds the browser; this holds the
 * persona's memory of the goal so far.
 */
interface Session {
  steps: Pick<Step, 'step' | 'route' | 'control' | 'outcome'>[]
  recent: DriveState['recent']
  visited: DriveState['visited']
  revisits: Record<string, number>
  partsMet: Record<string, number>
  destructive: Record<string, number>
  offset: number
  /** The screen the last answer was given on, to describe what the executor's action did. */
  last?: {
    route: string
    dialog?: string
    alerts: string[]
    ariaHash: string
    option: string
  }
  ended?: 'done' | 'stuck'
  stuck: number
}

export interface AskInput {
  session: string
  persona: Persona
  goal: Goal
  url: string
  /** The page's aria snapshot (a Playwright MCP `browser_snapshot` works as is). */
  aria: string
  alerts?: string[]
  /** What the executor saw the last action do, when code cannot tell from the snapshot. */
  outcome?: string
  budgetUsd?: number
  allowWrites: boolean
}

export interface AskOutput {
  step: number
  route: string
  /** The option Jev chose, and how to perform it. */
  next: {
    id: string
    text: string
    kind: string
    name: string
    region?: string
    action?: 'select' | 'type'
    value?: string
    p: number
  }
  /** `done` or `stuck`: the session is over. */
  ended?: 'done' | 'stuck'
  goalMet?: number
  parts?: { met: string[]; unmet: string[] }
  confusing?: number
  userVisibleError?: number
  vetoed: Vetoed[]
  notes: string[]
  cost: { calls: number; costUsd: number }
}

function load(dir: string): Session {
  const file = join(dir, 'session.json')
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as Session
  return {
    steps: [],
    recent: [],
    visited: [],
    revisits: {},
    partsMet: {},
    destructive: {},
    offset: 0,
    stuck: 0,
  }
}

/** Fill in the outcome of the last step written to `steps.jsonl`, now that its result is on screen. */
export function patchLastOutcome(file: string, outcome: string): void {
  const lines = readFileSync(file, 'utf8').trimEnd().split('\n')
  const last = lines.at(-1)
  if (!last) return
  const record = JSON.parse(last) as Step
  record.outcome = outcome
  lines[lines.length - 1] = JSON.stringify(record)
  writeFileSync(file, lines.join('\n') + '\n')
}

/** The snapshot split into the page and the topmost open dialog, as `captureScreen` does. */
export function splitDialog(aria: string): { aria: string; dialog?: string } {
  const lines = aria.split('\n')
  let start = -1
  for (const [i, line] of lines.entries()) {
    if (/^\s*- (?:alert)?dialog\b/.test(line)) start = i
  }
  if (start === -1) return { aria }
  const indent = lines[start]?.match(/^\s*/)?.[0].length ?? 0
  let end = start + 1
  while (end < lines.length && (lines[end]?.match(/^\s*/)?.[0].length ?? 0) > indent)
    end++
  return {
    aria: [...lines.slice(0, start), ...lines.slice(end)].join('\n'),
    dialog: lines.slice(start, end).join('\n'),
  }
}

/** How the executor performs the chosen option, in one sentence. */
export function instruction(next: AskOutput['next']): string {
  switch (next.id) {
    case 'done':
      return 'Stop: the persona has what they came for.'
    case 'stuck':
      return 'Stop: the persona cannot see a way to the goal from here.'
    case 'wait':
      return 'Wait a few seconds, then take a new snapshot.'
    case 'scroll_down':
      return 'Scroll down one screen, then take a new snapshot.'
    case 'scroll_up':
      return 'Scroll back to the top, then take a new snapshot.'
    case 'go_back':
      return 'Go back one page in the browser history, then take a new snapshot.'
    case 'escape':
      return 'Press Escape to close the open dialog, then take a new snapshot.'
    default:
      break
  }
  const where = next.region ? ` in the ${next.region} region` : ''
  if (next.action === 'select')
    return `Select "${next.value ?? ''}" in the ${next.kind} "${next.name}"${where}.`
  if (next.action === 'type') {
    return `Type "${next.value ?? ''}" into the ${next.kind} "${next.name}"${where} (press Enter only if it is a search field).`
  }
  if (next.kind === 'textbox' || next.kind === 'searchbox') {
    return `Type something sensible for this persona into the ${next.kind} "${next.name}"${where}.`
  }
  return `Click the ${next.kind} "${next.name}"${where}.`
}

/** One decision: the persona's next option on the snapshot given, remembered in `session`. */
export async function ask(input: AskInput): Promise<AskOutput> {
  mkdirSync(input.session, { recursive: true })
  const s = load(input.session)
  if (s.ended) throw new Error(`session ended: the persona chose ${s.ended}`)
  const { persona, goal } = input
  const writes: DriveState['writes'] =
    goal.writes && input.allowWrites ? 'allowed' : 'read-only'
  const url = new URL(input.url)
  const clean = cleanAria(input.aria)
  const { aria, dialog } = splitDialog(clean)
  const alerts = input.alerts ?? []
  const state: ScreenState = {
    url: input.url,
    route: url.pathname + url.search,
    title: '',
    h1: /^\s*- heading "((?:[^"\\]|\\.)+)" \[level=1\]/m.exec(aria)?.[1] ?? null,
    aria,
    ...(dialog === undefined ? {} : { dialog }),
    alerts,
    failureText: null,
    loadingLeft: false,
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    apiErrors: [],
    mutations: [],
  }
  const ariaHash = createHash('sha256').update(clean).digest('hex')
  const step = s.steps.length + 1
  const notes: string[] = []

  // What the executor's last action did, now that its result is on screen.
  if (s.last) {
    const before: ScreenState = {
      ...state,
      route: s.last.route,
      aria: '',
      ...(s.last.dialog === undefined ? {} : { dialog: s.last.dialog }),
      alerts: s.last.alerts,
    }
    let outcome = outcomeOf(
      before,
      { ...state, aria: '' },
      { blocked: [], option: s.last.option },
    )
    if (outcome === 'no visible change' || outcome === 'the screen changed') {
      outcome =
        input.outcome ??
        (ariaHash === s.last.ariaHash ? 'no visible change' : 'the screen changed')
    }
    const prev = s.steps.at(-1)
    if (prev) {
      prev.outcome = outcome
      const label = s.recent.at(-1)
      if (label) label.outcome = outcome
      const here = s.visited.find((v) => v.route === prev.route)
      if (here) here.last = { control: label?.control ?? prev.control.name, outcome }
      if (state.route !== prev.route) {
        if (
          prev.control.kind !== 'option' &&
          s.visited.some((v) => v.route === state.route)
        ) {
          const k = driveControlText(prev.control)
          s.revisits[k] = (s.revisits[k] ?? 0) + 1
        }
      }
      patchLastOutcome(join(input.session, 'steps.jsonl'), outcome)
    }
    if (
      state.route !== s.last.route ||
      (dialog === undefined) !== (s.last.dialog === undefined) ||
      s.last.option === 'scroll_up'
    ) {
      s.offset = 0
    } else if (s.last.option === 'scroll_down') {
      s.offset = ariaStart(dialog ?? aria, s.offset + SCROLL_LINES)
    }
  }
  const arrived = s.visited.find((v) => v.route === state.route)
  if (!s.last || state.route !== s.last.route) {
    s.visited = s.visited.filter((v) => v.route !== state.route)
    s.visited.push({
      route: state.route,
      arrivals: (arrived?.arrivals ?? 0) + 1,
      ...(arrived?.last ? { last: arrived.last } : {}),
    })
    s.visited = s.visited.slice(-MAX_VISITED)
  }

  const { kept: pageControls, vetoed } = vetoByCode(
    parseControls(dialog ?? aria),
    url.origin,
  )
  const unmet = goal.parts?.filter((x) => !(x in s.partsMet))
  const controls = driveControls(
    expandControls(pageControls, {}, goalTokens(goal.text)),
    [goal.text, ...(unmet ?? [])].join(' '),
  )
  const cacheKey = (x: (typeof controls)[number]) =>
    `${x.kind}\0${x.action ? driveControlText(x) : x.name}`
  const cached = new Map(
    controls.flatMap((x) => {
      const p = s.destructive[cacheKey(x)]
      return p === undefined ? [] : [[x.id, p] as const]
    }),
  )
  const askIds = new Set(controls.filter((x) => !cached.has(x.id)).map((x) => x.id))
  const parts = goal.parts && unmet ? partsToAsk(goal.parts, unmet) : undefined
  const driveS = stepState(
    { state, layout: [] },
    {
      persona: { name: persona.name, role: persona.role, cares: persona.cares },
      goal,
      writes,
      controls,
      recent: s.recent.slice(-RECENT),
      visited: s.visited,
      ...(unmet ? { parts: { met: Object.keys(s.partsMet), unmet } } : {}),
      offset: s.offset,
    },
  )
  driveS.layout = [
    'not measured: the executor holds the browser, so there are no layout facts',
  ]
  const tag = `step-${String(step).padStart(3, '0')}`
  writeFileSync(
    join(input.session, `${tag}.json`),
    JSON.stringify(driveS, null, 2) + '\n',
  )
  const jev = new JevClient({ runDir: input.session, budgetUsd: input.budgetUsd })
  const questions = driveQuestions(controls, askIds, {
    scrolled: s.offset > 0,
    dialog: dialog !== undefined,
    parts,
  })
  delete questions.layoutBug
  let answers: Record<string, Answer>
  try {
    answers = (
      await jev.judge(driveState(driveS, askIds), questions, {
        label: `${goal.id} step ${String(step)}`,
      })
    ).answers
  } catch (err) {
    if (err instanceof BudgetExceededError) throw err
    throw new Error(`Jev call failed: ${String(err).split('\n')[0] ?? ''}`, {
      cause: err,
    })
  }
  const jevVetoed = new Set<string>()
  const allVetoed: Vetoed[] = [...vetoed]
  for (const x of controls) {
    const a = answers[`destructive_${x.id}`]
    if (askIds.has(x.id) && a?.type === 'noul') s.destructive[cacheKey(x)] = a.noul
    const p = cached.get(x.id) ?? (a?.type === 'noul' ? a.noul : undefined)
    if (p !== undefined && p >= THRESHOLDS.noul.destructive.yes) {
      jevVetoed.add(x.id)
      allVetoed.push({
        kind: x.kind,
        name: short(x.action ? driveControlText(x) : x.name),
        by: 'jev',
        p,
      })
    }
  }
  const { worn, looped } = wornAndLooped(
    s.steps,
    state.route,
    new Map(Object.entries(s.revisits)),
    controls,
  )
  for (const x of controls) {
    const k = driveControlText(x)
    if (worn.includes(k)) {
      jevVetoed.add(x.id)
      allVetoed.push({ kind: x.kind, name: x.name, by: 'worn' })
    } else if (looped.includes(k)) {
      jevVetoed.add(x.id)
      allVetoed.push({ kind: x.kind, name: x.name, by: 'looped' })
    }
  }
  for (const k of worn) jevVetoed.add(k)
  const next = answers.next
  const probabilities = next?.type === 'choice' ? next.probabilities : {}
  let pick = pickOption(probabilities, jevVetoed)
  for (const [id, text] of Object.entries(parts ?? {})) {
    const a = answers[id]
    if (a?.type === 'noul' && a.noul >= THRESHOLDS.noul.partMet.yes)
      s.partsMet[text] = step
  }
  if (goal.parts && Object.keys(s.partsMet).length === goal.parts.length) {
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
        ...(chosen.action ? { action: chosen.action, value: chosen.value } : {}),
      }
    : { id: pick.id, kind: 'option', name: pick.id }
  const label = chosen ? driveControlText(chosen) : pick.id
  const outcome =
    pick.id === 'done' || pick.id === 'stuck' ? `chose ${pick.id}` : 'pending'
  const kept = Object.fromEntries(
    Object.entries(answers).filter(
      ([id]) => id !== 'next' && !id.startsWith('destructive_'),
    ),
  )
  const record: Step = {
    step,
    route: state.route,
    control,
    outcome,
    nextProb: pick.p,
    answers: kept,
    layout: [],
    signals: {
      failureText: null,
      loadingLeft: false,
      alertCount: alerts.length,
      pageErrorCount: 0,
      consoleErrorCount: 0,
      failedRequestCount: 0,
      apiErrors: [],
      firstAlert: alerts[0] ?? null,
    },
    vetoed: allVetoed,
    writesBlocked: [],
    notes,
    files: { state: `${tag}.json` },
  }
  appendFileSync(join(input.session, 'steps.jsonl'), JSON.stringify(record) + '\n')
  s.steps.push({ step, route: state.route, control, outcome })
  s.recent.push({ step, control: label, outcome })
  s.recent = s.recent.slice(-RECENT)
  s.stuck = pick.id === 'stuck' ? s.stuck + 1 : 0
  if (pick.id === 'done') s.ended = 'done'
  if (s.stuck >= 2) s.ended = 'stuck'
  s.last = {
    route: state.route,
    ...(dialog === undefined ? {} : { dialog: redact(dialogName(dialog) ?? '') }),
    alerts,
    ariaHash,
    option: pick.id,
  }
  writeFileSync(join(input.session, 'session.json'), JSON.stringify(s, null, 2) + '\n')
  const goalMet = answers.goalMet
  const confusing = answers.confusing
  const uve = answers.userVisibleError
  return {
    step,
    route: state.route,
    next: {
      id: pick.id,
      text: label,
      kind: control.kind,
      name: control.name,
      ...(control.region ? { region: control.region } : {}),
      ...(chosen?.action ? { action: chosen.action, value: chosen.input } : {}),
      p: pick.p,
    },
    ...(s.ended ? { ended: s.ended } : {}),
    ...(goalMet?.type === 'noul' ? { goalMet: goalMet.noul } : {}),
    ...(unmet ? { parts: { met: Object.keys(s.partsMet), unmet } } : {}),
    ...(confusing?.type === 'noul' ? { confusing: confusing.noul } : {}),
    ...(uve?.type === 'noul' ? { userVisibleError: uve.noul } : {}),
    vetoed: allVetoed,
    notes,
    cost: { calls: jev.stats().calls, costUsd: jev.stats().costUsd },
  }
}
