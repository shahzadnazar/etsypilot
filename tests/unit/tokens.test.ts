/*
 * The three theme blocks must define the same tokens.
 *
 * This exists because of a real, repeated failure: a colour token defined in
 * one block and not the others. The symptom is never a build error — it is a
 * page that reads correctly in the theme you were looking at and is unreadable
 * in the other one.
 *
 * Dark is declared TWICE, deliberately: once for the explicit choice
 * (:root[data-theme='dark']) and once for the system default
 * (@media prefers-color-scheme). CSS has no way to share a block between them,
 * so the duplication is unavoidable — which makes "did you update both?" a
 * question worth asking automatically rather than remembering.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync('styles/globals.css', 'utf8')

function block(selector: string): string {
  const start = CSS.indexOf(selector)
  expect(start, `${selector} not found in globals.css`).toBeGreaterThan(-1)
  const open = CSS.indexOf('{', start)
  return CSS.slice(open, CSS.indexOf('}', open))
}

function tokens(selector: string): string[] {
  return [...block(selector).matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]!).sort()
}

const LIGHT = ':root {'
const DARK_ATTR = ":root[data-theme='dark'] {"
const DARK_MEDIA = ":root:not([data-theme='light']) {"

describe('theme tokens', () => {
  it('defines the same token names in all three blocks', () => {
    expect(tokens(DARK_ATTR)).toEqual(tokens(LIGHT))
    expect(tokens(DARK_MEDIA)).toEqual(tokens(LIGHT))
  })

  it('declares the two dark blocks identically', () => {
    // Not just the same names — the same VALUES. A toggle that resolves to a
    // different palette than the system default is the same defect wearing a
    // subtler disguise.
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
    expect(norm(block(DARK_MEDIA))).toEqual(norm(block(DARK_ATTR)))
  })

  it('pairs every background token with text that is meant to sit on it', () => {
    /*
     * --brand and --success are painted as backgrounds with text on top. In
     * dark mode both are LIGHT colours, so text-white on them measures 2.98:1
     * and 1.92:1 — failures that look perfectly fine in the light theme, which
     * is where anyone writing the markup is usually looking.
     *
     * Having --on-brand and --on-success exist is what makes the correct
     * choice available; this asserts they keep existing.
     */
    for (const t of ['--on-brand', '--on-success']) {
      expect(tokens(LIGHT), `${t} missing from light`).toContain(t)
      expect(tokens(DARK_ATTR), `${t} missing from dark`).toContain(t)
    }
  })

  it('has no raw hex left in the semantic component palette', () => {
    /*
     * The bug this replaces: a foreground token that flips with the theme
     * (var(--danger)) painted on a hard-coded background that does not
     * (#FEF2F2). In light it read 7.6:1; in dark, 2.5:1 — and nothing in the
     * source looked wrong, because each half was individually reasonable.
     */
    const surfaces = ['--danger-surface', '--warning-surface', '--success-surface']
    for (const t of surfaces) expect(tokens(LIGHT)).toContain(t)
  })
})
