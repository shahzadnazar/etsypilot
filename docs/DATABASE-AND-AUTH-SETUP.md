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

## Step 2b — Two-factor authentication and password reset

Both features use Supabase Auth's own primitives. **Neither adds an environment
variable**, and that is worth saying plainly rather than leaving you to notice
it: everything below is a setting in the Supabase dashboard.

### 2b.1 What breaks if you skip this

| Skipped | What happens |
| --- | --- |
| MFA not enabled for the project | Enrollment fails at `mfa.enroll`. Operators see "We could not start enrollment" and **cannot open `/admin` at all** — the gate requires a second factor with no grace period. |
| Recovery codes unavailable | Enrollment still completes and the authenticator works. The screen says so honestly, and a lost phone then needs a manual intervention here rather than a code. |
| Reset email template left as the default link | The email contains a link and no code. The reset screen asks for six digits that never arrive. |

### 2b.2 Turn on MFA (TOTP)

**Authentication → Sign In / Providers → Multi-Factor Authentication**: enable
**TOTP (App Authenticator)**. Nothing else is needed — SMS is deliberately not
used by this product, because it costs money per message and a SIM swap defeats
it.

**Recovery codes** are a newer GoTrue feature and may appear as a separate
toggle. Enable it if it is there. The client-side flag that goes with it is
already set in `lib/auth/supabase.ts` (`auth.experimental.recoveryCodes`), which
is required: without it the API is present on the client and throws on first
call, which is a worse failure mode than being absent.

### 2b.3 Make the reset email send a CODE, not a link

**Authentication → Emails → Reset Password**. The default template contains:

```
<a href="{{ .ConfirmationURL }}">Reset Password</a>
```

Replace that with the token:

```
<p>Your EtsyPilot password reset code is:</p>
<p style="font-size:24px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
<p>It expires shortly. If you did not ask for this, ignore this email.</p>
```

`{{ .Token }}` is the six-digit code. `verifyOtp({ type: 'recovery' })` checks
it, which is why **this product stores no reset codes of its own** — Supabase
holds the code with its own expiry, single-use handling and rate limit, and a
second copy in a table of ours would be a second thing that can leak.

**There is no Site URL to configure for this flow.** The code flow needs no
`redirectTo`, so nothing here has to change when you get a domain. (If you ever
switch back to link-based reset, that is when Site URL and Redirect URLs start
to matter.)

### 2b.4 The ordering trap — read this before you deploy

Turning the requirement on locks out every operator who has not yet enrolled,
**including you**. The enrollment screen is therefore NOT under `/admin`: it
lives at `/two-factor`, outside the gate, reachable by any signed-in account.

So the safe order is simply: deploy, sign in, and you will be redirected to
`/two-factor` automatically. Scan, enter a code, save your recovery codes, and
`/admin` opens.

**Nobody can reset anyone else's second factor, and no button for it exists.**
An admin who could clear a manager's factor could enroll their own phone and
sign in as them. If an operator loses their phone and their recovery codes, the
only way back is **Authentication → Users → (the account) → remove the factor**
here in the dashboard.

### 2b.5 Sending email at all

Supabase's built-in sender is capped at a few messages per hour and is not for
production. It is enough to test the reset flow on two accounts.

Before sellers use it you need an SMTP provider (Resend, Postmark, SES) with a
**verified sending domain**, configured under **Project Settings → Auth → SMTP
Settings**. That needs the domain you do not have yet. It is a dashboard
change, not a code change — nothing in this repository has to be edited when it
happens.

Two-factor authentication sends no email and is fully usable today.

### 2b.6 Verify

- Signed in as an operator with no factor, `/admin` redirects to `/two-factor`
- After enrolling, `/admin` opens and recovery codes are shown exactly once
- Sign out and back in: `/admin` redirects to `/two-factor/verify` until you
  enter a code
- `/forgot-password` answers identically for a registered and an unregistered
  address
- A reset on an enrolled account asks for the authenticator **before** the new
  password takes effect

`python3 tests/browser/two-factor.py` asserts all of these against a running
server.

---

## Step 3 — Token store

**Implemented.** `DatabaseTokenStore` in `lib/etsy/tokens.ts` is real; the only
thing you have to do is set the key:

