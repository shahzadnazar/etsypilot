import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { posixJoin } from '../support/paths'
import {
  CALCULATIONS,
  SPECS,
  WORKED_EXAMPLES,
  calculate,
  clipboardText,
  type CalculationKind,
} from '@/domain/calculator/engine'

function value(kind: CalculationKind, a: string, b: string) {
  const outcome = calculate({ kind, a, b })
  if (!outcome.ok) throw new Error(`refused: ${outcome.refusal.message}`)
  return outcome.result
}

function refusal(kind: CalculationKind, a: string, b: string) {
  const outcome = calculate({ kind, a, b })
  if (outcome.ok) throw new Error('expected a refusal')
  return outcome.refusal
}

describe('every worked example from the design', () => {
  for (const example of WORKED_EXAMPLES) {
    it(`${example.kind.toLowerCase()}: ${example.a}, ${example.b} → ${example.expect}`, () => {
      expect(value(example.kind, example.a, example.b).display).toBe(example.expect)
    })
  }

  it('covers all eight calculations the PRD lists', () => {
    expect(CALCULATIONS).toHaveLength(8)
    for (const kind of CALCULATIONS) {
      expect(SPECS[kind].fields).toHaveLength(2)
      expect(SPECS[kind].summary.length).toBeGreaterThan(5)
    }
  })
})

describe('the formula is produced with the number, not beside it', () => {
  it('substitutes the actual values and ends in the actual result', () => {
    const result = value('DISCOUNT', '29', '20')
    expect(result.formula).toBe('$29.00 × (1 − 20%) = $23.20')
    // The number in the formula IS the displayed number — they cannot drift,
    // because one function produced both.
    expect(result.formula.endsWith(result.display)).toBe(true)
  })

  it('holds for every calculation, at several inputs', () => {
    for (const kind of CALCULATIONS) {
      for (const [a, b] of [['100', '10'], ['29.99', '7.5'], ['1', '1']]) {
        const outcome = calculate({ kind, a: a!, b: b! })
        if (!outcome.ok) continue
        expect(outcome.result.formula.endsWith(outcome.result.display), `${kind} ${a}/${b}`).toBe(true)
      }
    }
  })

  it('copies the formula and the basis, not just the number', () => {
    const text = clipboardText(value('DISCOUNT', '29', '20'))
    expect(text).toContain('$29.00 × (1 − 20%) = $23.20')
    expect(text).toContain('Savings $5.80')
    expect(text).toContain('Not connected to your Etsy account')
  })
})

describe('it refuses rather than coercing', () => {
  it('treats an empty field as missing, never as zero', () => {
    expect(refusal('PROFIT', '', '35').message).toContain('Enter revenue')
    expect(refusal('PROFIT', '100', '').field).toBe('b')
  })

  it('refuses text instead of parsing it to zero', () => {
    expect(refusal('FEE', 'abc', '6.5').message).toContain('must be a number')
  })

  it('refuses a negative input rather than producing a mirror-image answer', () => {
    expect(refusal('DISCOUNT', '-29', '20').message).toContain('cannot be negative')
  })

  it('refuses a divide-by-zero instead of returning Infinity or NaN', () => {
    expect(refusal('MARGIN', '0', '65').message).toContain('revenue above 0')
    expect(refusal('MARKUP', '0', '30').message).toContain('cost above 0')
  })

  it('refuses the inputs whose arithmetic diverges, and says why', () => {
    // 100% target margin has no break-even price; the maths runs away rather
    // than failing, which is exactly when a calculator must speak up.
    expect(refusal('BREAK_EVEN', '20', '100').message).toContain('no break-even price')
    expect(refusal('DISCOUNT', '29', '120').message).toContain('paying the buyer')
  })

  it('never returns a non-finite number for any input it accepts', () => {
    const inputs = ['0', '1', '100', '0.01', '99999999', '6.5']
    for (const kind of CALCULATIONS) {
      for (const a of inputs) {
        for (const b of inputs) {
          const outcome = calculate({ kind, a, b })
          if (!outcome.ok) continue
          expect(Number.isFinite(outcome.result.value), `${kind} ${a}/${b}`).toBe(true)
          expect(outcome.result.display).not.toContain('NaN')
          expect(outcome.result.display).not.toContain('Infinity')
        }
      }
    }
  })

  it('accepts what a seller actually types', () => {
    // "$29.00" and "20%" pasted from somewhere else.
    expect(value('DISCOUNT', '$29.00', '20%').display).toBe('$23.20')
    expect(value('PROFIT', '1,000', '350').display).toBe('$650.00')
  })
})

describe('a result is never dressed as something it is not', () => {
  it('is always CALCULATED — nothing here came from Etsy', () => {
    for (const kind of CALCULATIONS) {
      const outcome = calculate({ kind, a: '100', b: '10' })
      if (!outcome.ok) continue
      expect(outcome.result.provenance).toBe('CALCULATED')
    }
  })

  it('says what it is based on, under every result', () => {
    const result = value('FEE', '100', '6.5')
    expect(result.basis).toContain('values you entered')
    expect(result.basis).toContain('Not connected to your Etsy account')
    // The one claim this tool must never make.
    expect(result.basis.toLowerCase()).not.toContain('official etsy fee')
  })

  it('names a loss instead of showing a smaller positive number', () => {
    const result = value('PROFIT', '35', '100')
    expect(result.value).toBeLessThan(0)
    expect(result.secondary).toContain('loss')
  })
})

/*
 * The acceptance criterion: fast, and separate from Profit Reality.
 */
describe('it stays separate from Profit Reality', () => {
  it('has no import edge into the profit domain, or anywhere stateful', () => {
    const source = fs.readFileSync(posixJoin(process.cwd(), 'domain/calculator/engine.ts'), 'utf8')
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]!)

    // Exactly one import, and it is a type.
    expect(imports).toEqual(['@/lib/provenance/types'])

    /*
     * Scoped to import specifiers, not to the file's text: a blanket
     * `not.toContain('domain/profit')` fails on the comment that explains there
     * is no import of domain/profit. Same matching-the-prose-beside-the-thing
     * mistake as the "at risk" and "no dark patterns" checks.
     */
    for (const forbidden of ['domain/profit', 'lib/etsy', 'lib/db', 'lib/auth', 'lib/billing']) {
      expect(imports.some((i) => i.includes(forbidden)), forbidden).toBe(false)
    }
  })

  it('reads no clock and no randomness, so the same input is the same answer', () => {
    const source = fs
      .readFileSync(posixJoin(process.cwd(), 'domain/calculator/engine.ts'), 'utf8')
      // Strip comments: the prose is allowed to mention what the code avoids.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(source).not.toContain('Date.now')
    expect(source).not.toContain('Math.random')
    expect(source).not.toContain('new Date')

    const once = value('BREAK_EVEN', '20', '30')
    const twice = value('BREAK_EVEN', '20', '30')
    expect(once).toEqual(twice)
  })

  it('is fast enough to run on every keystroke', () => {
    const started = performance.now()
    for (let i = 0; i < 20_000; i += 1) {
      calculate({ kind: 'BREAK_EVEN', a: String(20 + (i % 100)), b: '30' })
    }
    const elapsed = performance.now() - started

    // 20,000 calculations. A generous ceiling — the point is to catch a future
    // change that makes this reach for something, not to benchmark a CPU.
    expect(elapsed).toBeLessThan(1000)
  })
})
