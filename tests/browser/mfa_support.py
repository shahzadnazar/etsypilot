"""Getting a browser check past the two-factor gate.

── WHY EVERY OPERATOR SUITE NEEDS THIS NOW ────────────────────────────────

/admin requires aal2: a verified second factor AND a session that used it. So
`sign_in()` no longer lands a check on the console — it lands on /two-factor or
/two-factor/verify, and every assertion after it measures a screen nobody
expected. That is not a problem to work around; it is the feature working, and
the checks have to do what an operator does.

── IT IS ONE MODULE, NOT FIVE COPIES ──────────────────────────────────────

Five suites sign operators in. Five copies of a TOTP implementation is five
places for a subtly different one, and the one that drifted would fail in a way
that reads as a bug in the app. It lives here, with the secrets read from the
fake provider's state endpoint — which is how a check stands in for the person
holding the phone.

THIS IS TEST-ONLY AND CANNOT BE OTHERWISE. It reads secrets from
tests/browser/fake-gotrue.py's /__state, which exists only in that file and is
never reachable from a deployment: the app's provider URL comes from
NEXT_PUBLIC_SUPABASE_URL, and real Supabase has no such endpoint. Nothing in
app/, lib/ or domain/ imports anything here.

── THE THREE WAITS THAT LOOK RIGHT AND ARE NOT ────────────────────────────

All three were written, all three looked correct, and all three produced the
same wrong answer: an enrolled account reported as having no gate to clear.

Signing in is TWO HOPS. The action redirects to /dashboard, and /dashboard
redirects an enrolled aal1 session on to /two-factor/verify. Next's router puts
/dashboard in the address bar OPTIMISTICALLY while it is still fetching that
route, and the dashboard layout is slow enough (shop, plan, actions, posture)
that the intermediate state lasts over a second. So:

    wait_for_url(lambda u: "/dashboard" in u)     matches the hop
    wait_for_load_state("networkidle")            returns inside the hop
    polling for a URL stable for 600ms            finds the hop holding still

Every assertion afterwards then measured an aal1 session that was supposed to
be aal2, which reads as a bug in the gate. Instrumenting the gate showed it
resolving the posture correctly on every single request. The defect was the
measurement, three times over.

A plain goto() asks the server and gets a real answer, with no optimistic URL
in between, so that is what this does.
"""
import base64
import hashlib
import hmac
import json
import struct
import time
import urllib.request

GOTRUE = "http://127.0.0.1:5998"


def totp(secret, drift=0):
    """RFC 6238, SHA-1, six digits, 30-second step — the authenticator default."""
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    counter = int(time.time() // 30) + drift
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return f"{value % 1_000_000:06d}"


def provider_state():
    return json.loads(urllib.request.urlopen(GOTRUE + "/__state").read())


def secret_for(email):
    """The enrolled TOTP secret, as the person's phone would hold it."""
    for factor in provider_state()["factors"].get(email, []):
        if factor["factor_type"] == "totp" and factor["status"] == "verified":
            return factor["secret"]
    return None


def pass_two_factor(page, base, email, timeout=25000):
    """Whatever the gate is asking for, supply it. Returns where it landed.

    Handles both halves, because which one applies depends on whether this
    account has enrolled before in this provider's lifetime:

      /two-factor         never enrolled — walk the setup screen, reading the
                          secret the screen itself displays
      /two-factor/verify  enrolled, aal1 — read the stored secret and step up

    Anything else is left alone, so calling this when the gate is not asking is
    a no-op rather than an error.
    """
    if "/two-factor/verify" in page.url:
        secret = secret_for(email)
        if not secret:
            raise RuntimeError(f"{email} is at the code screen with no enrolled factor")
        page.fill('input[name="code"]', totp(secret))
        before = page.url
        page.click('form:has(input[name="code"]) button[type="submit"]')
        page.wait_for_url(lambda url: url != before, timeout=timeout)
        page.wait_for_load_state("networkidle")
        return page.url

    if "/two-factor" in page.url:
        # THE SECRET IS READ OFF THE SCREEN, not from the provider. That is
        # what a person does, and it means a screen showing the wrong secret
        # fails here instead of passing.
        secret = page.inner_text("[data-totp-secret]")
        page.fill('input[name="code"]', totp(secret))
        page.click('button[type="submit"]')
        page.wait_for_selector("[data-recovery-codes]", timeout=timeout)
        return page.url

    return page.url


def _clear_gate_at(page, base, path, email, timeout):
    """Ask the server for `path`, and satisfy whatever it demands."""
    page.goto(f"{base}{path}", wait_until="networkidle")
    for _ in range(3):
        if "/two-factor" not in page.url:
            break
        pass_two_factor(page, base, email, timeout=timeout)
        page.goto(f"{base}{path}", wait_until="networkidle")
    return page.url


def sign_in_with_two_factor(page, base, email, password, timeout=25000):
    """Sign in and clear the gate, landing where an operator would land.

    TWO KNOCKS, and the second one is not redundant.

    The seller app asks for a second factor only from an account that HAS one,
    because enrolling is optional for sellers. So an operator who has never
    enrolled sails straight through /dashboard, and a helper that stopped there
    would hand the suite a session that fails at the console's door several
    assertions later, as a mystery about navigation.

    /admin is the only surface that REQUIRES enrollment, so it is the only
    place that can prompt for it. A non-operator gets a 404 there and nothing
    else happens, which is the right outcome for them and costs one request.
    """
    page.goto(f"{base}/login", wait_until="networkidle")
    page.fill('input[name="email"]', email)
    page.fill('input[name="password"]', password)
    page.click('main button[type="submit"]')
    page.wait_for_url(lambda url: "/dashboard" in url or "/two-factor" in url, timeout=timeout)

    _clear_gate_at(page, base, "/dashboard", email, timeout)
    _clear_gate_at(page, base, "/admin", email, timeout)
    return page.url
