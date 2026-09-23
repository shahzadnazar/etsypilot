/*
 * What can and cannot leave this product.
 *
 * These three services are different in kind from the Etsy adapter or the AI
 * provider: each one sends a seller's data to a third party. So the tests are
 * about the SHAPE of what is sendable, not about whether a call succeeds.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The source with its comments removed.
 *
 * Load-bearing, and the reason is a mistake made writing these very tests: the
 * "no campaign sending" assertion failed on interface.ts's own comment, which
 * says "There is no `sendCampaign`". A promise never to do X contains X.
 *
 * Same rule as the disclaimer checks in the browser suite — assert on the
 * region under test, never on the prose describing it.
 */
function codeOf(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}
import { ANALYTICS_EVENTS } from '@/lib/telemetry/interface'
import { NoopAnalytics, NoopErrorReporter, NoopMailer } from '@/lib/telemetry/noop'
import { getAnalytics, getErrorReporter, getMailer, telemetryIsSilent } from '@/lib/telemetry'

describe('nothing is sent by default', () => {
  it('selects the noop adapter for all three', () => {
    expect(getErrorReporter().mode).toBe('noop')
    expect(getAnalytics().mode).toBe('noop')
    expect(getMailer().mode).toBe('noop')
    expect(telemetryIsSilent()).toBe(true)
  })

  it('reports an unsent email as undelivered, with a reason', async () => {
    /*
     * The tempting shape is `{delivered: true}` — nothing went wrong locally.
     * That would have the product tell a seller "we emailed you" when no
     * mailer exists, which is a lie the code would be telling on its own.
     */
    const result = await new NoopMailer().send({ to: 'seller@example.com', kind: 'SYNC_FAILED' })
    expect(result.delivered).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('does not swallow an error when no tracker is configured', () => {
    // "No DSN set" must not come to mean "errors disappear". The noop reporter
    // routes to the structured log instead.
    expect(() => new NoopErrorReporter().reportError(new Error('x'), {})).not.toThrow()
  })

  it('drops analytics silently rather than logging them', () => {
    // Logging a dropped event would turn "we send nothing" into "we write
    // everything to stdout" — the same disclosure through a different pipe.
    const lines: string[] = []
    const original = console.log
    console.log = (...args: unknown[]) => void lines.push(args.join(' '))
    try {
      new NoopAnalytics().track('audit_run', { count: 3 })
    } finally {
      console.log = original
    }
    expect(lines).toEqual([])
  })
})

describe('the analytics vocabulary is closed', () => {
  it('names every event that may be sent', () => {
    // The list IS the disclosure. Someone can read it and know what leaves.
    expect([...ANALYTICS_EVENTS]).toEqual([
      'shop_connected',
      'audit_run',
      'bulk_job_confirmed',
      'bulk_job_rolled_back',
      'ai_draft_requested',
      'ai_draft_approved',
      'export_downloaded',
      'plan_changed',
      'calculator_used',
    ])
  })

  it('has no event carrying seller content', () => {
    /*
     * A guard on the naming, not just the count. An event called
     * `search_performed` or `listing_viewed` would invite a term or a title as
     * a property, which is the failure mode this vocabulary exists to prevent.
     */
    for (const event of ANALYTICS_EVENTS) {
      expect(event).not.toMatch(/search|query|term|title|keyword|content|text|name/)
    }
  })

  it('accepts no arbitrary string property', () => {
    /*
     * The real guarantee is in the type: AnalyticsProps admits numbers,
     * booleans and two enums, never Record<string, unknown>. This asserts the
     * SOURCE, because a type cannot be checked at runtime and a future edit
     * widening it would compile perfectly.
     */
    const source = codeOf('lib/telemetry/interface.ts')
    const props = source.slice(source.indexOf('interface AnalyticsProps'))
    const body = props.slice(0, props.indexOf('}'))
    expect(body).not.toMatch(/Record<string/)
    expect(body).not.toMatch(/\[key: string\]/)
    // Every declared field is a number, a boolean, or a union of literals.
    for (const line of body.split('\n').filter((l) => l.includes('?:'))) {
      expect(line, `unbounded prop: ${line.trim()}`).toMatch(/number|boolean|'/)
    }
  })
})

describe('email is transactional only', () => {
  it('offers no way to send a campaign', () => {
    expect(codeOf('lib/telemetry/interface.ts')).not.toMatch(
      /sendCampaign|sendBulk|recipients|templateId|audience/,
    )
  })
})

