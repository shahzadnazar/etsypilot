import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'

import { posixJoin } from '../support/paths'
import { code } from '../support/shop-scoping'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   ETSY'S API TERMS §4: "EXECUTED APPLICATION TERMS WITH EACH ETSY SELLER."
 *   A FOOTER LINK IS NOT AN EXECUTED AGREEMENT, AND THE PENALTY IS NAMED:
 *   "API ACCESS BEING SUSPENDED OR TERMINATED."
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Five properties, each of which can break silently, and each of which would
 * break the warranty the product gives Etsy rather than merely annoying a
 * seller:
 *
 *   1. The gate is server-side, on every path to Etsy data.
 *   2. It cannot be reached by going straight to the OAuth callback.
 *   3. The version is a content hash, so a material change re-asks by itself.
 *   4. The record is append-only.
 *   5. Nobody can be asked to accept a document with a blank in it.
 *
 * All five are checked by reading the code, because all five are properties of
 * where a call sits rather than of what a function returns — and a test that
 * mocked its way to "the gate was called" would pass with the gate in the UI.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = posixJoin(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('the gate sits where Etsy data moves', () => {
  it('refuses in the connect route before a PKCE verifier is minted', () => {
    const route = code('app/api/etsy/connect/route.ts')

    expect(route, 'the connect route does not check acceptance').toMatch(
      /hasAcceptedCurrentTerms/,
    )
    expect(route, 'the connect route does not check that the terms can be accepted at all').toMatch(
      /termsAreOfferable/,
    )

    /*
     * BEFORE createPkcePair. Not a style point: a verifier in a cookie is what
     * makes the callback exchangeable, so a gate after it would hand out the
     * very thing that lets the flow complete.
     */
    /*
     * The CALL SITES, not the imports. indexOf('createPkcePair') finds the
     * import line, which is above everything and makes this assertion
     * meaningless — found by it failing against a route where the gate was
     * plainly in the right place.
     */
    const gateAt = route.indexOf('await hasAcceptedCurrentTerms(')
    const pkceAt = route.indexOf('createPkcePair()')
    expect(pkceAt).toBeGreaterThan(-1)
    expect(gateAt, 'the acceptance gate runs after the PKCE pair is created').toBeLessThan(pkceAt)
  })

  it('refuses in the callback before the authorisation code is exchanged', () => {
    /*
     * ── THE "STRAIGHT TO THE CALLBACK" QUESTION ──────────────────────────
     *
     * Two things stop it. The structural one is PKCE: the callback already
     * refuses without the flow cookie, only the connect route writes it, and
     * the connect route now refuses before minting a verifier. The explicit
     * one is this check, which also covers the case the structural one does
     * not — the documents changing while a flow is in the air.
     */
    const route = code('app/api/etsy/callback/route.ts')
    expect(route).toMatch(/hasAcceptedCurrentTerms/)

    // Call sites, not imports — see the connect route's test above.
    const gateAt = route.indexOf('await hasAcceptedCurrentTerms(')
    const exchangeAt = route.indexOf('await exchangeCode({')
    expect(exchangeAt).toBeGreaterThan(-1)
    expect(gateAt, 'the callback exchanges the code before checking acceptance').toBeLessThan(
      exchangeAt,
    )

    // And the structural half is still in place: no flow cookie, no exchange.
    expect(route).toMatch(/readFlowCookie/)
    expect(route).toMatch(/if \(!flow\) return done\('expired'\)/)
  })

  it('refuses in both sync entry points, which is the "or sync" half of §4', () => {
    for (const file of ['domain/sync/listings.ts', 'domain/sync/orders.ts']) {
      const source = code(file)
      expect(source, `${file} syncs Etsy data without checking the agreement`).toMatch(
        /assertTermsAccepted\(/,
      )
    }
  })

  it('is not only in the UI', () => {
    /*
     * The checkbox is a claim about what a browser rendered. Every gate above
     * is in a route handler or a domain function; this asserts the component
     * holds no authority — it must not be the only thing standing between a
     * seller and a connection.
     */
    const panel = code('components/legal/accept-terms.tsx')
    expect(panel, 'the acceptance panel writes').not.toMatch(/appendTermsAcceptance|getDb\(/)
    expect(panel, 'the acceptance panel posts to a server route').toMatch(
      /action="\/api\/legal\/accept"/,
    )
  })

  it('refuses a public demo visitor in the domain', () => {
    const domain = code('domain/legal/acceptance.ts')
    expect(domain).toMatch(/assertNotPublicVisitor\(/)

    const gateAt = domain.indexOf('assertNotPublicVisitor')
    const writeAt = domain.indexOf('appendTermsAcceptance({')
    expect(writeAt).toBeGreaterThan(-1)
    expect(gateAt).toBeLessThan(writeAt)
  })
})

describe('the version is a fact about the documents', () => {
  it('is a hash of their content, not a number somebody has to bump', () => {
    const domain = code('domain/legal/acceptance.ts')
    expect(domain).toMatch(/createHash\('sha256'\)/)
    /*
     * No version constant anywhere. A `TERMS_VERSION = 3` would have to be
     * incremented by whoever edits the markdown, and a lawyer correcting a
     * clause has no reason to think about a constant in a TypeScript file —
     * which is precisely the failure mode the content hash removes.
     */
    expect(domain, 'a hand-maintained version constant has appeared').not.toMatch(
      /TERMS_VERSION\s*=\s*['"\d]/,
    )
  })

  it('changes when either document changes, which is what re-asks the seller', () => {
    /*
     * Computed the same way the domain does, over the real files, then again
     * with one character changed. Reproducing the formula here is deliberate:
     * importing the function would test that it agrees with itself, and what
     * matters is that the hash is over the published text.
     */
    const files = {
      terms: 'docs/legal/TERMS-OF-SERVICE-DRAFT.md',
      privacy: 'docs/legal/PRIVACY-POLICY-DRAFT.md',
    }
    const version = (overrides: Partial<Record<keyof typeof files, string>> = {}) => {
      const parts = (Object.keys(files) as (keyof typeof files)[])
        .map((slug) => {
          const raw = overrides[slug] ?? readFileSync(files[slug], 'utf8')
          return `${slug}:${createHash('sha256').update(raw).digest('hex')}`
        })
        .sort()
        .join('\n')
      return createHash('sha256').update(parts).digest('hex')
    }

    const now = version()
    expect(now).toMatch(/^[0-9a-f]{64}$/)
    expect(version(), 'the version is not stable across two reads').toBe(now)

    const edited = `${readFileSync(files.privacy, 'utf8')}\nA new clause.`
    expect(
      version({ privacy: edited }),
      'editing the Privacy Policy does not change the version a seller must accept',
    ).not.toBe(now)
  })

  it('covers both documents, because the Application Terms are both', () => {
    const domain = code('domain/legal/acceptance.ts')
    expect(domain).toMatch(/legalDocuments\(\)/)
    // Not just the Terms: §4 asks for terms covering what is collected and how
    // it is stored and disclosed, and that is the Privacy Policy's half.
    expect(code('lib/legal/documents.ts')).toMatch(/privacy:/)
  })
})

describe('the acceptance record is append-only', () => {
  const repo = 'lib/repositories/terms-acceptances.ts'

  it('exports one append and no editor', () => {
    const source = code(repo)
    expect(source).toMatch(/export async function appendTermsAcceptance/)
    expect(source, 'the acceptance repository can update a row').not.toMatch(
      /\.update\(schema\.termsAcceptances/,
    )
    expect(source, 'the acceptance repository can delete a row').not.toMatch(
      /\.delete\(schema\.termsAcceptances/,
    )
    /*
     * onConflictDoNothing and NOT onConflictDoUpdate. An update here would
     * move the date of an agreement, which is the one field whose whole value
     * is that it cannot be moved.
     */
    expect(source).toMatch(/onConflictDoNothing/)
    expect(source, 'a repeat accept updates the row instead of no-opping').not.toMatch(
      /onConflictDoUpdate/,
    )
  })

  it('and nothing anywhere else edits or deletes one', () => {
    const files = [...walk('domain'), ...walk('app'), ...walk('lib')]
    // A sweep over nothing passes perfectly.
    expect(files.length).toBeGreaterThan(100)

    const offenders = files.filter((file) =>
      /(update|delete)\(\s*schema\.termsAcceptances/.test(code(file)),
    )
    expect(offenders, 'something in the product edits or deletes an acceptance').toEqual([])
  })

  it('arrives with row-level security, like every other table', () => {
    const migration = readFileSync(
      'db/migrations/0015_application_terms_acceptance.sql',
      'utf8',
    )
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS "terms_acceptances"/)
    expect(migration).toMatch(/ALTER TABLE "terms_acceptances" ENABLE ROW LEVEL SECURITY/)
    // The self-check, so the migration cannot succeed quietly with RLS off.
    expect(migration).toMatch(/RAISE EXCEPTION/)
    // And the unique index that makes a repeat accept a no-op rather than a row.
    expect(migration).toMatch(/terms_acceptances_shop_user_version_idx/)
  })
})

describe('nobody can be asked to accept a blank', () => {
  it('refuses to offer the agreement while a placeholder remains', () => {
    const domain = code('domain/legal/acceptance.ts')
    expect(domain).toMatch(/export function assertTermsOfferable/)
    expect(domain).toMatch(/termsNotPublished/)

    // In recordTermsAcceptance, before the write.
    const recordAt = domain.indexOf('export async function recordTermsAcceptance')
    const body = domain.slice(recordAt)
    const assertAt = body.indexOf('assertTermsOfferable()')
    const writeAt = body.indexOf('appendTermsAcceptance')
    expect(assertAt).toBeGreaterThan(-1)
    expect(assertAt, 'an acceptance can be written while the documents are drafts').toBeLessThan(
      writeAt,
    )
  })

  it('and the route refuses before it reads the form', () => {
    const route = code('app/api/legal/accept/route.ts')
    const offerableAt = route.indexOf('termsAreOfferable()')
    const formAt = route.indexOf('request.formData()')
    expect(offerableAt).toBeGreaterThan(-1)
    expect(offerableAt).toBeLessThan(formAt)
  })

  it('takes an explicit tick, and the box is not pre-ticked', () => {
    const panel = code('components/legal/accept-terms.tsx')
    expect(panel).toMatch(/type="checkbox"/)
    expect(panel, 'the consent checkbox is pre-ticked').not.toMatch(/defaultChecked/)
    expect(panel, 'the consent checkbox is not required').toMatch(/required/)

    // And the server does not forgive an unticked box.
    const route = code('app/api/legal/accept/route.ts')
    expect(route).toMatch(/form\.get\('accept'\) !== 'on'/)
  })

  it('does not take a version from the request', () => {
    /*
     * A version a caller could supply is an acceptance of a document nobody
     * published. The route reads the checkbox and the session, and nothing
     * else.
     */
    const route = code('app/api/legal/accept/route.ts')
    expect(route, 'the accept route reads a version from the request').not.toMatch(
      /form\.get\('version'\)|searchParams\.get\('version'\)/,
    )
  })
})

describe('the test seam cannot be reached from the product', () => {
  /*
   * `setLegalDocumentsForTests` exists because the Application Terms gate
   * broke 101 integration tests the moment it landed: almost every suite
   * syncs a shop, and syncing refuses while the real documents carry
   * `[[LEGAL_ENTITY]]`. The honest fix was to let a suite set up the world it
   * is testing — a seller with an agreement — rather than to soften the gate.
   *
   * A function that can replace the published legal documents is also the
   * last thing that should be callable from a request, so: it throws outside
   * NODE_ENV=test, and nothing in app/, domain/ or lib/ calls it.
   */
  it('refuses outside the test environment', () => {
    const loader = code('lib/legal/documents.ts')
    expect(loader).toMatch(/process\.env\.NODE_ENV !== 'test'/)
    expect(loader).toMatch(/must not be called at runtime/)
  })

  it('is called by no product code', () => {
    const callers = [...walk('app'), ...walk('domain'), ...walk('lib')].filter(
      (file) =>
        file !== 'lib/legal/documents.ts' && code(file).includes('setLegalDocumentsForTests'),
    )
    expect(callers, 'product code calls the legal-document test seam').toEqual([])
  })

  it('and the suites that use it put a real acceptance row in the table', () => {
    /*
     * The helper does not stub the gate out — it records an acceptance the
     * same way the route does, so the suites run against the real check.
     */
    const helper = code('tests/support/legal.ts')
    expect(helper).toMatch(/insert\(schema\.termsAcceptances\)/)
    expect(helper).toMatch(/applicationTermsVersion\(\)/)
  })
})

describe('demo mode is unchanged by any of this', () => {
  it('the gate returns before touching a database in demo mode', () => {
    const domain = code('domain/legal/acceptance.ts')
    const fn = domain.slice(domain.indexOf('export async function assertTermsAccepted'))
    const demoAt = fn.indexOf('isDemoMode()')
    const readAt = fn.indexOf('shopHasAcceptedVersion')
    expect(demoAt).toBeGreaterThan(-1)
    expect(demoAt, 'the gate reads the database before checking demo mode').toBeLessThan(readAt)
  })

  it('the shop connections screen asks nothing of a demo visitor', () => {
    /*
     * A demo shop has no Etsy connection, no OAuth token and no seller, so
     * there is nobody for an agreement to be with — and `acceptanceStatus`
     * would query a database a demo deployment does not have. The panel is
     * therefore live-mode only, which is also what keeps the demo screens
     * looking exactly as they did.
     */
    const page = code('app/(dashboard)/settings/shops/page.tsx')
    expect(page).toMatch(/isDemoMode\(\) \? null : await acceptanceStatus\(/)
  })
})
