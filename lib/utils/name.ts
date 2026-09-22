/*
 * Turning a stored name into the two things the shell prints.
 *
 * One module because the avatar and the greeting must not disagree about where
 * a name ends. They were two expressions in two files, and running them over
 * real shapes found two defects neither review had caught:
 *
 *   "O'Brien"      the avatar read O' — punctuation, because it took the first
 *                  two CHARACTERS rather than the first two letters.
 *   "  Jo Ann"     the greeting read "Good morning, " — split(' ')[0] on a
 *                  leading space is the empty string.
 *
 * The second only ever surfaced because something upstream forgot to trim.
 * Everything that writes a name trims it today, so it was safe — which is
 * exactly the kind of safety that stops being true when a fourth writer
 * appears. These two functions do not depend on it.
 */

/** Words, with any amount of surrounding or internal whitespace collapsed. */
function words(name: string): string[] {
  return name.trim().split(/\s+/).filter(Boolean)
}

/**
 * The name to greet someone by: their first word.
 *
 * Falls back to the whole trimmed string, then to the caller's fallback, so
 * "Good morning, " with nothing after it is not reachable.
 */
export function greetingName(name: string, fallback = 'there'): string {
  // `||` and not `??`: the empty string is exactly the case being defended
  // against, and `??` passes it straight through. Written with `??` first, and
  // the test for it failed immediately.
  return words(name)[0] || name.trim() || fallback || 'there'
}

/**
 * Up to two initials for the avatar.
 *
 * Two words give their first LETTERS; one word gives its first two. Non-letters
 * are dropped first, so an apostrophe or a hyphen never reaches the avatar —
 * "O'Brien" is OB and "Mary-Jane" is MA, not "O'" and "MA".
 *
 * Unicode-aware: \p{L} keeps accented and non-Latin letters, which a simple
 * [A-Za-z] would silently drop and leave some sellers with a blank avatar.
 */
export function initialsFor(name: string, fallback = ''): string {
  const parts = words(name)
    .map((w) => [...w].filter((c) => /\p{L}/u.test(c)).join(''))
    .filter(Boolean)

  const source =
    parts.length > 1
      ? `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`
      : (parts[0] ?? [...fallback].filter((c) => /\p{L}/u.test(c)).join('')).slice(0, 2)

  return source.slice(0, 2).toUpperCase()
}