```bash
openssl rand -base64 32     # → TOKEN_ENCRYPTION_KEY in .env.local
```

Exactly 32 bytes. Anything else — or nothing at all — and every token read,
write and disconnect refuses with a message naming the variable. Nothing is
ever stored unencrypted, and nothing returns "not connected" to cover up a
missing key. Rotating the key invalidates stored tokens: sellers reconnect, no
shop data is lost.

### 3.1 Which store runs

`DATABASE_URL` decides, **alone**:

| DATABASE_URL | TOKEN_ENCRYPTION_KEY | Store | Behaviour |
| --- | --- | --- | --- |
| unset | — | `MemoryTokenStore` | Works for one process; tokens lost on restart, and it says so on the connect screen |
| set | set | `DatabaseTokenStore` | Encrypted rows in `etsy_connections` |
| set | unset/malformed | `DatabaseTokenStore` | Refuses every call, naming the variable |

The key deliberately does **not** take part in the choice. Falling back to the
in-memory store when the key is missing would be a silent downgrade: a
deployment that set `DATABASE_URL` asked for persistence, and giving it a store
that loses every token at the next deploy — with nothing saying why — is worse
than a store that refuses and explains. `lib/etsy/tokens.ts` argues this at the
`getTokenStore()` definition.

### 3.2 Three things the old sketch in this file got wrong

This step used to carry a code sketch. It was written before the schema
settled, and it was wrong in ways worth naming, because each one would have
shipped:

1. **`revoked_at` was not cleared on reconnection.** Its `onConflictDoUpdate`
   set only `token_ref` and `expires_at`, so a shop that reconnected after
   disconnecting kept its old revocation date — a row carrying a live token and
   a revocation date at the same time. Every screen reading it has to pick one,
   which means different screens pick differently.
2. **`scopes` was not updated on reconnection either**, so Settings would tell
   a seller what breaks if they revoke a scope they no longer hold.
3. **It called `sealTokens()` twice** — once for the insert, once for the
   conflict branch. The IV is random per call, so those are two different
   ciphertexts. Only one is ever stored, so it worked; but it invites the
   assumption that the two match, and they never will.

### 3.3 What a failed write must not say

Found while testing rather than by reading the code: **drizzle's query error
message contains the SQL and the bound parameters**, and one of those
parameters is the sealed token.

```
Failed query: insert into "etsy_connections" (...) values ($1, $2, $3, ...)
params: shop-123,["listings_r"],kmCl7LHYpA4VxBH+.z/zMmwQK77+JEPWeZFDg4A==.tI3Ww…
                                ^ the sealed token
```

Re-throwing that would put a sealed credential into every log line and error
reporter that records `error.message`. It is ciphertext, not plaintext — but
the whole argument for encrypting at rest is that the stored value should not
be lying around in places nobody audited, and logs outlive key rotations. No
query error leaves the store now; what replaces it carries the SQLSTATE and the
constraint name and nothing else. `tests/integration/etsy-tokens.int.ts`
asserts the ciphertext appears in no part of the thrown error.

### 3.4 Row-level security — enforced by a migration, not remembered

This section used to describe a manual fix. It is a migration now:
`db/migrations/0008_enable_row_level_security.sql`. The queries below became
the *verification* step rather than the fix.

#### Why this is enforced rather than remembered

It has been left off by accident **twice**, and the second time nothing in the
repository was looking:

| When | What |
| --- | --- |
| **23 Sep 2026** | Every table had RLS off, and it was exploitable rather than theoretical — a `/rest/v1/` URL loaded with the **publishable** key returned an account row as JSON. Fixed by running an `alter table … enable row level security` loop by hand in the SQL Editor. |
| **24 Sep onward** | Migrations `0002`–`0005` added `admin_audit_events`, `admin_permission_audit_events` and `admin_role_permissions`. No migration enabled RLS, so the audit log, the permission-change log and the permission matrix all arrived with it **off** — silently reopening what the 23rd had closed. |
| **7 Oct 2026** | A `pg_tables` query returned exactly those three as `rowsecurity = false`. Found by hand. Fixed by hand. |

