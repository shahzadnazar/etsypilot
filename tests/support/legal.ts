import * as schema from '@/db/schema'
import { getDb } from '@/lib/db'
import { setLegalDocumentsForTests } from '@/lib/legal/documents'
import { applicationTermsVersion } from '@/domain/legal/acceptance'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   WHY NEARLY EVERY INTEGRATION SUITE NEEDS THIS.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Etsy's API Terms §4 requires executed Application Terms with each seller, so
 * domain/sync/listings.ts and domain/sync/orders.ts now refuse unless the shop
 * has accepted the documents as they currently stand — and the real documents
 * still carry `[[LEGAL_ENTITY]]`, which means NOTHING can sync on this
 * deployment at all.
 *
 * That is the correct behaviour and it broke 101 integration tests the moment
 * it landed. The honest fix is not to soften the gate — "if the documents are
 * unfinished, read Etsy data freely" is precisely backwards — but to let a
 * suite set up the world it is actually testing: a seller with an agreement in
 * place, which is the only state in which a sync happens in production.
 *
 * So a suite that is about orders, or costs, or the action centre calls
 * `acceptTermsFor(...)` once in beforeAll, and goes on testing what it is
 * about. The gate itself is proved elsewhere, at both ends:
 *
 *   tests/unit/legal-acceptance.test.ts     where the gate sits, in the code
 *   tests/integration/terms-acceptance.int.ts  that sync refuses without a
 *                                              record and succeeds with one
 */

/** A finished document: no placeholders, so it may be accepted. */
function finished(title: string): string {
  return [
    `# EtsyPilot — ${title}`,
    '',
    'Last updated: 2026-10-09',
    '',
    `A complete ${title} with no unfilled placeholders, used by the integration`,
    'suites so a shop can hold an executed agreement and therefore sync.',
    '',
  ].join('\n')
}

/**
 * Put a finished pair of documents in place and record acceptance for each shop.
 *
 * Returns the version that was accepted, so a caller can assert against it or
 * record a stale one deliberately.
 */
export async function acceptTermsFor(shopIds: string[], userId: string): Promise<string> {
  setLegalDocumentsForTests({
    terms: finished('Terms of Service'),
    privacy: finished('Privacy Policy'),
  })

  const version = applicationTermsVersion()
  if (shopIds.length > 0) {
    await getDb()
      .insert(schema.termsAcceptances)
      .values(
        shopIds.map((shopId) => ({
          id: `ta-test-${shopId}-${version.slice(0, 8)}`,
          shopId,
          userId,
          version,
          documents: [],
        })),
      )
      .onConflictDoNothing()
  }
  return version
}

/** Back to the real documents on disk. */
export function restoreRealLegalDocuments(): void {
  setLegalDocumentsForTests(null)
}
