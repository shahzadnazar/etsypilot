import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/*
 * The suites that need a real database.
 *
 * A SEPARATE CONFIG RATHER THAN A `skipIf`, and the distinction is the point.
 * `npm test` runs with no DATABASE_URL — the demo path must keep working
 * without one — so a database test living in the default suite would have to
 * skip itself, and a check that passes when the thing it measures is absent is
 * not a check. This repository has removed several of those.
 *
 * So these files are invisible to `npm test` by extension (`.int.ts` does not
 * match its `tests/**\/*.test.ts`), and they FAIL rather than skip when run
 * without a database.
 *
 *     DATABASE_URL=postgres://... \
 *     TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
 *     npm run test:integration
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // Same reasoning as vitest.config.ts: the marker stays in the source and
      // Next still enforces it; the runner is not a client bundle.
      'server-only': fileURLToPath(new URL('./tests/support/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.int.ts'],
    /*
     * One file at a time, one test at a time. These share two fixture shops
     * and one table; running them in parallel would have them deleting each
     * other's rows between an arrange and an assert, and the failures would
     * look like defects in the store.
     */
    fileParallelism: false,
    sequence: { concurrent: false },
  },
})
