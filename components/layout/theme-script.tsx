/*
 * Theme bootstrap.
 *
 * Runs before paint so there is no flash of the wrong theme. Mirrors the
 * mechanic used in every design canvas: a three-way Light / Dark / System
 * choice, persisted in localStorage, with System following prefers-color-scheme
 * live (D1).
 *
 * The tokens themselves live in styles/globals.css; this only sets the
 * data-theme attribute the stylesheet keys off.
 */
const SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('etsypilot-theme') || 'system';
    var root = document.documentElement;
    if (stored === 'system') { root.removeAttribute('data-theme'); }
    else { root.setAttribute('data-theme', stored); }
  } catch (e) {
    /* Private browsing with storage disabled: fall through to system. */
  }
})();
`

/*
 * ── THE "SCRIPT TAG WHILE RENDERING" WARNING: MEASURED, NOT REPRODUCED ────
 *
 * This component was reported as logging, on every page load in dev:
 *
 *   Encountered a script tag while rendering React component. Scripts inside
 *   React components are never executed when rendering on the client.
 *
 * It was not reproduced. Every route this app serves was loaded under
 * `next dev` and `next start`, in both themes, hard-reloaded, client-navigated
 * between route groups, run through a Fast Refresh cycle, run with the theme
 * toggled, run with head mutated before hydration the way an extension would,
 * and loaded on a 404. The console stayed clean on all of them.
 *
 * THE DETECTOR WAS PROVED LIVE FIRST, because "I looked and saw nothing" is
 * worth nothing otherwise. React's warning fires from createInstance — the
 * path for a node React builds ON THE CLIENT — so a throwaway client component
 * that mounted a <script> after hydration was added to a route, and the
 * warning appeared immediately. The mechanism is present in this exact bundle;
 * this script does not reach it, because it arrives in the server's HTML and
 * is hydrated rather than created.
 *
 * So nothing here changed. Two reasons to write that down rather than change
 * something anyway:
 *
 *   The obvious silencer is a `type` React treats as a data block, and every
 *   one of those is a type the browser WILL NOT EXECUTE. That trades a console
 *   line for the flash this component exists to prevent — and the flash is
 *   silent, so the trade also destroys the evidence.
 *
 *   Moving to <script src> would leave createInstance behind, at the cost of a
 *   render-blocking request before first paint and a second thing the CSP has
 *   to nonce under 'strict-dynamic'.
 *
 * If it does appear, it is a real difference between environments and worth
 * knowing about rather than papering over: tests/browser/dev-server.py now
 * fails on any console error or warning during a dev page load, and asserts
 * this script's two load-bearing properties — that it carries its nonce, and
 * that data-theme is already correct at first paint in both themes.
 */

/*
 * The nonce is required, not optional.
 *
 * Typing it as a required prop is the point: under the CSP in middleware.ts an
 * un-nonced inline script is silently refused, and the failure is a flash of
 * the wrong theme on every load — the exact thing this component exists to
 * prevent, reappearing with no error anywhere. A required prop turns that into
 * a compile error instead.
 */
export function ThemeScript({ nonce }: { nonce: string }) {
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT }} />
}
