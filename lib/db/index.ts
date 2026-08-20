/*
 * Database client.
 *
 * Lazily constructed so the app boots in demo mode with no DATABASE_URL set -
 * which is the Phase 1 acceptance gate. Nothing in the demo path touches
 * Postgres; the client only materialises when a repository actually needs it.
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@/db/schema'
import { AppError } from '@/lib/errors/types'

type Database = ReturnType<typeof drizzle<typeof schema>>

let client: Database | null = null

export function getDb(): Database {
  if (client) return client

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new AppError({
      kind: 'EXTERNAL_SERVICE',
      code: 'DATABASE_NOT_CONFIGURED',
      message: 'The database is not configured.',
      recovery:
        'EtsyPilot is running in demo mode, which does not need one. Set DATABASE_URL to enable persistence.',
    })
  }

  client = drizzle(postgres(url, { max: 10 }), { schema })
  return client
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

export { schema }
