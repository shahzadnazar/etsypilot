import { describe, expect, it } from 'vitest'

import { code } from '../support/shop-scoping'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   EVERY RESEARCH PAGE SAYS WHERE ITS NUMBERS CAME FROM, TWICE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The Keywords page set the standard in its own comment: "Every figure on
 * this page is modelled. Nothing here is Etsy data, and the page says so
 * twice: once in the subtitle, once in the 'How this data works' panel."
 *
 * Four pages did not. A reviewer opening Compare shops had to infer where the
 * numbers came from — and the worst of it was a ProvenanceBadge reading
 * VERIFIED over a modelled listing count, captioned "Counted from public shop
 * pages". Nothing counts anything off any page: lib/signals has one
 * implementation and it is a mock.
 *
 * Why a test and not a convention: "make the other four match" decays the
 * moment a fifth page is added by somebody who never read this. The sweep
 * below finds the pages rather than listing them.
 */

const RESEARCH_PAGES = [
  'app/(dashboard)/research/keywords/page.tsx',
  'app/(dashboard)/research/opportunities/page.tsx',
  'app/(dashboard)/research/niche/page.tsx',
  'app/(dashboard)/research/competitors/page.tsx',
  'app/(dashboard)/research/keyword-lists/page.tsx',
]

describe('the Research section says what its figures are', () => {
  it('finds every research page, including any added since', () => {
    /*
     * The anti-vacuity check, and it is the one that matters here: a hardcoded
     * list goes stale silently, so the list is compared against the directory.
     */
    const { readdirSync } = require('node:fs') as typeof import('node:fs')
    const onDisk = readdirSync('app/(dashboard)/research')
      .map((d) => `app/(dashboard)/research/${d}/page.tsx`)
      .sort()
    expect(onDisk).toEqual([...RESEARCH_PAGES].sort())
    expect(onDisk.length).toBe(5)
  })

  it('renders the shared provenance panel on every one', () => {
    for (const page of RESEARCH_PAGES) {
      const source = code(page)
      const hasShared = source.includes('<ModelledNotice')
      const hasOwn = source.includes('How this data works')
      expect(
        hasShared || hasOwn,
        `${page} has no "How this data works" panel — a reader has to infer where the numbers came from`,
      ).toBe(true)
    }
  })

  it('says it in the subtitle as well, which is what a reader sees first', () => {
    for (const page of RESEARCH_PAGES) {
      const source = code(page)
      /*
       * From the <PageHeader tag to the end of its subtitle prop. The first
       * version sliced to indexOf('actions'), which is -1 on a header that
       * takes no actions — so the slice was empty and the assertion passed
       * on nothing for any page without that prop. Found by it failing on
       * the one page whose subtitle had just been fixed.
       */
      const at = source.indexOf('<PageHeader')
      const header = source.slice(at, at + 600)
      expect(
        /modelled|no figures on this page/i.test(header),
        `${page}'s subtitle does not say what its figures are`,
      ).toBe(true)
    }
  })

  it('claims nothing is VERIFIED, because nothing on these pages is', () => {
    /*
     * VERIFIED is the strongest word this product has: a figure read from a
     * source that can be pointed at. Compare shops used it for an active
     * listing count that comes from a model, which devalues the badge
     * everywhere else it appears.
     */
    for (const page of RESEARCH_PAGES) {
      expect(
        code(page),
        `${page} stamps a figure VERIFIED; every figure in Research is modelled`,
      ).not.toMatch(/ProvenanceBadge[^>]*type="VERIFIED"/)
    }
  })

  it('and no research page reaches the Etsy adapter for a figure', () => {
    /*
     * Four of the five reach nothing but lib/signals. The fifth, Keyword
     * Lists, reaches domain/research/service.ts, which calls
     * getEtsyService().getShop() once as an existence check and throws the
     * answer away — no figure on that page comes from it, and the page says
     * so in its own panel rather than claiming "nothing here is Etsy data"
     * like the other four.
     *
     * What this pins is that no PAGE imports the adapter directly. If a
     * research page ever starts asking Etsy for content itself, that is the
     * change that needs reading against Prohibited Behavior item 25, and it
     * should not be able to happen quietly.
     */
    for (const page of RESEARCH_PAGES) {
      expect(code(page), `${page} imports the Etsy adapter`).not.toMatch(
        /from '@\/lib\/etsy'[\s\S]{0,40}getEtsyService|getEtsyService\(/,
      )
    }

    const service = code('domain/research/service.ts')
    const calls = [...service.matchAll(/getEtsyService\(\)\.(\w+)/g)].map((m) => m[1])
    expect(
      calls,
      'domain/research/service.ts asks Etsy for something other than the one existence check',
    ).toEqual(['getShop'])
  })
})
