import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      /*
       * `server-only` throws on import by design. Next's bundler is where that
       * matters and where it still applies; the test runner is not a client
       * bundle, so it gets a no-op. See tests/support/server-only.ts, and the
       * test that asserts the marker is still present in every module that
       * needs it — the alias must never become a way to remove it.
       */
      'server-only': fileURLToPath(new URL('./tests/support/server-only.ts', import.meta.url)),
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
