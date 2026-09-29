/**
 * Where a Noul probability stops being a finding. `yes` and above raises the
 * band; between `no` and `yes` is uncertain and lands in REVIEW.
 *
 * These were calibrated on hand-labelled steps of one application (three runs
 * each, the cut at the midpoint of the worst false-max / true-min pair). They
 * are a starting point for another application, not a measurement of it:
 * label 30 or so of your own steps and move them.
 */
export const THRESHOLDS = {
  noul: {
    /** YES is healthy: the persona has what the goal asks for. */
    goalMet: { yes: 0.58, no: 0.52 },
    /** YES is healthy: one part of a parts goal is shown. */
    partMet: { yes: 0.34, no: 0.32 },
    /** YES is a finding. */
    confusing: { yes: 0.43, no: 0.35 },
    layoutBug: { yes: 0.71, no: 0.61 },
    userVisibleError: { yes: 0.42, no: 0.23 },
    /** YES drops the control: activating it would delete, sign out or leave. */
    destructive: { yes: 0.46, no: 0.28 },
  },
  /** Findings these questions raise are REVIEW at most: they separated on too few labels to raise LIKELY. */
  reviewOnly: ['confusing', 'layoutBug'] as readonly string[],
}

export type Thresholds = typeof THRESHOLDS
