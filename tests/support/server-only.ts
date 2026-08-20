/*
 * A stub for the `server-only` package, used by the test runner ONLY.
 *
 * The real package throws on import. That is exactly what we want from Next's
 * bundler — importing lib/etsy/tokens.ts or lib/etsy/live.ts from a client
 * component must be a build error, because it is the only reliable way to keep
 * a refresh token out of a browser bundle.
 *
 * Vitest is not a client bundle. Without this alias the marker made those two
 * modules untestable, and the tempting fix — deleting the marker — would trade
 * a real security property for test convenience. D28 says change the
 * architecture, never the property: the marker stays, Next still enforces it,
 * and the test runner is told to treat it as the no-op it is on a server.
 *
 * So that the alias cannot quietly become a way to DROP the marker,
 * tests/unit/etsy-live.test.ts asserts that every module that must carry it
 * still does.
 */
export {}
