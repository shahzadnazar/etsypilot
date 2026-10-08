/*
 * The two constants that define a public demo visitor.
 *
 * In their own module, with no imports, deliberately. `lib/auth/index.ts`
 * reaches Supabase, the account repository and provisioning; anything in
 * `domain/` that needs to recognise a visitor would drag that whole graph in,
 * and `domain/auth/provision.ts` is already inside it — so the import would be
 * a cycle as well as a weight.
 *
 * No `server-only` marker: this is two strings, and the middleware bundle
 * (Edge) must be able to read them without pulling a Node-only module in (D59b).
 */

/** The cookie that says "this browser clicked into the public demo". */
export const PUBLIC_DEMO_COOKIE = 'ep_public_demo'

/**
 * The actor id a public visitor acts as. DELIBERATELY NOT DEMO_ACTOR_ID.
 *
 * Salman R. is a person in the fixture — the demo shop's owner, the name on
 * its audit records. A public visitor is not him and must not be recorded as
 * him. It is also not a `users` row: nothing provisions it and nothing may, so
 * every foreign key to `users` rejects it, which is one more wall between a
 * visitor and a write.
 */
export const PUBLIC_DEMO_ACTOR_ID = 'public-demo-visitor'
