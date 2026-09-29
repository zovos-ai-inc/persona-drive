import { readFileSync } from 'node:fs'

import { parse } from 'yaml'

/** One goal a persona pursues. */
export interface Goal {
  id: string
  text: string
  /** The route the goal starts on (default `/`). */
  start?: string
  /** The goal changes data; without `--allow-writes` it is skipped. */
  writes?: boolean
  /**
   * 2 to 4 one-sentence parts, each judged on its own screen: the goal is met
   * when every part has been shown at some step.
   */
  parts?: string[]
}

/** A persona file: who the person is, what they care about, and their goals. */
export interface Persona {
  name: string
  role: string
  /** What they care about, in their own terms: this is what Jev reads as their motivation. */
  cares: string
  goals: Goal[]
}

const ID = /^[a-z0-9-]+$/

export function parsePersona(text: string, source: string): Persona {
  const doc = parse(text) as Partial<Persona> | null
  const fail = (why: string) => new Error(`${source}: ${why}`)
  if (!doc || typeof doc.name !== 'string' || !doc.name.trim()) throw fail('needs a name')
  if (typeof doc.role !== 'string' || !doc.role.trim()) throw fail('needs a role')
  if (typeof doc.cares !== 'string' || !doc.cares.trim()) throw fail('needs cares')
  if (!Array.isArray(doc.goals) || doc.goals.length === 0) throw fail('needs goals')
  const ids = new Set<string>()
  for (const g of doc.goals as Partial<Goal>[]) {
    if (typeof g.id !== 'string' || !ID.test(g.id)) {
      throw fail(`goal id ${JSON.stringify(g.id)} must be lower-case words joined by -`)
    }
    if (ids.has(g.id)) throw fail(`duplicate goal id ${g.id}`)
    ids.add(g.id)
    if (typeof g.text !== 'string' || !g.text.trim()) throw fail(`${g.id} needs text`)
    if (
      g.start !== undefined &&
      (typeof g.start !== 'string' || !g.start.startsWith('/'))
    ) {
      throw fail(`${g.id}: start must be a route`)
    }
    if (g.writes !== undefined && typeof g.writes !== 'boolean') {
      throw fail(`${g.id}: writes must be true or false`)
    }
    if (
      g.parts !== undefined &&
      (!Array.isArray(g.parts) ||
        g.parts.length < 2 ||
        g.parts.length > 4 ||
        g.parts.some((x) => typeof x !== 'string' || !x.trim()) ||
        new Set(g.parts).size !== g.parts.length)
    ) {
      throw fail(`${g.id}: parts must be 2 to 4 different sentences`)
    }
  }
  return {
    name: doc.name.trim(),
    role: doc.role.trim(),
    cares: doc.cares.trim(),
    goals: doc.goals,
  }
}

export function loadPersona(file: string): Persona {
  return parsePersona(readFileSync(file, 'utf8'), file)
}
