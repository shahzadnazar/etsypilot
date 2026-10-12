/*
 * Which paths belong to the browser extension.
 *
 * Pure, and in its own module for the same reason checkAdminRoute() is: a
 * decision inside middleware.ts cannot be tested without starting a server,
 * so it stops being tested. NO `server-only` marker — middleware is a separate
 * Edge bundle that does not set the `react-server` export condition, and that
 * import would throw at module load on every request (D59b).
 *
 * Prefix matching with an explicit boundary, not `includes()`: `/settings/x`
 * must not match because it contains the word, and `/settings/extensions-faq`
 * must not match because it starts with the string. A path matches when it IS
 * one of these or sits UNDER one of them.
 */

export const EXTENSION_PATHS = ['/settings/extension', '/api/extension'] as const

export function isExtensionPath(pathname: string): boolean {
  return EXTENSION_PATHS.some((base) => pathname === base || pathname.startsWith(`${base}/`))
}
