import { partResults } from './band.ts'
import { BANDS, type Answer, type Band, type GoalResult, type Step } from '../types.ts'

export interface RunMeta {
  target: string
  baseUrl: string
  persona: string
  startedAt: string
  durationMs: number
  jev: { calls: number; inputTokens: number; costUsd: number }
  notes: string[]
}

function cell(text: string, max: number): string {
  const flat = text.replace(/\|/g, '\\|').replace(/\s+/g, ' ')
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

function noulText(a: Answer | undefined): string {
  return a?.type === 'noul' ? a.noul.toFixed(2) : '—'
}

function stepMet(s: Step): string {
  const parts = Object.entries(s.answers).filter(([id]) => id.startsWith('part_'))
  if (!parts.length) return noulText(s.answers.goalMet)
  return parts.map(([id, a]) => `${id.replace('part_', 'p')} ${noulText(a)}`).join(' ')
}

function final(r: GoalResult): string {
  if (!r.goal.parts) return noulText(r.steps.at(-1)?.answers.goalMet)
  const met = partResults(r.goal.parts, r.steps).filter((p) => p.met !== undefined)
  return `${String(met.length)}/${String(r.goal.parts.length)} parts`
}

function entry(r: GoalResult): string {
  const files = [
    ...(r.files.video ? [`[video](${r.files.video})`] : []),
    ...(r.files.trace ? [`[trace](${r.files.trace})`] : []),
    `[steps](${r.files.steps})`,
  ]
  return [
    `### ${r.goal.id} — ${r.band}`,
    '',
    `- goal: ${r.goal.text}${r.goal.writes ? ' (writes)' : ''}`,
    `- start: \`${r.goal.start ?? '/'}\`; ended: ${r.ended} after ${String(r.steps.length)} steps, ${(r.ms / 1000).toFixed(0)} s`,
    `- Jev: ${String(r.jev.calls)} calls, ${String(r.jev.inputTokens)} input tokens, $${r.jev.costUsd.toFixed(4)}`,
    ...(r.goal.parts
      ? partResults(r.goal.parts, r.steps).map(
          (p, i) =>
            `- part ${String(i + 1)}: ${p.met !== undefined ? `met at step ${String(p.met)}` : `unmet${p.best ? `, best ${p.best.p.toFixed(2)} at step ${String(p.best.step)}` : ''}`}: ${p.text}`,
        )
      : []),
    ...r.reasons.map((x) => `- ${x}`),
    `- files: ${files.join(' · ')}`,
    '',
    '| step | route | what the persona did | what happened | P(next) | goalMet or parts |',
    '| ---: | --- | --- | --- | ---: | ---: |',
    ...r.steps.map((s) => {
      const c =
        s.control.kind === 'option'
          ? s.control.name
          : `${s.control.action ? `${s.control.action} ` : ''}${s.control.kind} "${cell(s.control.name, 60)}"${s.control.value ? ` = ${cell(s.control.value, 30)}` : ''}`
      return `| ${String(s.step)} | \`${s.route}\` | ${c} | ${cell(s.outcome, 120)} | ${s.nextProb.toFixed(2)} | ${stepMet(s)} |`
    }),
    '',
  ].join('\n')
}

export function renderReport(meta: RunMeta, records: GoalResult[]): string {
  const counts = Object.fromEntries(
    BANDS.map((b) => [b, records.filter((r) => r.band === b).length]),
  ) as Record<Band, number>
  const perGoal = records.length ? meta.jev.costUsd / records.length : 0
  return [
    `# persona-drive — ${meta.persona} on ${meta.target}`,
    '',
    `- target: ${meta.baseUrl}`,
    `- started: ${meta.startedAt}, duration ${(meta.durationMs / 60_000).toFixed(1)} min`,
    `- Jev: ${String(meta.jev.calls)} calls, ${String(meta.jev.inputTokens)} input tokens, $${meta.jev.costUsd.toFixed(4)} ($${perGoal.toFixed(4)} per goal)`,
    ...meta.notes.map((n) => `- note: ${n}`),
    '',
    '## Summary',
    '',
    '| FAIL | LIKELY | REVIEW | OK |',
    '| ---: | ---: | ---: | ---: |',
    `| ${String(counts.FAIL)} | ${String(counts.LIKELY)} | ${String(counts.REVIEW)} | ${String(counts.OK)} |`,
    '',
    '## Goals',
    '',
    '| goal | band | ended | steps | final goalMet or parts met | cost | video |',
    '| --- | --- | --- | ---: | ---: | ---: | --- |',
    ...records.map(
      (r) =>
        `| ${r.goal.id} | ${r.band} | ${r.ended} | ${String(r.steps.length)} | ${final(r)} | $${r.jev.costUsd.toFixed(4)} | ${r.files.video ? `[video](${r.files.video})` : '—'} |`,
    ),
    '',
    ...records.map(entry),
  ].join('\n')
}
