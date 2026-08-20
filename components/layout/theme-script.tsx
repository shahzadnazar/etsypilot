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

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
}
