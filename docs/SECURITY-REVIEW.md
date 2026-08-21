# Security review — Phase 12

Reviewed 2026-08-21 against the committed tree. Every line below was **probed against a
running production build**, not read off the source: a control that is present in the code
and not effective in the running app is the failure mode a source-only review is worst at
finding.

Two findings. Both fixed and both now covered by a check that fails if the fix is removed.

---

## Findings

### HIGH · No CSRF protection on state-changing routes — FIXED

`POST /api/billing/cancel` carrying `Origin: https://evil.example` returned **303, a
successful cancellation.** The same held for `/resume`, `/change/[plan]` and
`/refund/[invoiceId]`. There was no token, no Origin check, and no Referer check.

It was not exploitable on the day it was found, and the reason is not a defence: demo mode
returns a fixed session and reads no auth cookie, so there was no cookie for a forged request
to ride. **The day Supabase auth lands, every one of those routes becomes a one-click attack
from any page a seller visits** — cancel their plan, change it, request a refund.

Fixed in `lib/security/csrf.ts`, enforced in middleware so a route added later is covered
without anyone knowing the file exists. Origin, with Referer as fallback, compared as an
exact origin — `startsWith` would let `https://etsypilot.app.evil.com` through, and a test
asserts that case specifically.

The Stripe webhook is exempt and that is deliberate: it is called from Stripe's servers with
no Origin header and proves itself with a constant-time HMAC over the raw body, which is a
strictly stronger check. Requiring an Origin it cannot send would break payments and add
nothing. A check asserts the webhook still reaches its signature verification (400) rather
than being refused by the origin test (403).

Verified after the fix: `403` for the attack, `403` for the prefix domain, `303` for a real
same-origin post, `400` for the webhook, `200` for page loads.

### MEDIUM · No rate limiting on any route — FIXED

Nothing anywhere refused a request loop. `/api/export/*` runs the entire profit
reconciliation or listing audit per call, against a server measured at ~33 renders per second
per process (D58) — a cheap CPU denial of service.

Fixed in `lib/security/rate-limit.ts`: 10/minute for `/api/export/*`, 60/minute for other
API routes, per caller. Pages are never limited — a seller clicking around their own
dashboard must not be throttled, and a limiter that locks someone out of their shop has done
more harm than the loop it shed.

Two compromises stated rather than hidden. The store is **in memory**, so N instances allow N
times the limit and a restart forgets everything — honest for one process, useless for a
fleet, and the same position `MemoryTokenStore` is in. The window is **fixed**, so the true
worst case is 2× across a boundary. Both are fine for shedding a runaway loop and neither is
presented as more than it is.

The counter lives on `globalThis` because Next can evaluate a module more than once across
bundles — the mock billing store was two different Maps for exactly that reason (D45b), and a
limiter with two counters is a limiter with twice the limit.

Verified after the fix: 10× `200` then `429` with `Retry-After: 60`; a second caller
unaffected; page loads unaffected.

---

## Verified with no action needed

| Area | How it was checked | Result |
| --- | --- | --- |
| Dependencies | `npm audit --omit=dev` | 0 vulnerabilities |
| Secrets in the client bundle | grep for 6 credential patterns across `.next/static` | 0 hits |
| Server env in client code | grep for non-`NEXT_PUBLIC_` `process.env` in `components/`, `app/` | none |
| Webhook forgery | unsigned POST; forged `stripe-signature` | `400`, body `{"received":false}`, no detail |
| Extension CORS | request with `Origin: chrome-extension://evilextensionid` | no `Access-Control-Allow-Origin` returned; allow-list from `EXTENSION_IDS` |
| Cross-shop reads | `listingId=99999999` (another shop's listing) | `isOwnListing:false`, `health:null`, public/estimated data only |
| Shop scoping | grep every route for a `shopId` taken from the request | none; all from the session via `shopContext()` |
| Input validation | `abc`, `1' OR 1=1`, path traversal, empty | `/^\d+$/` rejects; refusal shape returned |
| Reflected input | invalid dataset in `/api/export/{x}` | JSON `404`, no echo of input |
| SSRF | grep for `fetch()` over a URL built from request input | none |
| CSV formula injection | `csvCell` | `=`, `+`, `-`, `@`, tab, CR prefixed with `'` |
| XSS sinks | grep `dangerouslySetInnerHTML` | one, static content, nonced |
| Open redirect | grep every `redirect()` | all resolve against `request.url` or a fixed path |
| Error responses | `/api/leakprobe` throwing a credential-shaped string | no message, stack or path in the body (D55) |
| Transport headers | live response headers | CSP with nonce, HSTS, frame-ancestors none, nosniff, referrer policy (D52) |

## Limits of this review

Stated so nobody reads more into it than it covers.

- **Authentication is not implemented.** `getSession()` returns a fixed demo session and
  `null` in live mode. Session fixation, session expiry, password handling and account
  takeover are all unreviewable because none of it exists yet. **The CSRF fix must ship
  with that work, not after it**, and the session cookie must be `httpOnly`, `SameSite=Lax`
  or stricter, and `Secure`.
- **No authorization matrix exists** because there is one role and one shop (D20). Multi-shop
  and team access need their own review when they land.
- **`DatabaseTokenStore` is unimplemented**, so encryption at rest is reviewed as
  cryptography (AES-256-GCM, authenticated, key from `TOKEN_ENCRYPTION_KEY`) and not as a
  deployed system.
- **No live Etsy or Stripe credentials exist**, so the OAuth exchange, token refresh and
  webhook handling are reviewed as code and against injected transports, never against the
  real providers. `docs/ETSY-SETUP.md` lists what to verify on the first live call.
- `/api/leakprobe` is a deliberate error-thrower and a test fixture. It refuses in production
  unless `ALLOW_ERROR_PROBE=1`.
