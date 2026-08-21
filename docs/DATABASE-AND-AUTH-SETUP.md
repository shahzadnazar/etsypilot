# Connecting a database and authentication

**None of this is needed to run EtsyPilot.** With `.env.local` copied from `.env.example` and
nothing filled in, every screen works against the demo shop. This is for making it a real
product with real sellers in it.

Read the order section first. Doing these out of order costs a day.

---

## What already exists, and what you will write

Being clear about this saves you looking for code that isn't there.

| Built | Not built |
| --- | --- |
| 16-table schema (`db/schema/index.ts`) | Any repository that reads or writes it |
| A generated migration (`db/migrations/0000_*.sql`, 362 lines) | — |
| A lazy Postgres client (`lib/db/index.ts`) | Its first caller — **`getDb()` has none today** |
| `TokenStore` interface + AES-256-GCM sealing | `DatabaseTokenStore`, which currently refuses every call |
| `getSession()` / `requireSession()` and every caller | The part that reads a real cookie |
| CSRF, rate limiting, CSP, redaction, error envelope | — |

The important consequence: **setting `DATABASE_URL` on its own changes almost nothing**,
because the domain still talks to `MockEtsyService`. It is step one of several, not a switch.

### ⚠️ The one trap

`lib/etsy/tokens.ts` picks its store like this:

```ts
store = process.env.DATABASE_URL ? new DatabaseTokenStore() : new MemoryTokenStore(...)
```

`DatabaseTokenStore` is **unimplemented and throws on every call** — deliberately, so it can
never silently report "no tokens" for a shop that has them. Verified: with `DATABASE_URL` set,
`getTokenStore().read()` rejects.

So **`DATABASE_URL` + `ETSY_MODE=live` breaks the Etsy connection flow** until you implement
that class (step 3). It is harmless while `ETSY_MODE=mock`, because nothing calls the store.
Do not set both and then wonder why connecting a shop fails.

---

## Order

```
1. Database   ──► 2. Auth   ──► 3. Token store   ──► 4. Etsy API key
   (schema        (needs the      (needs the DB)      (needs a session
    exists)        users table)                        and a token store)
```

Auth cannot come first: a user row has to live somewhere. Etsy cannot come before either: the
callback keys tokens by shop and attributes them to a signed-in user.

---

## Step 1 — Database

### 1.1 Get a Postgres URL

Any Postgres works. Three that need no server administration:

| Provider | Notes |
| --- | --- |
| **Supabase** | Gives you Postgres *and* the auth in step 2 from one project. Fewest moving parts if you are also using Supabase Auth |
| **Neon** | Serverless Postgres, generous free tier, branches per environment |
| **Local** | `docker run -e POSTGRES_PASSWORD=dev -p 5432:5432 -d postgres:16` — fine for development |

The URL looks like:

```
postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```

On Supabase, take the **connection pooler** URL for the app (port 6543) and the **direct**
URL (port 5432) for migrations — poolers do not support the statements a migration runs.

### 1.2 Put it in `.env.local`

```bash
DATABASE_URL=postgresql://...
```

Never in `.env.example`, never committed. `.env.local` is git-ignored.

### 1.3 Run the migration

```bash
npx drizzle-kit migrate      # applies db/migrations/0000_*.sql
```

If you change `db/schema/index.ts` later, `npx drizzle-kit generate` writes a new migration
file; commit it. Never edit an applied migration — write another one.

### 1.4 Verify

```bash
psql "$DATABASE_URL" -c "\dt"
```

You should see 16 tables: `users`, `shops`, `etsy_connections`, `listings`,
`listing_variations`, `order_items`, `profit_records`, `profit_scenarios`, `cost_rules`,
`audit_issues`, `baselines`, `experiments`, `keyword_lists`, `keyword_list_items`,
`ai_generations`, `subscriptions`, `usage_records`.

**The app will behave exactly as before.** Nothing reads these tables yet. That is expected —
see the table at the top.

---

## Step 2 — Authentication

### 2.1 Install

```bash
npm install @supabase/supabase-js @supabase/ssr
```

`@supabase/ssr` is the package that works with the App Router's cookie model. The older
`auth-helpers-nextjs` is deprecated; do not follow a tutorial that uses it.

### 2.2 Credentials

From your Supabase project's API settings, into `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...        # public by design, safe in the browser
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # NEVER exposed; bypasses row-level security
```

The service role key must never appear in a client component or in any `NEXT_PUBLIC_` name.
There is a browser check that fails if a credential pattern shows up in `.next/static`.

### 2.3 The only file you must change

`lib/auth/index.ts` — the demo branch becomes a real read. Every caller of `getSession()`
already handles `null`, so nothing else moves.

```ts
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getDb, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'

