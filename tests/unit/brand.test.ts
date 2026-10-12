import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'

import { posixJoin } from '../support/paths'
import { code } from '../support/shop-scoping'
import {
  CONTACT,
  PRODUCT_MONOGRAM,
  PRODUCT_NAME,
  PRODUCT_NAME_ARTICLE,
  PRODUCT_SLUG,
  contactAddress,
  hasContactAddress,
} from '@/lib/brand'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE RENAME GUARDS. ONE FOR THE OLD NAME, ONE FOR THE ARTICLE, ONE FOR
 *   ADDRESSES THAT DO NOT ROUTE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Renaming the product touched 138 files and broke three different things
 * that no test was watching:
 *
 *   1. The old name survives somewhere nobody greps — a filename, an
 *      aria-label, a rewrite target, an add-on id.
 *   2. The ARTICLE in front of the name flips. The name before this one
 *      opened with a vowel sound and this one does not, so every "an" in
 *      front of it had to become "a". The rename before this left the
 *      mirror image of that error standing in the Terms for two months, and
 *      this one recreated it in eight places — including inside the guard
 *      meant to catch it, whose own expectation a find-and-replace rewrote
 *      into nonsense. Neither broken spelling, and neither old name, is
 *      written out anywhere in this file: a guard that matches its own
 *      documentation gets switched off rather than fixed.
 *   3. An email address gets renamed to a new domain nobody has bought, and
 *      a privacy page goes on telling sellers to write to a mailbox that does
 *      not exist.
 *
 * None of the three is a logic error, so none of them shows up in a suite
 * about behaviour. They are checked here, by reading the tree.
 */

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '__pycache__',
  // Generated from extension/src and extension/manifest.*.json.
  'dist',
  'build',
])

/*
 * ── WHAT IS DELIBERATELY NOT SWEPT ───────────────────────────────────────
 *
 * History. A dated record of what was decided, or an artefact received from
 * somebody, must keep saying what it said — a decision log edited to say the
 * opposite is worse than no log. These are the files the rename deliberately
 * left alone, and this list is the record of that judgement.
 */
