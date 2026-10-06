import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   ATTACHING AN ETSY SHOP TO THE SELLER'S OWN SHOP ROW — IN ONE TRANSACTION.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * A seller has one `shops` row from the moment they sign up: the one that reads
 * "My demo shop". Connecting Etsy UPDATES that row. It does not create a
 * second, and three things in the product already assume that:
 * domain/billing/plans.ts sells "Connect one Etsy shop" and lists "One shop" as
 * the Solo limit; the seller's memberships and anything they configured while
 * exploring hang off that row; and `shops.etsy_shop_id` was put in the schema
 * for exactly this and has never been written.
 *
 * ── WHY THIS IS A TRANSACTION AND NOT TWO CALLS ───────────────────────────
 *
 * The connection is TWO writes that are one fact:
 *
 *   etsy_connections   the sealed token, the scopes, the expiry
 *   shops              etsy_shop_id, name, currency, connection_status, is_demo
 *
 * Either on its own is a lie. A token row with no shop update leaves a shop
 * still called "My demo shop", still flagged `is_demo`, holding live
 * credentials nothing will use — and `getEtsyService()` would keep serving the
 * demo catalogue over a real connection. A shop update with no token row leaves
 * a shop that says CONNECTED and has nothing to authenticate with, so every
 * screen fails at the first API call.
 *
 * So both happen inside one BEGIN, the same argument the role-change write
 * makes for its audit record. There is no ordering of failures that produces
 * half a connection.
 *
 * ── AND THE SHOP ID IS NEVER THE CALLER'S TO CHOOSE ───────────────────────
 *
 * `shopId` here is resolved from the SESSION by the caller, server-side. The
 * original defect came from the opposite instinct, which was half right: the
 * callback took the shop id from ETSY (`String(me.shop_id)`) precisely so that
 * no caller could supply one — and that id is in a different namespace from
 * `shops.id`, which this table's foreign key points at, so every real
 * connection failed the key. The instinct survives; what changed is where the
 * trusted value comes from. A session is not a request parameter.
 */

import { and, eq, isNotNull, ne } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'
import { sealForStorage } from '@/lib/etsy/tokens'
import { AppError } from '@/lib/errors/types'
import type { TokenSet } from '@/lib/etsy/oauth'

const FOREIGN_KEY_VIOLATION = '23503'
const UNIQUE_VIOLATION = '23505'

/** SQLSTATE behind a failed query, walking the cause chain drizzle wraps it in. */
function pgCode(error: unknown): string | null {
  let current: unknown = error
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code
    current = (current as { cause?: unknown }).cause
  }
  return null
}

/**
 * Why a connection could not be saved, as something the route can switch on.
 *
 * A CODE, not a message. The route turns each of these into one of its own
 * CONNECT_OUTCOMES, so Etsy's wording and Postgres's wording both stop here —
 * and an outcome with no copy does not compile.
 */
export type ConnectFailure =
  | 'SHOP_UNKNOWN'
  /** That Etsy shop is already attached to a DIFFERENT EtsyPilot shop. */
  | 'ETSY_SHOP_TAKEN'

export class EtsyConnectionError extends Error {
  constructor(readonly failure: ConnectFailure) {
    super(`etsy connection refused: ${failure}`)
    this.name = 'EtsyConnectionError'
  }
}

export interface ConnectEtsyShop {
  /** EtsyPilot's own shop id, resolved from the session. Never from a request. */
  shopId: string
  /** Etsy's numeric shop id, as text. */
  etsyShopId: string
  /** What Etsy says the shop is called and trades in. */
  shop: { name: string; currency: string }
  tokens: TokenSet
  /** The scopes Etsy granted by completing the flow. */
  scopes: string[]
}

/**
 * Save a completed connection, or refuse it having written nothing.
 *
 * ── `is_demo` GOES FALSE, AND THAT IS THE LOAD-BEARING LINE ───────────────
 *
 * Checked rather than assumed before changing it: `shops.is_demo` is read in
 * exactly one place that matters — getSession() copies it onto the session
 * (lib/auth/index.ts), and from there it drives the demo banner, the D11
 * provenance override on every figure, and `readOnly` in shopContext. All
 * three are statements about whether this shop's data is real.
 *
 * So a shop that has just been connected to a live Etsy account must not keep
 * it. Leaving it true would put a dashed "demo" chip and a demo provenance
 * badge on a real seller's real figures, and mark their real shop read-only.
 * getSession()'s own comment already anticipated this: "Every account has a
 * demo shop today... That is correct, and stays true until an Etsy connection
 * exists to flip the column." This is that connection.
 *
 * ── `connection_status` BECOMES 'CONNECTED', WHICH IS AN EXISTING VALUE ───
 *
 * Read off the type rather than invented: ConnectionStatus in
 * lib/etsy/interface.ts is 'CONNECTED' | 'TOKEN_EXPIRED' | 'REVOKED' |
 * 'DISCONNECTED' | 'DEMO', and live.ts already reports 'CONNECTED' for a shop
 * it can read. domain/admin/etsy-health.ts cross-checks this column against
 * the connection row and flags a disagreement, so writing anything else here
 * would light up the operator console's Etsy health screen.
 *
 * ── TIMEZONE IS NOT TAKEN FROM ETSY, BECAUSE ETSY DOES NOT SEND ONE ───────
 *
 * Etsy's shop payload has `shop_name` and `currency_code` and no timezone —
 * live.ts's getShop() says so and hardcodes 'UTC' as this product's single
 * basis (D24). The column therefore keeps whatever it had rather than being
 * written with a value nobody supplied; stated here because "name, currency and
 * timezone take Etsy's values" was the intent, and two of the three is what the
 * API actually permits.
 */
