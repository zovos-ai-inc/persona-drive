const PATTERNS: readonly [RegExp, string][] = [
  // A presigned object-store URL's query (SigV4 `X-Amz-*`, plain or URL-encoded).
  [/\?[^\s"'<>#]*X-Amz-[A-Za-z-]+(?:=|%3D)[^\s"'<>#]*/gi, '?<presigned>'],
  [/\b(\w*(?:session|token|auth)\w*)=[^;\s"'&]+/gi, '$1=<redacted>'],
  [/\b[Bb]earer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer <redacted>'],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '<jwt>'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>'],
]

/**
 * Replace presigned URL queries, session and token cookies, bearer tokens,
 * JWT-shaped strings and emails with placeholders. Everything Jev reads and
 * everything written to a run goes through here.
 */
export function redact(text: string): string {
  return PATTERNS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text,
  )
}

/** Redact every string (keys included) inside a JSON-shaped value. */
export function redactDeep<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return redact(v)
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [redact(k), walk(x)]))
    }
    return v
  }
  return walk(value) as T
}
