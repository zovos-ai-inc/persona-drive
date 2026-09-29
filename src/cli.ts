#!/usr/bin/env -S npx tsx
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { newRunDir } from './config.ts'
import { ask, instruction } from './drive/ask.ts'
import { bandGoal } from './drive/band.ts'
import { runPersona } from './drive/loop.ts'
import { renderReport } from './drive/report.ts'
import { JevClient } from './jev.ts'
import { loadPersona } from './persona.ts'
import { loadTarget } from './target.ts'
import type { GoalResult, Step } from './types.ts'

const USAGE = `usage: persona-drive <command> [options]

  run --target <file> --persona <file> [--goal <id,…>] [--steps N] [--budget <usd>]
      [--seed N] [--base <url>] [--allow-writes] [--headed] [--no-video] [--no-screenshots]
                        Jev picks what the persona does next on each screen, Playwright does it;
                        writes video, screenshots, steps.jsonl and report.md under a run directory
  ask --session <dir> --persona <file> --goal <id> --url <url> --snapshot <file|->
      [--alerts <text;…>] [--outcome <text>] [--budget <usd>] [--allow-writes]
                        one decision for an executor that holds the browser (Claude Code with its
                        browser tools, or you): prints JSON with the option and how to perform it
  report <session-dir>  report.md for an ask session
  smoke [--budget <usd>]
                        one Jev call on a fixed state; prints the answers, usage and cost`

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`)
  process.exit(2)
}

async function run(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      target: { type: 'string' },
      persona: { type: 'string' },
      goal: { type: 'string' },
      steps: { type: 'string', default: '40' },
      budget: { type: 'string' },
      seed: { type: 'string', default: '1' },
      base: { type: 'string' },
      'allow-writes': { type: 'boolean', default: false },
      headed: { type: 'boolean', default: false },
      video: { type: 'boolean', default: true },
      screenshots: { type: 'boolean', default: true },
    },
    allowNegative: true,
  })
  if (!values.target || !values.persona) fail('run needs --target and --persona')
  const target = loadTarget(values.target, values.base)
  const persona = loadPersona(values.persona)
  const runDir = newRunDir(
    `${target.name}-${persona.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  )
  const dir = await runPersona(
    {
      target,
      persona,
      ...(values.goal ? { only: values.goal.split(',').map((g) => g.trim()) } : {}),
      steps: Number(values.steps),
      ...(values.budget === undefined ? {} : { budgetUsd: Number(values.budget) }),
      seed: Number(values.seed),
      allowWrites: values['allow-writes'],
      headed: values.headed,
      video: values.video,
      screenshots: values.screenshots,
    },
    runDir,
  )
  console.log(join(dir, 'report.md'))
}

async function askCommand(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      session: { type: 'string' },
      persona: { type: 'string' },
      goal: { type: 'string' },
      url: { type: 'string' },
      snapshot: { type: 'string' },
      alerts: { type: 'string' },
      outcome: { type: 'string' },
      budget: { type: 'string' },
      'allow-writes': { type: 'boolean', default: false },
    },
  })
  const { session, url, snapshot } = values
  if (!session || !values.persona || !values.goal || !url || !snapshot) {
    fail('ask needs --session, --persona, --goal, --url and --snapshot')
  }
  const persona = loadPersona(values.persona)
  const goal = persona.goals.find((g) => g.id === values.goal)
  if (!goal) fail(`${values.persona} has no goal ${values.goal}`)
  const aria = readFileSync(snapshot === '-' ? 0 : snapshot, 'utf8')
  const out = await ask({
    session,
    persona,
    goal,
    url,
    aria,
    ...(values.alerts ? { alerts: values.alerts.split(';').map((a) => a.trim()) } : {}),
    ...(values.outcome ? { outcome: values.outcome } : {}),
    ...(values.budget === undefined ? {} : { budgetUsd: Number(values.budget) }),
    allowWrites: values['allow-writes'],
  })
  console.log(JSON.stringify({ ...out, instruction: instruction(out.next) }, null, 2))
}

function report(args: string[]): void {
  const dir = args[0]
  if (!dir) fail('report needs a session directory')
  const steps = readFileSync(join(dir, 'steps.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Step)
  const meta = JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')) as {
    ended?: 'done' | 'stuck'
  }
  const first = JSON.parse(
    readFileSync(join(dir, steps[0]?.files.state ?? 'step-001.json'), 'utf8'),
  ) as {
    persona: { name: string; role: string }
    goal: string
  }
  const calls = readFileSync(join(dir, 'jev-calls.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { usage: { input_tokens: number } })
  const inputTokens = calls.reduce((n, c) => n + c.usage.input_tokens, 0)
  const jev = {
    calls: calls.length,
    inputTokens,
    costUsd: (inputTokens * 0.042) / 1_000_000,
  }
  const result: GoalResult = {
    persona: first.persona,
    goal: { id: 'session', text: first.goal },
    steps,
    ended: meta.ended ?? 'steps',
    jev,
    ms: 0,
    jevErrors: [],
    band: 'OK',
    reasons: [],
    files: { steps: 'steps.jsonl' },
  }
  Object.assign(result, bandGoal(result))
  console.log(
    renderReport(
      {
        target: 'ask session',
        baseUrl: steps[0]?.route ?? '/',
        persona: `${first.persona.name} (${first.persona.role})`,
        startedAt: '',
        durationMs: 0,
        jev,
        notes: [
          'the executor held the browser: no layout facts, video or deterministic signals',
        ],
      },
      [result],
    ),
  )
}

async function smoke(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { budget: { type: 'string' } } })
  const runDir = newRunDir('smoke')
  const jev = new JevClient({
    runDir,
    ...(values.budget === undefined ? {} : { budgetUsd: Number(values.budget) }),
  })
  const result = await jev.judge(
    {
      persona: {
        name: 'Sam',
        role: 'first-time visitor',
        cares: 'finding the price quickly',
      },
      goal: 'Find out what the product costs.',
      screen:
        '- heading "Welcome" [level=1]\n- link "Pricing"\n- link "Docs"\n- button "Sign in"',
    },
    {
      next: {
        type: 'choice',
        instructions: 'Which control would `persona` use next to advance `goal`?',
        criteria: {
          pricing: 'link "Pricing"',
          docs: 'link "Docs"',
          signin: 'button "Sign in"',
        },
      },
      goalMet: {
        type: 'noul',
        instructions: 'Does `screen` show what `goal` asks for?',
        criteria: { true: 'The price is shown', false: 'The price is not shown' },
      },
    },
    { label: 'smoke' },
  )
  console.log(
    JSON.stringify(
      {
        model: result.model,
        answers: result.answers,
        usage: result.usage,
        costUsd: jev.cost(),
      },
      null,
      2,
    ),
  )
}

const [command, ...rest] = process.argv.slice(2)
const commands: Record<string, (args: string[]) => Promise<void> | void> = {
  run,
  ask: askCommand,
  report,
  smoke,
}
const handler = command ? commands[command] : undefined
if (!handler) {
  console.log(USAGE)
  process.exit(command === undefined || command === '--help' || command === '-h' ? 0 : 2)
}
try {
  await handler(rest)
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}
