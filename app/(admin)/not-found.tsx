/*
 * The 404 boundary for the operator group.
 *
 * It re-exports the ordinary app-wide not-found page rather than defining its
 * own, so the two can never drift into two different-looking 404s.
 *
 * Without this file, requireAdmin()'s notFound() had no boundary in its own
 * hierarchy and a refused request rendered a bare error document with none of
 * the 404 copy in it. With it, the refused seller sees the same "That page
 * doesn't exist" page every other missing URL shows.
 *
 * WHAT IT DOES NOT FIX, measured rather than assumed: Next still wraps a
 * request-time notFound() in its `<html id="__next_error__">` shell instead of
 * the root layout, so the response is 8,602 bytes against 9,507 for a URL that
 * genuinely has no route. Same status, same visible page, different document
 * shell — see the scope note in domain/admin/access.ts for what that does and
 * does not disclose.
 *
 * It renders inside app/(admin)/layout.tsx, which is exactly why that layout
 * returns a bare fragment when access is refused: no banner, no email, no
 * navigation reaches anyone this boundary is showing.
 */
export { default } from '@/app/not-found'
