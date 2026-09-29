import type { ChoiceResponse, NoulResponse, ScoreResponse } from '@typesafe-ai/sdk'

import type { Vetoed } from './capture/controls.ts'
import type { ScreenState } from './capture/snapshot.ts'

export type Answer = NoulResponse | ChoiceResponse | ScoreResponse
export type Band = 'FAIL' | 'LIKELY' | 'REVIEW' | 'OK'
export const BANDS: readonly Band[] = ['FAIL', 'LIKELY', 'REVIEW', 'OK']

/** Deterministic signals of the screen a step landed on. */
export interface Signals {
  failureText: string | null
  loadingLeft: boolean
  alertCount: number
  pageErrorCount: number
  consoleErrorCount: number
  failedRequestCount: number
  apiErrors: { method: string; url: string; status: number }[]
  firstAlert: string | null
}

export function signalsOf(state: ScreenState): Signals {
  return {
    failureText: state.failureText,
    loadingLeft: state.loadingLeft,
    alertCount: state.alerts.length,
    pageErrorCount: state.pageErrors.length,
    consoleErrorCount: state.consoleErrors.length,
    failedRequestCount: state.failedRequests.length,
    apiErrors: state.apiErrors.map(({ method, url, status }) => ({
      method,
      url,
      status,
    })),
    firstAlert: state.alerts[0] ?? null,
  }
}

/** One step of a goal, as written to `steps.jsonl`. */
export interface Step {
  step: number
  /** Route the step started on. */
  route: string
  /**
   * The option taken: a page control (`c00`…), or a harness option (kind
   * `option`, name its id); `action` when it chose a native select's option or
   * typed text from the goal (`value`).
   */
  control: {
    id: string
    kind: string
    name: string
    region?: string
    action?: 'select' | 'type'
    value?: string
  }
  /** What code saw the option do: route change, dialog opened or closed, save, alert, blocked write. */
  outcome: string
  /** Jev's `next` probability for the option taken. */
  nextProb: number
  /** goalMet (or `part_<n>` per unmet part), confusing, layoutBug and userVisibleError on the screen the step started on. */
  answers: Record<string, Answer>
  /** Layout facts of that screen. */
  layout: string[]
  signals: Signals
  vetoed: Vetoed[]
  /** Non-GET requests the read-only guard blocked during the step. */
  writesBlocked: string[]
  actError?: string
  notes: string[]
  /** Files relative to the run directory. */
  files: { state: string; screenshot?: string }
}

export interface GoalResult {
  persona: { name: string; role: string }
  goal: { id: string; text: string; start?: string; writes?: boolean; parts?: string[] }
  steps: Step[]
  /** Jev chose done, chose stuck twice in a row, the step cap, the budget, or a failed Jev call. */
  ended: 'done' | 'stuck' | 'steps' | 'budget' | 'error'
  jev: { calls: number; inputTokens: number; costUsd: number }
  ms: number
  jevErrors: string[]
  band: Band
  reasons: string[]
  files: { steps: string; video?: string; trace?: string }
}
