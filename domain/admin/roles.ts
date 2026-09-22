/*
 * PLATFORM roles: who may operate EtsyPilot itself.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  TWO AXES, NEVER ONE. This is the most important sentence in the file.
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   memberships.role   A SHOP role. Who may touch ONE seller's listings,
 *                      orders and costs. Values like OWNER. D20 parked the
 *                      four-role matrix deliberately; the column exists as a
 *                      seam and every account has exactly one OWNER row for
 *                      their own shop.
 *
 *   users.platform_role  A PLATFORM role. Who may look at EtsyPilot's own
 *                      operations — the list of accounts, subscriptions,
 *                      usage. Nothing to do with any particular shop.
 *
 * Every seller in the system is OWNER of their own shop. If those axes were
 * conflated, every seller would be an administrator of the platform. That is
 * not a hypothetical: it is what "role" meaning two things in one codebase
 * costs, and it is why nothing in this file reads `memberships` and nothing in
 * lib/permissions reads this one. There is a test asserting an OWNER gets no
 * platform access.
 *
 * ── Where each role comes from ────────────────────────────────────────────
 *
 *   SUPER_ADMIN   SUPER_ADMIN_EMAILS env var. NEVER the database.
 *   ADMIN         ADMIN_EMAILS env var. NEVER the database.
 *   MANAGER       users.platform_role column.
 *   USER          everything else, including every failure.
 *
 * The top two are environment-only for two reasons that both matter. A
 * database compromise must not be able to mint an administrator — writing a
 * row is a much lower bar than editing a deployment's environment. And it is
 * the break-glass route: if the promotion UI itself is broken or locked, an
 * env var and a restart still gets someone in.
 *
 * ── Fail closed ───────────────────────────────────────────────────────────
 *
 * Unset env, garbage env, missing column, unknown column value, no session,
 * no email: USER. There is no branch in this file that grants on absence.
 */

/* ------------------------------------------------------------------ roles */

export const PLATFORM_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER'] as const
export type PlatformRole = (typeof PLATFORM_ROLES)[number]

/** Roles a database column is allowed to assert. The other two are env-only. */
export const STORABLE_ROLES = ['MANAGER', 'USER'] as const satisfies readonly PlatformRole[]
export type StorableRole = (typeof STORABLE_ROLES)[number]

export function isStorableRole(value: string): value is StorableRole {
  return (STORABLE_ROLES as readonly string[]).includes(value)
}

/**
 * Roles the OPERATOR PANEL may assign. A strict subset of what a column may
 * hold, and the narrowest of the three lists on purpose.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  SUPER_ADMIN AND ADMIN ARE NOT HERE, AND NO CHECK ENFORCES THAT.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The TYPE does. Every function on the write path — the repository, the domain
 * action, the audit record's `to` field — takes `AssignableRole`, so
 *
 *     setPlatformRole(id, 'SUPER_ADMIN')   // ← does not compile
 *     setPlatformRole(id, someRole)        // ← PlatformRole: does not compile
 *
 * are wrong at the keyboard rather than wrong in review. A runtime check would
 * be one `if` away from being deleted by someone who could not see why it was
 * there; a parameter type cannot be deleted without the call sites going red.
 *
 * WHY IT MATTERS MORE HERE THAN ANYWHERE. SUPER_ADMIN and ADMIN live in env
 * vars precisely so that writing a row cannot mint one — a database compromise
 * is a far lower bar than editing a deployment's environment. A panel that
 * could write 'SUPER_ADMIN' into the column would not defeat that on its own,
 * because resolvePlatformRole() ignores those values in the column. It would
 * defeat something subtler: the list would start showing a role that is not in
 * force, and the audit log would record a promotion that never happened.
 *
 * `satisfies readonly StorableRole[]` is the second half. Adding 'SUPER_ADMIN'
 * here fails to compile against the storable list too, so this cannot quietly
 * grow past what resolvePlatformRole() will honour.
 */
export const ASSIGNABLE_ROLES = ['MANAGER', 'USER'] as const satisfies readonly StorableRole[]
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

/**
 * Parse one untrusted string into an assignable role.
 *
 * The boundary function. Form data is `string`, so the type guarantee above
 * needs exactly one place where a string becomes an AssignableRole, and this is
 * it. Anything else — including 'SUPER_ADMIN', 'ADMIN', a lower-case variant or
 * an empty field — is null, and the caller refuses.
 *
 * NOT case-insensitive, unlike the email allow-lists. An email is typed by a
 * human into an env var; this value comes from a <select> this codebase renders,
 * so anything that does not match exactly did not come from that select.
 */
export function parseAssignableRole(value: unknown): AssignableRole | null {
  if (typeof value !== 'string') return null
  return (ASSIGNABLE_ROLES as readonly string[]).includes(value) ? (value as AssignableRole) : null
}

/**
 * Where a person's role actually comes from.
 *
 * The panel needs this to decide whether to offer a control at all. Writing
 * `platform_role = 'USER'` for someone listed in SUPER_ADMIN_EMAILS succeeds,
 * changes the row, and changes NOTHING about their access — the env list still
 * outranks the column. A button that does that is D70's "control that appears
 * to work and does not", which is worse than no control, because whoever clicks
 * it stops looking for the real answer.
 *
 * So an env-derived role is reported as such, the row renders an explanation
 * instead of a control, and the domain action refuses it server-side too.
 */