Both fixes lived in a shell history, which closes today's hole and guarantees
tomorrow's: the next migration that adds a table reopens it, silently, again.
So there are now three things, and they catch different routes in:

| | What it does | Catches |
| --- | --- | --- |
| `db/migrations/0008_…sql` | Loops over `pg_tables` and enables RLS on every table in `public`. Re-runnable; names no table. Raises if any table is still unprotected when it finishes, so it cannot succeed quietly. | Today's tables |
| `tests/unit/rls.test.ts` | Reads `db/schema/index.ts` and every migration. Fails if a table arrives in a migration **later** than 0008 without its own `ENABLE ROW LEVEL SECURITY`. No database needed, so it runs on every commit. | The commit that caused 7 October |
| `tests/integration/rls.int.ts` | Queries `pg_tables` against a real database and fails if anything in `public` has `rowsecurity = false`. | Drift from **any** source — a migration, `drizzle-kit push`, or a hand-run `CREATE TABLE` |

**If you add a table, add one line to its migration.** `drizzle-kit` does not
generate it; the unit test is what tells you.

```sql
ALTER TABLE "your_new_table" ENABLE ROW LEVEL SECURITY;
```

#### No policies, deliberately

RLS with no policy means every role **except** one holding `BYPASSRLS` sees
nothing. That is right for every table here: every row is reached through the
application's own connection, and the application does its own authorisation —
`shopContext()` is the seller-isolation boundary and `getAdminAccess()` the
operator one. There is no caller that should reach these rows directly, so
there is nothing for a policy to permit. A policy granting `anon` or
`authenticated` any access would hand back exactly what 23 September proved was
reachable. Both tests fail if one appears.

#### Check this BEFORE you apply it

The role in your `DATABASE_URL` must hold `BYPASSRLS`:

```sql
select current_user,
       (select rolbypassrls from pg_roles where rolname = current_user) as bypasses_rls;
```

**`bypasses_rls` must be `t`.** Supabase's `postgres` role has it; a custom
role may not.

This matters more than it looks, and it was measured rather than assumed —
against a **non-superuser** role, because a superuser bypasses RLS for reasons
that would not transfer to your project:

| Role | `select count(*) from users` |
| --- | --- |
| `nosuperuser bypassrls` | **5** |
| `nosuperuser nobypassrls` | **0** |

Note the second row. It is **not an error — it is zero rows.** A deployment
whose role lacks `BYPASSRLS` does not crash; it quietly reads an empty
database, every screen says "no data", and nothing anywhere says why. If
`bypasses_rls` comes back `f`, stop and fix that first.

#### Applying it to your Supabase project

The migration runs with the rest of them (`drizzle-kit migrate`, or however you
apply `db/migrations`). If you prefer to paste it into the SQL Editor, paste
the whole file — the second `DO` block is the self-check that makes it refuse
to succeed without having worked.

**What you should see when you verify.** Run this afterwards:

```sql
select count(*) as total,
       count(*) filter (where rowsecurity)     as rls_on,
       count(*) filter (where not rowsecurity) as still_off
  from pg_tables where schemaname = 'public';

select count(*) as policies from pg_policies where schemaname = 'public';
```

Expected: `still_off = 0`, `policies = 0`, and `rls_on = total`. On the
development database here that reads `27 | 27 | 0` and `0`. Your project may
have a different total — what matters is that `still_off` is `0`.

Then confirm the hole is actually shut, from outside, the same way it was
originally found — load a `/rest/v1/` URL with the publishable key:

```bash
curl -s "https://<project>.supabase.co/rest/v1/users?select=*" \
  -H "apikey: <publishable key>" -H "Authorization: Bearer <publishable key>"
```

Expected: `[]`. Before the fix it returned account rows. An empty array is RLS
working — the rows are there, and that key may not see them. (A `42501` or a
permission error is also fine; what is **not** fine is JSON with data in it.)

**One caveat, stated plainly: I cannot reach your Supabase project from here.**
Everything above was verified against this repository and the local development
database — 27 of 27 tables, 0 policies, the suites re-run afterwards. The
numbers your project returns are yours to read, which is why the expected
output is written out above rather than described.

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