const HISTORY = [
  'memory.md', // dated phase log; its H1 is current and was renamed
  'docs/DECISIONS.md', // dated owner decisions; ditto
  'docs/PHASE-0-AUDIT.md', // a dated snapshot, closed
  'docs/SECURITY-REVIEW.md', // a dated review, closed
  'docs/source/handoff/', // artefacts received from the designer
  'db/migrations/', // applied migrations are never edited
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = posixJoin(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const TEXT = /\.(ts|tsx|js|mjs|json|css|svg|html|md|py|sql)$/

function liveFiles(): string[] {
  return walk('.')
    .map((f) => f.replace(/^\.\//, ''))
    .filter((f) => TEXT.test(f))
    .filter((f) => !HISTORY.some((h) => (h.endsWith('/') ? f.startsWith(h) : f === h)))
}

describe('the product has one name, and the tree agrees on it', () => {
  const files = liveFiles()

  it('finds the files it is meant to be checking', () => {
    // A sweep over nothing passes every assertion below perfectly.
    expect(files.length).toBeGreaterThan(200)
    expect(files).toContain('app/layout.tsx')
    expect(files).toContain('components/marketing/sections.tsx')
  })

  it('carries no trace of the previous name outside the files kept as history', () => {
    /*
     * The old name is written in pieces so this guard does not match itself —
     * a file that trips its own check gets switched off rather than fixed.
     */
    const previous = ['Etsy', 'Pilot'].join('')
    const offenders = files.filter((file) =>
      new RegExp(previous, 'i').test(readFileSync(file, 'utf8')),
    )
    expect(
      offenders,
      'the previous product name survives here; rename it, or add the file to HISTORY above with a reason',
    ).toEqual([])
  })

  it('takes the right article everywhere, which is the part no behaviour test sees', () => {
    const wrong = PRODUCT_NAME_ARTICLE === 'a' ? 'an' : 'a'
    const pattern = new RegExp(`\\b${wrong} ${PRODUCT_NAME}\\b`)

    const offenders: string[] = []
    for (const file of files) {
      // This file names the broken form in prose above; skip its own text.
      if (file === 'tests/unit/brand.test.ts') continue
      const text = readFileSync(file, 'utf8').replace(/\s+/g, ' ')
      if (pattern.test(text)) offenders.push(file)
    }

    expect(
      offenders,
      `"${wrong} ${PRODUCT_NAME}" is wrong — the name takes "${PRODUCT_NAME_ARTICLE}". Change lib/brand.ts if that is no longer true.`,
    ).toEqual([])
  })

  it('and the article constant matches the name it describes', () => {
    // A positive control: if someone renames the product and forgets this
    // constant, the sweep above silently checks for the wrong thing.
    expect(['a', 'an']).toContain(PRODUCT_NAME_ARTICLE)
    expect(PRODUCT_SLUG).toBe(PRODUCT_NAME.toLowerCase())
  })
})

describe('the identity surfaces read the name rather than spelling it', () => {
  /*
   * Not every mention — 376 of them are prose, and lib/brand.ts says at
   * length why interpolating those would hide the article problem rather than
   * solve it. These are the surfaces where the name appears AS THE BRAND, and
   * where a second rename should not require a human to find them again.
   */
  const SURFACES = [
    'components/layout/sidebar.tsx',
    'components/layout/mobile-top-bar.tsx',
    'app/(public)/layout.tsx',
    'app/layout.tsx',
    'components/admin/operator-banner.tsx',
    'components/admin/operator-sidebar.tsx',
    'components/admin/operator-title.tsx',
    'middleware.ts',
  ]

  it('each one imports the brand module', () => {
    for (const file of SURFACES) {
      expect(code(file), `${file} does not read the product name from lib/brand`).toMatch(
        /from '@\/lib\/brand'/,
      )
    }
  })

  it('and none of them spells the name out instead', () => {
    for (const file of SURFACES) {
      expect(code(file), `${file} hardcodes the product name`).not.toContain(PRODUCT_NAME)
    }
  })

  it('the monogram is the one the brand module derives, in all five places', () => {
    /*
     * Two letters that are not the word, so a grep for the old name finds
     * none of them. It read "EP" beside the word CobaltRank until somebody
     * looked at the sidebar.
     */
    for (const file of [
      'app/(public)/layout.tsx',
      'components/layout/sidebar.tsx',
      'components/layout/mobile-top-bar.tsx',
    ]) {
      expect(code(file), `${file} does not render the monogram from lib/brand`).toContain(
        '{PRODUCT_MONOGRAM}',
      )
    }

    // The two that cannot import it.
    expect(readFileSync('app/icon.svg', 'utf8')).toContain(`>${PRODUCT_MONOGRAM}</text>`)
    expect(readFileSync('extension/popup.html', 'utf8')).toContain(
      `>${PRODUCT_MONOGRAM}</span>`,
    )
  })

  it('the tab icon’s accessible name is the product name', () => {
    /*
     * app/icon.svg is a static file and cannot import anything, so this is
     * the only thing holding it to the rest. It is the browser tab's
     * accessible name, which is the one place the brand is announced to
     * somebody who cannot see it.
     */
    const svg = readFileSync('app/icon.svg', 'utf8')
    expect(svg).toContain(`aria-label="${PRODUCT_NAME}"`)
  })

  it('the package and the extension agree with the slug and the name', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { name: string }
    expect(pkg.name).toBe(PRODUCT_SLUG)

    for (const manifest of ['extension/manifest.chrome.json', 'extension/manifest.firefox.json']) {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as {
        name: string
        description: string
      }
      expect(parsed.name, `${manifest} does not carry the product name`).toContain(PRODUCT_NAME)
      expect(parsed.description).toContain(PRODUCT_NAME)
    }
  })
})

describe('no surface prints a contact address that does not route', () => {
  /*
   * ══════════════════════════════════════════════════════════════════════════
   *   THE PART OF THIS THAT IS NOT ABOUT RENAMING.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * The landing page, the FAQ and Settings → Export & deletion all printed
   * `privacy@<domain>`. No domain has been bought. Privacy §6 tells a seller
   * that emailing that address is the ONLY way to exercise a deletion right,
   * so the address was not a typo — it was the remedy for a right, that does
   * not work, on the pages whose job is to be honest about what this product
   * can do.
   *
   * The addresses are null in lib/brand.ts and every surface omits rather
   * than invents. This fails if one creeps back.
   */
  it('has no address-shaped literal in rendered copy', () => {
    const rendered = liveFiles().filter(
      (f) =>
        (f.startsWith('app/') || f.startsWith('components/') || f.startsWith('domain/')) &&
        /\.tsx?$/.test(f),
    )
    expect(rendered.length).toBeGreaterThan(50)

    /*
     * A CONTACT address, not every `@` in the tree. The first version of this
     * flagged `you@yourshop.com` — the placeholder text in the waitlist
     * input — and the demo seller's address in the demo fixture, neither of
     * which claims to be a way of reaching us. What this is about is a
     * mailbox the product tells a seller to write to, so it matches on the
     * local part, plus anything at the product's own domain.
     */
    const MAILBOX = /\b(privacy|support|hello|contact|legal|dpo|help|info|abuse|admin)@[a-z0-9-]+\.[a-z]{2,}/gi
    const OWN_DOMAIN = new RegExp(`[a-z0-9._-]+@[a-z0-9-]*${PRODUCT_SLUG}[a-z0-9-]*\\.[a-z]{2,}`, 'gi')

    const offenders: string[] = []
    for (const file of rendered) {
      // Comments may discuss an address; rendered strings may not contain one.
      const text = code(file)
      const found = [...(text.match(MAILBOX) ?? []), ...(text.match(OWN_DOMAIN) ?? [])]
      // A placeholder in a legal document is a marked blank, not an address.
      const real = [...new Set(found)].filter((a) => !a.includes('[['))
      if (real.length > 0) offenders.push(`${file}: ${real.join(', ')}`)
    }

    expect(
      offenders,
      'a contact address is hardcoded in rendered copy; put it in lib/brand.ts and omit the line when it is null',
    ).toEqual([])
  })

  it('and both addresses are genuinely unset today, so the omission paths are the live ones', () => {
    /*
     * The anti-vacuity check. Every assertion above is trivially satisfied by
     * a product that simply has no addresses; this says so out loud, and
     * turns red on the day somebody sets one — which is the day to re-read
     * the three surfaces and check the other branch renders properly.
     */
    expect(CONTACT.privacy, 'a privacy address is set — re-read the three omit branches').toBeNull()
    expect(CONTACT.support).toBeNull()
    expect(hasContactAddress('privacy')).toBe(false)
    expect(contactAddress('support')).toBeNull()
  })

  it('the three surfaces that used to print one still say what is true', () => {
    const marketing = code('components/marketing/sections.tsx')
    expect(marketing).toMatch(/contactAddress\('privacy'\)/)
    expect(marketing).toMatch(/hasContactAddress\('support'\)/)
    expect(
      marketing,
      'the landing page no longer explains that deletion has no route yet',
    ).toMatch(/not published yet/)

    const exportPage = code('app/(dashboard)/settings/export/page.tsx')
    expect(exportPage).toMatch(/contactAddress\('privacy'\)/)
    expect(exportPage, 'the deletion panel no longer says there is no route').toMatch(
      /no way to request deletion yet/i,
    )
  })
})
