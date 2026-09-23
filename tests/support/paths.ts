/*
 * ONE NORMALISER, APPLIED AT THE BOUNDARY.
 *
 * `path.join`, `path.relative` and anything built from `readdirSync` return
 * `lib\etsy\index.ts` on Windows and `lib/etsy/index.ts` everywhere else. A
 * suite that compares either against a literal, stores either in a Set, or
 * uses either as a Map key is a suite that agrees with itself on one platform
 * and not the other.
 *
 * Eighteen tests failed on Windows for exactly that reason, and none of them
 * was a real defect. That is worse than having no local tests: the developer
 * who runs this repo day to day reads a red run as normal, and stops reading
 * it at all.
 *
 * ── NORMALISE WHERE THE PATH IS BORN, NOT WHERE IT IS COMPARED ────────────
 *
 * The moment a path comes back from `join`, `relative`, `readdir` or a walk —
 * before it is stored, keyed on, or compared. Normalising at the assertion
 * instead is too late: a path that went into a Set under two spellings is
 * already two entries, and the Set has already given the wrong answer.
 *
 * ── THE LITERAL IN THE TEST IS THE CONTRACT ───────────────────────────────
 *
 * Every expected value stays written with forward slashes. `lib/etsy/index.ts`
 * is what the test means and what a reader checks; the platform is the thing
 * that has to adapt. So nothing here ever converts a literal TOWARDS the
 * platform — the traffic is one way, from the platform to posix.
 *
 * ── WHY NOT `split(path.sep)` ─────────────────────────────────────────────
 *
 * That is the obvious spelling and it has a flaw that matters here: on Linux
 * `path.sep` is `/`, so the function becomes the identity and CANNOT BE TESTED
 * on the machine CI runs on. Splitting on either separator makes the
 * transformation the same everywhere, which means
 * tests/unit/cross-platform-paths.test.ts can feed it real `path.win32` output
 * and measure the result — on Linux. A normaliser nobody can test on the
 * platform they are standing on is a normaliser nobody has tested.
 *
 * It is also strictly more correct. Windows accepts both separators, so a path
 * that has been through `path.win32.join('lib/etsy', 'live.ts')` is
 * `lib/etsy\live.ts` — mixed, and `split(path.sep)` leaves the forward slash
 * alone only because it happens to already be right. Splitting on either
 * handles the mixed case by construction.
 *
 * ── AND FORWARD SLASHES STILL WORK FOR I/O ────────────────────────────────
 *
 * Normalising to posix does not break `readFileSync` or `existsSync` on
 * Windows: the Win32 API has accepted `/` as a separator since long before
 * Node existed, and Node passes the string through. So a path can be posix
 * from birth and still be read.
 */

import { join, relative } from 'node:path'

/**
 * A path with every separator turned into `/`.
 *
 * Idempotent, so applying it twice is harmless and a caller never has to know
 * whether a value has already been through it.
 */
export function posix(p: string): string {
  return p.split(/[\\/]/).join('/')
}

/** `path.join`, normalised at birth. */
export function posixJoin(...parts: string[]): string {
  return posix(join(...parts))
}

/** `path.relative`, normalised at birth. */
export function posixRelative(from: string, to: string): string {
  return posix(relative(from, to))
}
