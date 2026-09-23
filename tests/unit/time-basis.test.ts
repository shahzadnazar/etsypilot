/*
 * One time basis, stated the same way everywhere.
 *
 * D24 made UTC the single basis for every calculation and every printed time.
 * The Methodology page's Orders card still said "in your shop time zone" —
 * the pre-D24 answer, left behind by the decision that replaced it, on the one
 * page a seller opens specifically to find out what a period boundary means.
 * Eleven cards said UTC and one did not.
 *
 * A stale sentence is not caught by a type, and it renders perfectly. So it is
 * checked here instead.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { posixJoin } from '../support/paths'
import { METHODOLOGIES } from '@/lib/provenance/methodology'

/*
 * Comments are stripped before asserting on source.
 *
 * The fifth time this project has written a check for the absence of a phrase
 * and had it fail on the comment explaining the phrase's removal — most
 * recently a Tailwind class named in a comment, which Tailwind then re-emitted
 * (D68b). The comment above this file's fix contains the exact string below.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = posixJoin(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (path.endsWith('.tsx') || path.endsWith('.ts')) out.push(path)
  }
  return out
}

/** Phrases that name a time basis this product does not use. */
const OTHER_BASIS = [
  /shop time zone/i,
  /shop['’]s time zone/i,
  /shop timezone/i,
  /your time zone/i,
  /in local time/i,
]

describe('every stated time basis is UTC', () => {
  it('has methodology entries to check', () => {
    // Without this, an empty registry passes the assertion below perfectly.
    expect(Object.keys(METHODOLOGIES).length).toBeGreaterThan(8)
  })

  it('never says a metric is bounded in anything but UTC', () => {
    const offenders: Record<string, string> = {}
    for (const [key, entry] of Object.entries(METHODOLOGIES)) {
      for (const pattern of OTHER_BASIS) {
        if (pattern.test(entry.method)) offenders[key] = entry.method
      }
    }
    expect(offenders).toEqual({})
  })

  it('says so in no user-facing string anywhere else either', () => {
    const files = [...walk('app'), ...walk('components'), ...walk('domain'), ...walk('lib')]
    expect(files.length).toBeGreaterThan(80)

    const offenders: string[] = []
    for (const file of files) {
      const text = stripComments(readFileSync(file, 'utf8'))
      for (const pattern of OTHER_BASIS) {
        if (pattern.test(text)) offenders.push(file)
      }
    }
    expect([...new Set(offenders)]).toEqual([])
  })
})
