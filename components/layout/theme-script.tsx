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