export async function connectEtsyShop(input: ConnectEtsyShop): Promise<void> {
  /*
   * SEALED BEFORE THE TRANSACTION OPENS. If TOKEN_ENCRYPTION_KEY is missing
   * this throws here, with nothing begun and nothing to roll back — rather
   * than inside a BEGIN that would then have to be unwound.
   */
  const sealed = sealForStorage(input.tokens, 'stored')
  const expiresAt = new Date(input.tokens.expiresAt)
  if (Number.isNaN(expiresAt.getTime())) {
    throw new AppError({
      kind: 'VALIDATION',
      code: 'TOKEN_EXPIRY_INVALID',
      message: 'Etsy returned a token expiry that is not a date.',
      recovery: 'Try connecting again. If it keeps happening, this is a bug on our side.',
      retryable: true,
      context: { shopId: input.shopId },
    })
  }

  try {
    await getDb().transaction(async (tx) => {
      /*
       * ── IS THIS ETSY SHOP SOMEBODY ELSE'S? ─────────────────────────────
       *
       * Asked so the seller gets a sentence instead of a constraint. The
       * UNIQUE index on shops.etsy_shop_id is what actually guarantees it —
       * this SELECT and the UPDATE below are two statements, and two callbacks
       * interleaving between them would both see nothing and both write.
       *
       * `ne(shops.id, shopId)` is the whole subtlety: RECONNECTING the same
       * Etsy shop to the same EtsyPilot shop is the ordinary re-authorisation
       * path and must be allowed. Only a DIFFERENT shop row holding that Etsy
       * id is a conflict.
       */
      const [taken] = await tx
        .select({ id: schema.shops.id })
        .from(schema.shops)
        .where(
          and(
            eq(schema.shops.etsyShopId, input.etsyShopId),
            isNotNull(schema.shops.etsyShopId),
            ne(schema.shops.id, input.shopId),
          ),
        )
        .limit(1)
      if (taken) throw new EtsyConnectionError('ETSY_SHOP_TAKEN')

      /*
       * The shop row FIRST, so a shop id that does not exist is caught before
       * a token is written. `rowCount` is the check: an UPDATE against a
       * missing id affects nothing and reports no error, which would otherwise
       * leave the connection row as the only trace of the attempt.
       */
      const updated = await tx
        .update(schema.shops)
        .set({
          etsyShopId: input.etsyShopId,
          name: input.shop.name,
          currency: input.shop.currency,
          connectionStatus: 'CONNECTED',
          isDemo: false,
        })
        .where(eq(schema.shops.id, input.shopId))
        .returning({ id: schema.shops.id })
      if (updated.length === 0) throw new EtsyConnectionError('SHOP_UNKNOWN')

      await tx
        .insert(schema.etsyConnections)
        .values({
          shopId: input.shopId,
          tokenRef: sealed,
          scopes: input.scopes,
          expiresAt,
          revokedAt: null,
        })
        .onConflictDoUpdate({
          target: schema.etsyConnections.shopId,
          /*
           * All four, for the reasons DatabaseTokenStore.write() sets out:
           * scopes because a reconnection may grant a different set, and
           * `revokedAt: null` because a row carrying a live token AND a
           * revocation date says two contradictory things.
           */
          set: { tokenRef: sealed, scopes: input.scopes, expiresAt, revokedAt: null },
        })
    })
  } catch (error) {
    if (error instanceof EtsyConnectionError) throw error

    const code = pgCode(error)
    /*
     * The race the SELECT above cannot win. Two concurrent callbacks for one
     * Etsy shop: both find nothing taken, both update, and the second one hits
     * the unique index. It gets the same refusal as the checked case, so the
     * caller has one branch rather than two.
     */
    if (code === UNIQUE_VIOLATION) throw new EtsyConnectionError('ETSY_SHOP_TAKEN')
    if (code === FOREIGN_KEY_VIOLATION) throw new EtsyConnectionError('SHOP_UNKNOWN')

    /*
     * NOTHING ELSE IS RE-THROWN AS IT CAME. Drizzle's message is the SQL plus
     * the bound parameters, and one of those parameters is the sealed token —
     * so re-throwing would put a sealed credential into every log line
     * recording `error.message`. Same finding, same handling, as
     * DatabaseTokenStore. The SQLSTATE is enough to diagnose and is not a
     * secret.
     */
    throw new AppError({
      kind: 'EXTERNAL_SERVICE',
      code: 'ETSY_CONNECTION_WRITE_FAILED',
      message: 'The Etsy connection could not be saved.',
      recovery: 'Try connecting again in a moment. Nothing was changed.',
      retryable: true,
      context: { shopId: input.shopId, sqlstate: code },
    })
  }
}
