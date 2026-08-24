/*
 * Checkboxes are 24px, everywhere, not only where the sweep happened to look.
 *
 * The browser sweep found two 16×16 checkboxes on /settings/notifications and
 * reported those two. Every checkbox in the product was 16×16 — the sweep only
 * visits some routes at mobile width, and on the bulk editor the offending
 * control sits three wizard steps in.
 *
 * "Geometric rules need geometric coverage" is the lesson this file exists for.
 * A source-level check sees every control, including the ones behind a step a
 * crawler never reaches.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (path.endsWith('.tsx')) out.push(path)
  }
  return out
}

/** Tailwind's scale is 0.25rem per step, so h-6 is the first size ≥ 24px. */
const MIN_STEP = 6

describe('WCAG 2.2 SC 2.5.8 — target size', () => {
  const files = [...walk('app'), ...walk('components')]

  it('finds the files it is meant to be checking', () => {
    expect(files.length).toBeGreaterThan(40)
  })

  it('gives every checkbox and radio a 24px box', () => {
    const small: string[] = []

    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      // Each <input ...> element, whole, so the type and the classes are read
      // together rather than by line.
      for (const match of text.matchAll(/<input[\s\S]*?\/>/g)) {
        const el = match[0]
        if (!/type="(checkbox|radio)"/.test(el)) continue
        const size = el.match(/\bh-(\d+)\b/)
        if (!size || Number(size[1]) < MIN_STEP) {
          small.push(`${file}: ${size ? `h-${size[1]}` : 'no height class'}`)
        }
      }
    }

    expect(small).toEqual([])
  })
})

/*
 * The account avatar is a control, not a picture.
 *
 * It was an `aria-hidden` <span> in the top bar — the one element that looked
 * like a control and was not: invisible to a screen reader, inert to a click,
 * and sitting in the corner where every application puts the account.
 */
describe('the top bar avatar', () => {
  const source = readFileSync('components/layout/top-bar.tsx', 'utf8')

  it('is a link with a destination', () => {
    expect(source).toMatch(/<Link[\s\S]*?href="\/settings\/profile"/)
  })

  it('carries a name a screen reader can read', () => {
    // Initials are not an accessible name. "SR" tells nobody anything.
    expect(source).toContain('sr-only')
    expect(source).toContain('userName')
  })

  it('is at least 24px, like every other target', () => {
    const size = source.match(/className="flex h-(\d+) w-(\d+) shrink-0 items-center justify-center rounded-control text-\[11px\]/)
    expect(size).not.toBeNull()
    expect(Number(size![1])).toBeGreaterThanOrEqual(6)
  })
})
