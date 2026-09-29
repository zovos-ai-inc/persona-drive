import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Step } from '../types.ts'
import { bandGoal, partResults } from './band.ts'

function step(over: Partial<Step>): Step {
  return {
    step: 1,
    route: '/',
    control: { id: 'done', kind: 'option', name: 'done' },
    outcome: 'chose done',
    nextProb: 0.9,
    answers: { goalMet: { type: 'noul', noul: 0.9 } },
    layout: [],
    signals: {
      failureText: null,
      loadingLeft: false,
      alertCount: 0,
      pageErrorCount: 0,
      consoleErrorCount: 0,
      failedRequestCount: 0,
      apiErrors: [],
      firstAlert: null,
    },
    vetoed: [],
    writesBlocked: [],
    notes: [],
    files: { state: 'x' },
    ...over,
  }
}

test('bandGoal: blocked write and stuck are FAIL; the last goalMet bands LIKELY / REVIEW / OK', () => {
  const band = (steps: Step[], ended: 'done' | 'stuck' = 'done') =>
    bandGoal({ steps, ended, jevErrors: [] }).band
  assert.equal(band([step({})]), 'OK')
  assert.equal(band([step({ writesBlocked: ['POST /v1/findings'] })]), 'FAIL')
  assert.equal(band([step({})], 'stuck'), 'FAIL')
  const met = (p: number) => step({ answers: { goalMet: { type: 'noul', noul: p } } })
  assert.equal(band([met(0.9), met(0.1)]), 'LIKELY')
  assert.equal(band([met(0.1), met(0.55)]), 'REVIEW')
  const layout = step({
    answers: {
      goalMet: { type: 'noul', noul: 0.9 },
      layoutBug: { type: 'noul', noul: 0.95 },
    },
  })
  assert.equal(band([layout]), 'REVIEW')
  const error = step({
    answers: {
      goalMet: { type: 'noul', noul: 0.9 },
      userVisibleError: { type: 'noul', noul: 0.8 },
    },
  })
  assert.equal(band([error]), 'LIKELY')
})

test('bandGoal: a parts goal bands on its unmet parts; partResults gives each part its met step', () => {
  const at = (n: number, answers: Step['answers']) => step({ step: n, answers })
  const noul = (p: number) => ({ type: 'noul' as const, noul: p })
  const goal = { parts: ['See A.', 'See B.'] }
  const met = [
    at(1, { part_1: noul(0.9), part_2: noul(0.1) }),
    at(2, { part_2: noul(0.8) }),
  ]
  assert.deepEqual(
    partResults(goal.parts, met).map((p) => p.met),
    [1, 2],
  )
  assert.equal(bandGoal({ goal, steps: met, ended: 'done', jevErrors: [] }).band, 'OK')
  const band = (p: number) =>
    bandGoal({
      goal,
      steps: [
        at(1, { part_1: noul(0.9), part_2: noul(0.1) }),
        at(2, { part_2: noul(p) }),
      ],
      ended: 'steps',
      jevErrors: [],
    })
  assert.equal(band(0.2).band, 'LIKELY')
  assert.match(
    band(0.2).reasons.join('\n'),
    /part 2 unmet \(best 0\.20 at step 2\): See B\./,
  )
  assert.equal(band(0.33).band, 'REVIEW')
})
