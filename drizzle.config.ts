import type { Config } from 'drizzle-kit'

/*
 * drizzle-kit does not read .env.local on its own, and this project has no
 * dotenv dependency — so without this the CLI fails with `url: ''` while the
 * app itself runs fine, which reads as a bad connection string rather than an
 * unread file. Node's own loader avoids adding a dependency for one line.
 */
try {
  process.loadEnvFile('.env.local')
} catch {
  // No .env.local (CI, or a fresh checkout in demo mode). The check below reports it.
}

/*
 * Migrations run over DIRECT_URL, not DATABASE_URL.
 *
 * Supabase's transaction pooler (port 6543) multiplexes statements across
 * connections and cannot run the session-scoped statements a migration needs.
 * The app keeps the pooler; only the CLI takes the direct route.
 */
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? ''

export default {
  schema: './db/schema/index.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
} satisfies Config