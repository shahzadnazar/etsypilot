import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

/*
 * ══════════════════════════════════════════════════════════════════════════
 *   ESLINT, WHICH THIS REPOSITORY HAS NOT ACTUALLY BEEN ABLE TO RUN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `npm run lint` was `next lint`, and `next lint` was removed in Next 16 — it
 * now fails with "Invalid project directory provided, no such directory:
 * <repo>/lint", because the argument it no longer understands is read as a
 * path. So the lint step in every checklist has been reporting a path error
 * rather than a clean run, and `eslint` and `eslint-config-next` have been in
 * devDependencies with no configuration file for either to read.
 *
 * This is the flat config the Next 16 docs prescribe
 * (node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md),
 * and `npm run lint` now calls the ESLint CLI directly.
 *
 * `core-web-vitals` rather than the base config: it promotes the rules that
 * affect loading performance from warnings to errors, which is the right
 * severity for a public marketing page — an <img> where <Image> belongs, or a
 * synchronous third-party script, is a regression in the thing this page is
 * measured on.
 *
 * `eslint-config-next/typescript` is deliberately NOT added. It brings
 * typescript-eslint's rule set, which overlaps with what `tsc --noEmit`
 * already enforces here under `strict`, `noUncheckedIndexedAccess` and
 * `noUnusedLocals` — and adding several hundred new findings across a tree
 * this size is its own piece of work, not a side effect of making the lint
 * script execute. It is the obvious next step, and it is named here rather
 * than silently skipped.
 */
export default defineConfig([
  ...nextVitals,
  globalIgnores([
    // The defaults from eslint-config-next, restated because overriding
    // `ignores` replaces them rather than extending them.
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Not source: a dependency tree, and the design export this page was
    // built from, which is reference material rather than production code.
    'node_modules/**',
    'docs/**',
  ]),
])