export async function getSession(): Promise<Session | null> {
  const jar = await cookies()

  if (isDemoMode()) return DEMO_SESSION

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        // A Server Component cannot set cookies. Refreshing the session is
        // middleware's job; swallowing here is correct, not lazy.
        setAll: () => {},
      },
    },
  )

  // getUser(), never getSession(): getUser revalidates the token with Supabase.
  // getSession() trusts a cookie the browser handed you, which is the whole
  // problem you are trying to solve.
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null

  // The shop this user operates. shopContext() refuses any other (D20).
  const [row] = await getDb()
    .select({ shopId: schema.shops.id })
    .from(schema.shops)
    .where(eq(schema.shops.ownerId, data.user.id))
    .limit(1)

  if (!row) return null   // signed in, no shop yet — send them to onboarding

  return {
    userId: data.user.id,
    email: data.user.email ?? '',
    name: (data.user.user_metadata?.name as string) ?? data.user.email ?? '',
    shopId: row.shopId,
    isDemo: false,
  }
}
```

> `schema.shops` has no `ownerId` column yet — add one (`text('owner_id').references(() => users.id)`),
> run `drizzle-kit generate`, and apply it. That is the one schema change auth needs.

### 2.4 Session refresh in middleware

Supabase tokens expire. `middleware.ts` already runs on every request for CSP, CSRF and rate
limiting — add the refresh there, **after** the CSRF check and before the response is
returned, using `createServerClient` with a `setAll` that writes to the response.

### 2.5 Cookie settings — do not skip

Whatever sets the session cookie, it must be:

```
httpOnly: true          script must never read it
sameSite: 'lax'         'strict' breaks the OAuth return from Etsy
secure: true            in production
```

**The CSRF protection in `lib/security/csrf.ts` was added specifically for this moment.** The
billing mutation routes were forgeable and only inert because no auth cookie existed. Do not
disable it while wiring auth up; it is the thing standing between a seller's plan and any
website they visit. See `docs/SECURITY-REVIEW.md`.

### 2.6 Verify

- Signed out, `/dashboard` redirects to `/login`
- Signed in, the top bar shows your real name and shop
- `curl -X POST -H 'Origin: https://evil.example' .../api/billing/cancel` still returns **403**

---

## Step 3 — Token store

Only now does `DATABASE_URL` + live Etsy work. Implement `DatabaseTokenStore` in
`lib/etsy/tokens.ts`, replacing the three `refuse()` calls:

```ts
export class DatabaseTokenStore implements TokenStore {
  describe() { return 'Tokens are stored encrypted in your database.' }

  async read(shopId: string): Promise<TokenSet | null> {
    const key = encryptionKey()
    if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is required to read stored tokens.')
    const [row] = await getDb()
      .select({ sealed: schema.etsyConnections.tokenRef })
      .from(schema.etsyConnections)
      .where(eq(schema.etsyConnections.shopId, shopId))
      .limit(1)
    return row?.sealed ? openTokens(row.sealed, key) : null
  }

  async write(shopId: string, tokens: TokenSet): Promise<void> {
    const key = encryptionKey()
    if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is required to store tokens.')
    await getDb()
      .insert(schema.etsyConnections)
      .values({
        shopId,
        tokenRef: sealTokens(tokens, key),
        scopes: tokens.scopes,
        expiresAt: new Date(tokens.expiresAt),
      })
      .onConflictDoUpdate({
        target: schema.etsyConnections.shopId,
        set: { tokenRef: sealTokens(tokens, key), expiresAt: new Date(tokens.expiresAt) },
      })
  }

  async forget(shopId: string): Promise<void> {
    // Clears the token, keeps the row: revocation is a fact worth recording.
    await getDb()
      .update(schema.etsyConnections)
      .set({ tokenRef: null, revokedAt: new Date() })
      .where(eq(schema.etsyConnections.shopId, shopId))
  }
}
```

Generate the key and put it in `.env.local`:

```bash
openssl rand -base64 32     # → TOKEN_ENCRYPTION_KEY
```

Exactly 32 bytes. Anything else raises at startup rather than storing plaintext. Rotating it
invalidates stored tokens — sellers reconnect, no shop data is lost.

---

## Step 4 — Etsy API key

Follow `docs/ETSY-SETUP.md`. It only works once steps 1–3 are done: the callback needs a
session to attribute the connection to, and a token store to write to.

---

## The part nobody warns you about

Steps 1–4 give you a real shop connected to a real account. **The domain still reads
`MockEtsyService` for everything except what you explicitly route through the live adapter**,
and no repository writes a single row of those 16 tables.

Making the product persistent is its own body of work: a repository per aggregate, a sync job
that pulls Etsy data into `listings` and `order_items`, and swapping each domain service from
"call the adapter" to "read the repository, fall back to the adapter". `lib/etsy/index.ts` is
the only place that chooses an adapter, which is what makes that tractable — but it is
tractable, not free.

Do it one aggregate at a time, and keep the browser checks running: they assert what the
screens *say*, so they will catch a repository that returns subtly different data long before
a user does.
