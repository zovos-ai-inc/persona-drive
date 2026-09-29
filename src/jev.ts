import { createHash } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  TypeSafeClient,
  type EntryType,
  type Questions,
  type SystemOneResult,
} from '@typesafe-ai/sdk'

import { estimateTokens } from './capture/aria.ts'
import { typesafeApiKey } from './config.ts'

/** Jev list price: input tokens only, output is free. */
const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000
/** Our cap on state size; the API's hard limit is 32k tokens. */
const MAX_STATE_TOKENS = 20_000

/** Thrown once a run's spend passes its budget; the loop stops on it. */
export class BudgetExceededError extends Error {}

export interface JevOptions {
  /** Every call appends one line to `<runDir>/jev-calls.jsonl`. */
  runDir: string
  /** Throw once the run's spend exceeds this many USD. */
  budgetUsd?: number
}

/** One Jev call per step: every question over one state in a single request. */
export class JevClient {
  private readonly client: TypeSafeClient
  private readonly logPath: string
  private readonly budgetUsd: number | undefined
  private inputTokens = 0
  private calls = 0

  constructor({ runDir, budgetUsd }: JevOptions) {
    this.client = new TypeSafeClient({
      apiKey: typesafeApiKey(),
      retry: { maxRetries: 5, backoffMaxMs: 30_000, httpStatuses: new Set([429, 529]) },
    })
    this.logPath = join(runDir, 'jev-calls.jsonl')
    this.budgetUsd = budgetUsd
  }

  /** USD spent by this client so far. */
  cost(): number {
    return this.inputTokens * USD_PER_INPUT_TOKEN
  }

  stats(): { calls: number; inputTokens: number; costUsd: number } {
    return { calls: this.calls, inputTokens: this.inputTokens, costUsd: this.cost() }
  }

  async judge<Q extends Questions>(
    state: EntryType,
    questions: Q,
    { label }: { label: string },
  ): Promise<SystemOneResult<Q>> {
    const stateTokensEst = estimateTokens(state)
    if (stateTokensEst > MAX_STATE_TOKENS) {
      throw new Error(
        `jev ${label}: state ~${String(stateTokensEst)} tokens exceeds ${String(MAX_STATE_TOKENS)}`,
      )
    }
    if (this.budgetUsd !== undefined && this.cost() > this.budgetUsd) {
      throw new BudgetExceededError(
        `jev ${label}: budget $${String(this.budgetUsd)} exceeded ($${this.cost().toFixed(6)} spent)`,
      )
    }
    const started = performance.now()
    const result = await this.client.systemOne({ state, questions })
    const ms = Math.round(performance.now() - started)
    this.inputTokens += result.usage.input_tokens
    this.calls++
    appendFileSync(
      this.logPath,
      JSON.stringify({
        ts: new Date().toISOString(),
        label,
        stateHash: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
        stateTokensEst,
        answers: result.answers,
        usage: result.usage,
        ms,
        model: result.model,
      }) + '\n',
    )
    return result
  }
}
