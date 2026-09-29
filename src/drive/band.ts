import { THRESHOLDS, type Thresholds } from '../thresholds.ts'
import type { Band, GoalResult, Step } from '../types.ts'

const RANK: Record<Band, number> = { OK: 0, REVIEW: 1, LIKELY: 2, FAIL: 3 }
/** Nouls whose YES is a finding about the screen. */
const FINDING_NOULS = ['userVisibleError', 'confusing', 'layoutBug'] as const

export interface PartResult {
  text: string
  /** The first step whose screen showed the part. */
  met?: number
  /** The best answer for it, when it was never met. */
  best?: { p: number; step: number }
}

export function partResults(
  parts: readonly string[],
  steps: readonly Step[],
  t: Thresholds = THRESHOLDS,
): PartResult[] {
  return parts.map((text, i) => {
    const r: PartResult = { text }
    for (const s of steps) {
      const a = s.answers[`part_${String(i + 1)}`]
      if (a?.type !== 'noul') continue
      if (!r.best || a.noul > r.best.p) r.best = { p: a.noul, step: s.step }
      if (r.met === undefined && a.noul >= t.noul.partMet.yes) r.met = s.step
    }
    return r
  })
}

/**
 * The one banding rule. FAIL is deterministic (a blocked write, a failed
 * action, a failure text, a page error, a 5xx, a stuck loader, a script
 * dialog, or Jev stuck twice); LIKELY and REVIEW read Jev's answers against the
 * thresholds. Every rule that fires adds a reason; the band is the worst.
 */
export function bandGoal(
  e: Pick<GoalResult, 'steps' | 'ended' | 'jevErrors'> & { goal?: { parts?: string[] } },
  t: Thresholds = THRESHOLDS,
): { band: Band; reasons: string[] } {
  const reasons: [Band, string][] = []
  for (const s of e.steps) {
    const at = `at step ${String(s.step)}`
    for (const w of s.writesBlocked) reasons.push(['FAIL', `blocked write ${at}: ${w}`])
    if (s.actError) reasons.push(['FAIL', `act error ${at}: ${s.actError}`])
    const g = s.signals
    if (g.failureText) reasons.push(['FAIL', `failure text "${g.failureText}" ${at}`])
    if (g.pageErrorCount > 0)
      reasons.push(['FAIL', `${String(g.pageErrorCount)} page error(s) ${at}`])
    for (const a of g.apiErrors.filter((x) => x.status >= 500)) {
      reasons.push(['FAIL', `API ${String(a.status)} ${a.method} ${a.url} ${at}`])
    }
    if (g.loadingLeft)
      reasons.push([
        'FAIL',
        `loading indicator still shown after the settle timeout ${at}`,
      ])
    for (const n of s.notes.filter((x) => x.startsWith('script dialog'))) {
      reasons.push(['FAIL', `${n} ${at}`])
    }
    for (const id of FINDING_NOULS) {
      const a = s.answers[id]
      if (a?.type === 'noul' && a.noul >= t.noul[id].yes) {
        const b: Band = t.reviewOnly.includes(id) ? 'REVIEW' : 'LIKELY'
        reasons.push([b, `${id} ${a.noul.toFixed(2)} ${at} (${s.route})`])
      }
    }
  }
  if (e.ended === 'stuck') reasons.push(['FAIL', 'stuck: Jev chose stuck twice in a row'])
  if (e.ended === 'budget')
    reasons.push(['REVIEW', 'budget: the run budget ended the goal'])
  const last = e.steps.at(-1)?.answers.goalMet
  const parts = e.goal?.parts
  if (parts) {
    for (const [i, r] of partResults(parts, e.steps, t).entries()) {
      if (r.met !== undefined) continue
      const what = `part ${String(i + 1)} unmet (${r.best ? `best ${r.best.p.toFixed(2)} at step ${String(r.best.step)}` : 'no answer'}): ${r.text}`
      reasons.push([r.best && r.best.p >= t.noul.partMet.no ? 'REVIEW' : 'LIKELY', what])
    }
  } else if (last?.type !== 'noul') {
    reasons.push(['REVIEW', 'goalMet: no answer for the last step'])
  } else if (last.noul < t.noul.goalMet.no) {
    reasons.push(['LIKELY', `goalMet ${last.noul.toFixed(2)} at the end`])
  } else if (last.noul < t.noul.goalMet.yes) {
    reasons.push(['REVIEW', `goalMet ${last.noul.toFixed(2)} at the end (uncertain)`])
  }
  for (const err of e.jevErrors) reasons.push(['REVIEW', `Jev call failed: ${err}`])
  const worst = reasons.reduce<Band>((b, [x]) => (RANK[x] > RANK[b] ? x : b), 'OK')
  return { band: worst, reasons: reasons.map(([b, x]) => `${b}: ${x}`) }
}
