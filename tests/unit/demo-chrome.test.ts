import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { posixJoin } from '../support/paths'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   TWO QUESTIONS, AND THE CHROME MUST NOT GO BACK TO ANSWERING BOTH WITH
 *   ONE FLAG.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   "Am I being served the fictional catalogue?"   ETSY_MODE / isDemoMode()
 *   "Has this shop ever connected to Etsy?"        shops.is_demo
 *
 * Both were `session.isDemo`. On a live deployment every new signup carries
 * `is_demo = true` — domain/sync/source.ts says so and keys the DATA path on
 * the mode for exactly this reason — so the chrome told real sellers they were
 * "exploring Willow & Fern, a fictional shop" while serving them none of it,
 * beside a chip reading "My demo shop" from their own row. One screen, one
 * shop, two names.
 *
 * ── WHY STATIC, AND WHAT THE BROWSER DOES INSTEAD ─────────────────────────
 *
 * There is no component-rendering harness in this repo, so the four
 * combinations of ETSY_MODE and is_demo are checked in a browser by setting
 * two variables. What a browser cannot do is fail for a regression in a mode
 * nobody ran: the demo suites all run with ETSY_MODE=mock, where the two flags
 * AGREE — so swapping the chrome back to `session.isDemo` would leave every
 * browser suite green. That is what this file is for.
 */

const PAGES = 'app/(dashboard)'

/** Source with comments removed, or the prose above would satisfy the sweep. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = posixJoin(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('the banner asks about the data, not about the shop row', () => {
  const layout = code('app/(dashboard)/layout.tsx')

  it('passes the MODE as demoData and the SHOP ROW as connected', () => {
    expect(layout, 'the shell no longer gets the mode').toMatch(/demoData=\{isDemoMode\(\)\}/)
    expect(layout, 'the shell no longer gets the connection').toMatch(
      /connected=\{!session\.isDemo\}/,
    )
    // The positive control: this is the file that mounts the shell.
    expect(layout).toMatch(/<AppShell/)
  })

  it('does not hand session.isDemo to the shell under any name', () => {
    /*
     * The regression this file exists for. `isDemo={session.isDemo}` is the
     * line that was there, and any revival of it — under the old prop or the
     * new one — puts the fictional-shop sentence back on real accounts.
     */
    expect(layout).not.toMatch(/isDemo=\{/)
    expect(layout).not.toMatch(/demoData=\{session\.isDemo\}/)
  })
})

describe('the D11 provenance override asks the mode', () => {
  /*
   * D11's own words: the Demo chip replaces the badge "so a screenshot taken
   * in demo mode can never be mistaken for a real shop's figures". That is a
   * claim about whether the FIGURES are the fictional catalogue, which is the
   * mode — and it was `session.isDemo`, so every figure on a live deployment's
   * new signup was stamped Demo, and the stamp would then vanish on connection,
   * which is exactly when it would matter if it were true.
   */
  const pages = walk(PAGES).filter((file) => !file.endsWith('layout.tsx'))

  it('finds the pages at all', () => {
    // A sweep over an empty list passes every assertion below perfectly.
    expect(pages.length).toBeGreaterThan(15)
  })

  it('never passes session.isDemo as a demo prop', () => {
    for (const file of pages) {
      const source = code(file)
      expect(source, `${file} stamps badges from the shop row`).not.toMatch(
        /demo=\{session\.isDemo\}/,
      )
      expect(source, `${file} aliases the shop row as a demo flag`).not.toMatch(
        /const demo\w* = session\.isDemo/,
      )
    }
  })

  it('and the pages that render badges ask isDemoMode instead', () => {
    /*
     * The converse. Without it, deleting every `demo` prop in the app would
     * satisfy the assertion above — and the D11 override would be gone rather
     * than corrected.
     */
    const asking = pages.filter((file) => code(file).includes('const demoData = isDemoMode()'))
    expect(asking.length, 'no page asks the mode').toBeGreaterThan(15)

    for (const file of asking) {
      expect(code(file), `${file} computes demoData and never uses it`).toMatch(/demoData[,}\s)]/)
    }
  })
})

describe('the banner does not name a fixture it cannot know', () => {
  const banner = code('components/layout/demo-banner.tsx')

  it('takes the shop name rather than hardcoding one', () => {
    /*
     * "Willow & Fern" was a literal in a layout component. It was
     * unfalsifiable while the banner could render for any shop; now the banner
     * renders the fictional-data variant only when the mock IS the adapter, so
     * the name is knowable — and it comes from the same place the chip gets
     * it, so the two cannot disagree. They already did: the chip read
     * "Willow & Fern Studio" and the banner "Willow & Fern".
     */
    expect(banner, 'a fixture name is hardcoded in the chrome').not.toMatch(/Willow/)
    expect(banner).toMatch(/shopName/)
  })

  it('has a state for a live shop that has never connected, with its own words', () => {
    expect(banner).toMatch(/NOT_CONNECTED/)
    // And it must not claim fictional data in that state.
    const notConnected = banner.slice(banner.indexOf('function NotConnectedBanner'))
    expect(notConnected).not.toMatch(/fictional/)
    expect(notConnected).toMatch(/not connected to Etsy yet/i)
    // The demo variant keeps saying it, because there it is true.
    expect(banner.slice(0, banner.indexOf('function NotConnectedBanner'))).toMatch(/fictional/)
  })
})
