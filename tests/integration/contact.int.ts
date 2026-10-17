import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import {
  CONTACT_LIMITS,
  countUnhandledContactMessages,
  recordContactMessage,
} from '@/lib/repositories/contact'
import { getDb } from '@/lib/db'

/**
 * Contact messages: the second table a stranger may write to.
 *
 *     DATABASE_URL=postgres://... npm run test:integration
 *
 * The claims this file holds:
 *
 *   IT IS A REAL DELIVERY MECHANISM.  The page tells a visitor their message
 *                                     is "recorded", and that is the whole of
 *                                     what it claims. These tests are what
 *                                     make the sentence true rather than
 *                                     hopeful — nothing else in the product
 *                                     exercises this insert.
 *   TWO QUESTIONS ARE TWO ROWS.       Deliberately unlike the waitlist, which
 *                                     collapses a second submission onto the
 *                                     first. A second question is not a
 *                                     duplicate, and an upsert would discard
 *                                     it silently.
 *   THE DATABASE REFUSES WHAT THE     The route's bounds and the CHECK
 *   ROUTE REFUSES.                    constraints are the same numbers from
 *                                     one definition, so a value the form
 *                                     accepts can never be one the insert
 *                                     rejects — which would turn a typo into
 *                                     a 500.
 *   NOTHING CAN READ IT BACK.         The protection that replaces shop
 *                                     scoping on a table with no shop.
 */

async function clean() {
  await getDb().execute(sql`delete from contact_messages where email like '%@cm.test'`)
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('These tests need DATABASE_URL pointing at a migrated database.')
  }
  await clean()
})

afterAll(clean)
beforeEach(clean)

const message = (overrides: Partial<Parameters<typeof recordContactMessage>[0]> = {}) => ({
  name: 'A Seller',
  email: 'ask@cm.test',
  subject: 'Which plan do I need?',
  message: 'I have about 300 listings and I want the rollback window.',
  source: 'pricing',
  ...overrides,
})

describe('a message is recorded', () => {
  it('writes the row, so "recorded" is a true sentence', async () => {
    const before = await countUnhandledContactMessages()
    await recordContactMessage(message())
    expect(await countUnhandledContactMessages()).toBe(before + 1)
  })

  it('keeps every field the person typed', async () => {
    await recordContactMessage(message())
    const rows = await getDb().execute<{
      name: string
      subject: string
      message: string
      source: string | null
      handled_at: Date | null
    }>(sql`select name, subject, message, source, handled_at from contact_messages
           where email = 'ask@cm.test'`)
    const row = (rows as unknown as {
      name: string
      subject: string
      message: string
      source: string | null
      handled_at: Date | null
    }[])[0]!

    expect(row.name).toBe('A Seller')
    expect(row.subject).toBe('Which plan do I need?')
    expect(row.message).toContain('300 listings')
    expect(row.source).toBe('pricing')
    // Null on arrival, so an operator can tell what is still waiting.
    expect(row.handled_at).toBeNull()
  })

  it('keeps a second question as a second row', async () => {
    await recordContactMessage(message({ subject: 'First' }))
    await recordContactMessage(message({ subject: 'Second' }))

    const rows = await getDb().execute<{ subject: string }>(
      sql`select subject from contact_messages where email = 'ask@cm.test' order by subject`,
    )
    expect((rows as unknown as { subject: string }[]).map((r) => r.subject)).toEqual([
      'First',
      'Second',
    ])
  })

  it('trims what it is given rather than storing the whitespace', async () => {
    await recordContactMessage(message({ name: '  Padded  ', subject: ' Spaced ' }))
    const rows = await getDb().execute<{ name: string; subject: string }>(
      sql`select name, subject from contact_messages where email = 'ask@cm.test'`,
    )
    const row = (rows as unknown as { name: string; subject: string }[])[0]!
    expect(row.name).toBe('Padded')
    expect(row.subject).toBe('Spaced')
  })
})

describe('the database refuses what the form refuses', () => {
  it('rejects an address that is not one', async () => {
    await expect(recordContactMessage(message({ email: 'not-an-address' }))).rejects.toThrow()
  })

  it('rejects a message past the length the form allows', async () => {
    const tooLong = 'x'.repeat(CONTACT_LIMITS.message.max + 1)
    await expect(recordContactMessage(message({ message: tooLong }))).rejects.toThrow()
  })

  it('accepts a message at exactly the length the form allows', async () => {
    /*
     * The other half, and the one that matters: if the constraint were
     * stricter than the field's `maxLength` by even one character, a visitor
     * who filled the box would get a 500 for a message the form told them was
     * fine.
     */
    const atLimit = 'x'.repeat(CONTACT_LIMITS.message.max)
    await expect(recordContactMessage(message({ message: atLimit }))).resolves.toBeUndefined()
  })

  it('rejects an empty required field', async () => {
    await expect(recordContactMessage(message({ name: '   ' }))).rejects.toThrow()
  })
})

describe('the table cannot be read back', () => {
  it('exports no way to ask what anybody wrote, or whether they did', async () => {
    /*
     * A find-by-email would turn the public form into a membership oracle,
     * exactly as it would on the waitlist. One write, one count, nothing else.
     */
    const repo = await import('@/lib/repositories/contact')
    expect(Object.keys(repo).sort()).toEqual([
      'CONTACT_LIMITS',
      'countUnhandledContactMessages',
      'recordContactMessage',
    ])
  })

  it('and the row id reveals nothing about the rest of the table', async () => {
    await recordContactMessage(message({ subject: 'One' }))
    await recordContactMessage(message({ subject: 'Two' }))
    const rows = await getDb().execute<{ id: string }>(
      sql`select id from contact_messages where email = 'ask@cm.test'`,
    )
    const ids = (rows as unknown as { id: string }[]).map((r) => r.id)
    // Random uuids, not a sequence anybody could count or walk.
    for (const id of ids) expect(id).toMatch(/^cm_[0-9a-f-]{36}$/)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