export type RoleSource = 'ENVIRONMENT' | 'DATABASE'

export function roleSource(role: PlatformRole): RoleSource {
  return isStorableRole(role) ? 'DATABASE' : 'ENVIRONMENT'
}

/* ------------------------------------------------------------ permissions */

/**
 * The delegatable permissions.
 *
 * Hardcoded defaults today; the next step makes them editable per role. The
 * keys are the stable part and are what any future editor will store against.
 */
export const PERMISSIONS = [
  'users.view',
  'users.detail',
  'subscriptions.view',
  'usage.view',
  'ai.view',
  'etsy.view',
  'operations.view',
] as const
export type Permission = (typeof PERMISSIONS)[number]

/**
 * The two capabilities that are NOT permissions, and can never be granted.
 *
 * Deliberately a SEPARATE type that does not extend Permission, so this is a
 * property of the type system rather than a convention someone has to
 * remember. `can()` below accepts only `Permission`, which makes
 *
 *     can(role, 'roles.write')        // ← does not compile
 *     PERMISSIONS.includes('audit.view')  // ← does not compile
 *
 * wrong at the keyboard rather than wrong in review. A future checkbox editor
 * iterates PERMISSIONS, so neither can appear in it either.
 *
 * WHY THESE TWO. Both are how someone covers their tracks. Whoever can change
 * platform roles can promote themselves; whoever can read the admin audit log
 * can see who noticed. An administrator who could delegate either could build
 * themselves a quieter administrator and hand it to somebody else.
 */
export const SUPER_ADMIN_ONLY = ['audit.view', 'roles.write'] as const
export type SuperAdminOnlyCapability = (typeof SUPER_ADMIN_ONLY)[number]

/** Defaults. SUPER_ADMIN and ADMIN differ only in what they may delegate. */
export const ROLE_PERMISSIONS: Record<PlatformRole, readonly Permission[]> = {
  SUPER_ADMIN: PERMISSIONS,
  ADMIN: PERMISSIONS,
  // Promoted sellers. They see WHO exists and nothing about anyone's money.
  MANAGER: ['users.view'],
  USER: [],
}

/** Does this role hold this permission? */
export function can(role: PlatformRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

/**
 * The gate for the two non-delegatable capabilities.
 *
 * A separate function from can(), taking a separate type, so the two questions
 * cannot be asked through the same door.
 */
export function canSuperAdminOnly(
  role: PlatformRole,
  capability: SuperAdminOnlyCapability,
): boolean {
  void capability // Both require the same role; the argument documents which.
  return role === 'SUPER_ADMIN'
}

/** Any platform access at all. Used to decide whether /admin exists for you. */
export function hasAnyAdminAccess(role: PlatformRole): boolean {
  return ROLE_PERMISSIONS[role].length > 0
}

/* -------------------------------------------------------------- resolution */

/**
 * Read a comma-separated allow-list of emails from the environment.
 *
 * Normalised: trimmed and lower-cased, empty entries dropped.
 *
 * HOW EACH AMBIGUITY FAILS, decided rather than inherited:
 *
 *   " admin@x.com , b@x.com "   trailing and leading spaces are TRIMMED, so a
 *                               stray space grants access as intended. Failing
 *                               closed here would mean an invisible character
 *                               silently locking out the only administrator —
 *                               the one failure with no way to diagnose it
 *                               from the outside.
 *
 *   "Admin@X.com"               lower-cased on BOTH sides, so case never
 *                               decides the outcome in either direction. It
 *                               grants exactly when the lowercase form would,
 *                               and never by accident.
 *
 *   "a@x.com,,b@x.com"          the empty entry is DROPPED, not kept. Keeping
 *                               it would put "" in the list, and a session
 *                               with no email would then match it — absence
 *                               granting access, which is the one shape this
 *                               file refuses.
 *
 *   unset / "" / garbage        an empty list. Nothing matches. USER.
 */
function allowList(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
}

/**
 * Resolve someone's platform role.
 *
 * Pure: it takes the email and the stored column rather than reaching for a
 * session or a database, so every branch is testable without either, and so
 * the order of precedence is visible in one place.
 *
 * Order: SUPER_ADMIN_EMAILS, ADMIN_EMAILS, the column, USER.
 */
export function resolvePlatformRole(account: {
  email: string | null | undefined
  /** users.platform_role. Anything unrecognised is treated as USER. */
  storedRole?: string | null
}): PlatformRole {
  const email = (account.email ?? '').trim().toLowerCase()

  /*
   * No email, no elevation. Checked before the lists rather than relying on
   * them being non-empty: "" must never match anything, even if a malformed
   * env var somehow produced an empty entry.
   */
  if (email) {
    if (allowList(process.env.SUPER_ADMIN_EMAILS).includes(email)) return 'SUPER_ADMIN'
    if (allowList(process.env.ADMIN_EMAILS).includes(email)) return 'ADMIN'
  }

  /*
   * Only then the column, and only for the roles a column may assert. A row
   * reading 'SUPER_ADMIN' — however it got there — resolves to USER, which is
   * the whole point of keeping those two out of the database.
   */
  const stored = (account.storedRole ?? '').trim().toUpperCase()
  if (isStorableRole(stored)) return stored

  return 'USER'
}
