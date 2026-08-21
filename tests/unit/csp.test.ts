/*
 * Both branches of the policy, because only one of them was ever exercised.
 *
 * Every browser check in this project runs against a production build, so the
 * development policy shipped for days while blocking Turbopack's dev chunks and
 * every inline style `next dev` injects — an unstyled page and 34 console
 * violations. A pure function is testable without starting either server, which
 * is the point of extracting it (D28).
 */

import { describe, expect, it } from 'vitest'
import { cspFor } from '@/lib/security/csp'

const prod = cspFor({ nonce: 'NONCE123', isDev: false })
const dev = cspFor({ nonce: 'NONCE123', isDev: true })

describe('production policy', () => {
  it('is unchanged from what was reviewed', () => {
    expect(prod).toContain("script-src 'self' 'nonce-NONCE123'")
    expect(prod).toContain("style-src 'self'")
    expect(prod).toContain("frame-ancestors 'none'")
    expect(prod).toContain("base-uri 'none'")
  })

  it('permits no inline script and no eval', () => {
    const scriptSrc = prod.split('; ').find((d) => d.startsWith('script-src'))!
    expect(scriptSrc).not.toContain('unsafe-inline')
    expect(scriptSrc).not.toContain('unsafe-eval')
  })

  it('permits inline STYLE only as an attribute', () => {
    // style-src-attr is the narrow form. A <style> block stays refused.
    expect(prod.split('; ').find((d) => d === "style-src 'self'")).toBeTruthy()
    expect(prod).toContain("style-src-attr 'unsafe-inline'")
  })

  it('names no third-party origin', () => {
    expect(prod.replace('upgrade-insecure-requests', '')).not.toMatch(/https?:\/\//)
  })
})

describe('development policy', () => {
  it('permits what the dev server actually needs', () => {
    // Verified against a running `next dev`: without these the page renders
    // unstyled and Turbopack's chunks are refused.
    expect(dev).toContain("'unsafe-eval'")
    expect(dev.split('; ').find((d) => d.startsWith('style-src '))).toContain("'unsafe-inline'")
    expect(dev).toContain('ws:')
  })

  it('drops the nonce rather than pairing it with unsafe-inline', () => {
    /*
     * A browser IGNORES 'unsafe-inline' when a nonce is present. Sending both
     * would look permissive and silently block every inline script — the
     * failure being fixed, reintroduced by trying to keep the nonce.
     */
    const scriptSrc = dev.split('; ').find((d) => d.startsWith('script-src'))!
    expect(scriptSrc).toContain("'unsafe-inline'")
    expect(scriptSrc).not.toContain('nonce-')
  })

  it('keeps the structural protections that cost development nothing', () => {
    // Looser is not off. None of these interfere with a dev server.
    for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'"]) {
      expect(dev).toContain(directive)
    }
  })
})
