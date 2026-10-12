import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { code } from '../support/shop-scoping'
import { EXTENSION_FLAG, extensionEnabled } from '@/lib/extension/availability'
import { EXTENSION_PATHS, isExtensionPath } from '@/lib/security/extension-route'
import { SETTINGS_NAV, settingsNavFor } from '@/components/layout/navigation'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   ONE SWITCH, SEVEN SURFACES, AND THE FAILURE THAT MATTERS IS HALF-ON.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Etsy's API Terms, Prohibited Behavior item 24, forbids using OR PROMOTING
 * the use of a browser extension to access, analyse or scrape the Etsy Site,
 * the Etsy API or any Etsy data, unless Etsy authorises it in writing. The
 * extension is off until Etsy answers; lib/extension/availability.ts carries
 * the full reasoning.
 *
 * The state to be afraid of is not "off". It is "mostly off": a settings page
 * that 404s while the download route still serves a signed add-on, or a nav
 * entry removed while the top bar still links to it. A reviewer who finds a
 * working download behind a page saying the feature is not offered has found
 * something worse than the feature.
 *
 * So this file checks the surfaces, not the function. `extensionEnabled()`
 * returning false is one line and is not worth a test on its own; what is
 * worth a test is that every place which used to mention the extension still
 * asks.
 */

