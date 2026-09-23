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

import { describe, expect, it } from 'vitest'
import { posixJoin } from '../support/paths'

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = posixJoin(dir, name)
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
 *
 * It then became a <Link> to Profile, which these tests pinned. It is now a
 * <summary> opening the account menu, because the product had no sign-out at
 * all and that corner is where one belongs. THE ASSERTIONS WERE REWRITTEN, NOT
 * DELETED: every property they defended — interactive, named, big enough to
 * hit — still has a check, and Profile is still reachable, now from inside the
 * menu. A test updated because the shape changed is fine; a test deleted
 * because it went red is how a property quietly stops holding.
 */
describe('the top bar avatar', () => {
  const menu = readFileSync('components/layout/user-menu.tsx', 'utf8')
  const topBar = readFileSync('components/layout/top-bar.tsx', 'utf8')

  it('is an interactive control, not a decorative span', () => {
    expect(topBar).toContain('<UserMenu')
    // <summary> is focusable and activatable by keyboard with no JavaScript.
    expect(menu).toMatch(/<summary[\s\S]*?className=/)
  })

  it('still reaches Profile, now from inside the menu', () => {
    expect(menu).toMatch(/href="\/settings\/profile"/)
  })

  it('carries a name a screen reader can read', () => {
    // Initials are not an accessible name. "SR" tells nobody anything.
    expect(menu).toContain('sr-only')
    expect(menu).toContain('userEmail')
  })

  it('is at least 24px, like every other target', () => {
    const size = menu.match(/className="flex h-(\d+) w-(\d+) cursor-pointer list-none/)
    expect(size).not.toBeNull()
    expect(Number(size![1])).toBeGreaterThanOrEqual(6)
  })
})

/*
 * No button may do nothing when pressed.
 *
 * A seller clicked "Schedule instead" on the bulk editor's review step and
 * nothing happened. There were twenty-four more like it — a dead "Restore" on a
 * dismissed action card whose own comment claimed it "offers Restore rather
 * than being a dead row", a search control commented "Wired in Phase 2" that
 * never was, and a "Schedule instead" inside the publish confirm dialog whose
 * handler closed the dialog and did nothing else. That last one is the worst
 * shape of this bug: it did not fail visibly, so a seller believed their job
 * was queued.
 *
 * A control either works or says why it cannot. NotYet exists for the second
 * case and requires a reason. This stops the first case coming back.
 */
describe('every control does something', () => {
  const files = [...walk('app'), ...walk('components')]

  it('has no button without a handler, a submit type, or a disabled state', () => {
    const dead: string[] = []

    for (const file of files) {
      // Comments first: this file's own prose describes the buttons it forbids.
      const code = readFileSync(file, 'utf8')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')

      for (const match of code.matchAll(/<Button\b[\s\S]*?<\/Button>|<button\b[\s\S]*?<\/button>/g)) {
        const el = match[0]
        const head = el.slice(0, el.indexOf('>') + 1)
        if (/onClick|type="submit"|disabled|formAction|onSelect/.test(head)) continue
        dead.push(`${file}: ${el.replace(/<[^>]+>/g, '').trim().slice(0, 50)}`)
      }
    }

    expect(dead).toEqual([])
  })
})