describe('the switch itself', () => {
  it('is off unless the environment says exactly true', () => {
    const previous = process.env[EXTENSION_FLAG]
    try {
      for (const value of [undefined, '', ' ', 'false', '0', 'yes', 'TRUE ', 'True']) {
        if (value === undefined) delete process.env[EXTENSION_FLAG]
        else process.env[EXTENSION_FLAG] = value
        // 'TRUE ' and 'True' ARE accepted — trimmed and lowercased — so they
        // are listed here to pin that, not to assert they are refused.
        const expected = ['TRUE ', 'True'].includes(value ?? '')
        expect(extensionEnabled(), `${EXTENSION_FLAG}=${JSON.stringify(value)}`).toBe(expected)
      }
      process.env[EXTENSION_FLAG] = 'true'
      expect(extensionEnabled()).toBe(true)
    } finally {
      if (previous === undefined) delete process.env[EXTENSION_FLAG]
      else process.env[EXTENSION_FLAG] = previous
    }
  })

  it('is off in this checkout, which is what every check below assumes', () => {
    /*
     * The anti-vacuity check. Everything below asserts that surfaces ASK the
     * switch; if the switch were on by default here, the browser pass and the
     * grep in the report would be checking a product that still ships it.
     */
    expect(process.env[EXTENSION_FLAG] ?? '').not.toBe('true')
    expect(extensionEnabled()).toBe(false)
  })

  it('is spelled the same way in the build script, which cannot import it', () => {
    /*
     * extension/build.mjs is plain node with no TypeScript loader, so it
     * repeats the flag name as a literal. Two spellings would mean predev
     * packaging an add-on the app says it does not offer.
     */
    const build = readFileSync('extension/build.mjs', 'utf8')
    expect(build).toContain(`const EXTENSION_FLAG = '${EXTENSION_FLAG}'`)
    expect(build, 'the build script does not exit early when the flag is off').toMatch(
      /if \(!enabled\) \{[\s\S]*process\.exit\(0\)/,
    )
  })

  it('is documented in .env.example with the reason', () => {
    const env = readFileSync('.env.example', 'utf8')
    expect(env).toContain(`${EXTENSION_FLAG}=`)
    // Not just the name: the next person needs to know why it is off.
    expect(env).toMatch(/item 24/)
  })
})

describe('every surface that mentions the extension asks the switch', () => {
  /*
   * The list is the audit. A surface added later that names the extension and
   * is not here is exactly the miss this file exists to catch, which is why
   * the last test sweeps for the word rather than trusting this list.
   */
  const SURFACES = [
    'middleware.ts',
    'app/(dashboard)/settings/layout.tsx',
    'components/layout/top-bar.tsx',
    'app/(dashboard)/settings/integrations/page.tsx',
    'app/(dashboard)/settings/security/page.tsx',
    'app/(public)/legal/etsy/page.tsx',
    'app/api/extension/download/[browser]/route.ts',
    'app/api/extension/listing/route.ts',
  ]

  it('reads lib/extension/availability from each one', () => {
    for (const file of SURFACES) {
      expect(code(file), `${file} does not ask whether the extension is offered`).toMatch(
        /extensionEnabled\(\)|settingsNavFor\(/,
      )
    }
  })

  it('hides the page and both routes in middleware, the way /admin is hidden', () => {
    /*
     * "Gone, not disabled." A disabled page still tells a reviewer the
     * feature exists and is switched off; item 24 is about offering it.
     *
     * Rewritten to the no-such-route path, which is the same mechanism that
     * makes /admin a 404 for a seller rather than a 403.
     */
    const middleware = code('middleware.ts')
    expect(middleware).toMatch(/hideExtension/)
    expect(middleware).toMatch(/hideAdminRoute \|\| hideExtension/)
    expect(middleware).toMatch(/NextResponse\.rewrite\(new URL\(NOWHERE/)
  })

  it('covers the page and the API, and nothing it should not', () => {
    expect([...EXTENSION_PATHS].sort()).toEqual(['/api/extension', '/settings/extension'])

    for (const hidden of [
      '/settings/extension',
      '/settings/extension/',
      '/api/extension/listing',
      '/api/extension/download/chrome',
    ]) {
      expect(isExtensionPath(hidden), `${hidden} is not hidden`).toBe(true)
    }

    /*
     * A prefix match with no boundary would take these with it. The last one
     * is the one that matters: a page about extensions in general is not the
     * extension.
     */
    for (const kept of ['/settings', '/settings/export', '/api/export/audit', '/settings/extensions-faq']) {
      expect(isExtensionPath(kept), `${kept} is hidden and should not be`).toBe(false)
    }
  })

  it('takes the entry out of the settings rail rather than greying it', () => {
    const shown = settingsNavFor({ extension: false }).flatMap((g) => g.items)
    expect(shown.some((i) => i.href.startsWith('/settings/extension'))).toBe(false)
    // And puts it back, so this is a switch and not a deletion.
    const withIt = settingsNavFor({ extension: true }).flatMap((g) => g.items)
    expect(withIt.some((i) => i.href === '/settings/extension')).toBe(true)
    // The underlying list is untouched: the page still exists and links.test
    // still checks its href resolves.
    expect(SETTINGS_NAV.flatMap((g) => g.items).some((i) => i.href === '/settings/extension')).toBe(
      true,
    )
  })

  it('leaves no unconditional mention anywhere a seller or a visitor can read', () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   THE SWEEP, because the list above is a memory and this is not.
     * ══════════════════════════════════════════════════════════════════════
     *
     * Any file under app/ or components/ that names the extension must also
     * ask whether it is offered. Comments are stripped first — a file may
     * explain the switch without being gated by it — and the modules that
     * IMPLEMENT the switch are exempt, because a guard that matches its own
     * mechanism gets switched off.
     */
    const exempt = new Set([
      // Holds the entry; settingsNavFor() is what filters it out.
      'components/layout/navigation.ts',
      /*
       * The page itself, and the exemption is forced rather than chosen.
       *
       * It cannot call extensionEnabled() and notFound(), because
       * tests/unit/admin-roles.test.ts forbids notFound() in any seller page
       * — a status decided inside the render boundary can land after a
       * streamed 200 has gone out. So this page is hidden ONLY by the
       * middleware rewrite, exactly as /admin is for a seller, and the test
       * above pins that rewrite in place.
       */
      'app/(dashboard)/settings/extension/page.tsx',
    ])

    const files = [...walkApp('app'), ...walkApp('components')].filter((f) => !exempt.has(f))
    expect(files.length, 'the sweep found no files').toBeGreaterThan(80)

    const offenders = files.filter((file) => {
      const source = code(file)
      if (!/extension/i.test(source)) return false
      return !/extensionEnabled\(\)|settingsNavFor\(/.test(source)
    })

    expect(
      offenders,
      'these name the extension without asking whether it is offered — gate them, or move the mention into a comment',
    ).toEqual([])
  })
})

function walkApp(dir: string, out: string[] = []): string[] {
  const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs')
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`
    if (statSync(full).isDirectory()) walkApp(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}
