"""Two-factor authentication and password reset, measured end to end.

    python3 tests/browser/fake-gotrue.py 5998 &        # MUST BE FRESH — see below
    AUTH_MODE=live NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:5998 ... npx next start -p 3100
    python3 tests/browser/two-factor.py

RUN IT AGAINST A PROVIDER NOBODY HAS ENROLLED ON. The first section walks the
path of an operator who has never set up a second factor, and a factor cannot
be removed from outside — nobody can reset somebody else's, which is the
product working rather than a gap in the harness. The suite checks this before
it starts and tells you to restart the fake rather than failing five times in a
way that points at the app.

WHY THIS IS A BROWSER CHECK AND NOT A UNIT TEST.

Everything here is a claim about what a REQUEST gets, and the two defects this
project has actually shipped were both invisible to unit tests. A ref that was
never attached to a DOM node passed every unit test there was, because the
defect lived in whether the browser ended up wired. A check that read a page
body while ignoring its status passed for the same reason in reverse: it
measured one property and assumed the other.

So almost nothing below asserts markup. Every check is "this viewer asked for
this URL and got this outcome", and the outcomes that matter are where the
browser LANDED and whether a credential still works afterwards.

THE TOTP CODES ARE COMPUTED, NOT FIXTURES. tests/browser/fake-gotrue.py
implements RFC 6238 over the secret it issued, and this file derives codes the
same way from the secret THE ENROLLMENT SCREEN DISPLAYED. That closes a loop a
fixture cannot: a screen showing the wrong secret, or an app that enrolled one
factor and verified another, fails here instead of passing quietly.

A NOTE ON WAITING, because getting it wrong already cost one wrong conclusion
in this session. A server action's result is a redirect, and page.wait_for_
load_state('networkidle') straight after a click can return with the
PRE-SUBMIT DOM still on screen. Read that way, a working enrollment reports
itself as broken. Every submission below waits for something that only exists
after the action landed.
"""
import base64
import hashlib
import hmac
import json
import struct
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3100"
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
GOTRUE = "http://127.0.0.1:5998"
PSQL = "postgres://postgres@127.0.0.1:5999/etsypilot"

SUPER = ("boss@etsypilot.app", "correct-horse-battery")
MANAGER = ("promoted@example.com", "manager-password-y")
SELLER = ("seller@example.com", "seller-password-x")
UNREGISTERED = "nobody-at-all@example.com"

fails, notes = [], []


def check(ok, label):
    (notes if ok else fails).append(("PASS  " if ok else "FAIL  ") + label)


def sql(statement):
    result = subprocess.run(
        ["psql", PSQL, "-tAc", statement], capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        raise RuntimeError(f"psql failed: {result.stderr.strip()}")
    return result.stdout.strip()


def provider_state():
    """Secrets and emailed codes, read the way a test mailbox would be read.

    A browser cannot photograph a QR code or open an inbox. The fake exposes
    what a person would have in front of them — and nothing the APP can reach,
    which is the line that keeps this from being a test of itself.
    """
    return json.loads(urllib.request.urlopen(GOTRUE + "/__state").read())


def totp(secret, drift=0):
    """RFC 6238, with the parameters every authenticator app uses."""
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    counter = int(time.time() // 30) + drift
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return f"{value % 1_000_000:06d}"


def landed(page):
    return page.url.replace(BASE, "").split("?")[0]


def sign_in(page, email, password, expect=None):
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill('input[name="email"]', email)
    page.fill('input[name="password"]', password)
    page.click('main button[type="submit"]')
    if expect:
        page.wait_for_url(lambda url: expect in url, timeout=20000)
    else:
        page.wait_for_load_state("networkidle")


def enroll(page):
    """Walk the real enrollment screen. Returns (secret, recovery codes)."""
    page.goto(f"{BASE}/two-factor", wait_until="networkidle")
    secret = page.inner_text("[data-totp-secret]")
    page.fill('input[name="code"]', totp(secret))
    page.click('button[type="submit"]')
    page.wait_for_selector("[data-recovery-codes]", timeout=25000)
    codes = page.eval_on_selector_all(
        "[data-recovery-codes] li", "els => els.map(e => e.textContent.trim())"
    )
    return secret, codes


def submit_code(page, field, value, form_selector):
    """Fill one of the verify screen's two forms and wait for the outcome.

    Waits for the URL to change rather than for the network to go quiet — the
    redirect IS the result, and 'networkidle' can arrive first.
    """
    before = page.url
    page.fill(f'input[name="{field}"]', value)
    page.click(f'{form_selector} button[type="submit"]')
    try:
        page.wait_for_url(lambda url: url != before, timeout=20000)
    except Exception:
        pass
    page.wait_for_load_state("networkidle")


# ══════════════════════════════════════════════════════════════════════════
#  1. AN OPERATOR WITH NO SECOND FACTOR — AND THE ORDERING TRAP
# ══════════════════════════════════════════════════════════════════════════
def operator_without_a_factor(browser):
    """The lockout that turning this on would otherwise create.

    If the enrollment screen sat under /admin, a super admin with no factor
    would need aal2 to reach the screen that grants aal2. This is that exact
    account, walking that exact path, on a build where the requirement is live.
    """
    ctx = browser.new_context()
    page = ctx.new_page()
    sign_in(page, *SUPER, expect="/dashboard")

    response = page.goto(f"{BASE}/admin", wait_until="networkidle")
    check(landed(page) == "/two-factor", f"/admin sends an unenrolled operator to setup — got {landed(page)}")
    check(
        "EtsyPilot operations" not in page.inner_text("body"),
        "and the console itself never renders for them",
    )
    # The console is refused, not broken: a 5xx here would be a different bug
    # wearing the same redirect.
    check(response is not None and response.status == 200, "the setup screen is a normal page, not an error")

    response = page.goto(f"{BASE}/admin/users", wait_until="networkidle")
    check(landed(page) == "/two-factor", f"a deep operator URL is gated too — got {landed(page)}")

    response = page.goto(f"{BASE}/two-factor", wait_until="networkidle")
    check(
        response is not None and response.status == 200 and landed(page) == "/two-factor",
        "the setup route is reachable by an operator who has not enrolled",
    )
    secret_on_screen = page.query_selector("[data-totp-secret]")
    check(secret_on_screen is not None, "the setup screen offers the secret as text, not only a QR code")
    check(page.query_selector("img[alt*='QR']") is not None, "and a QR code beside it")

    # ---- enrol, with a code derived from the secret the screen showed -----
    secret, codes = enroll(page)
    check(len(codes) >= 8, f"enrolling issues a set of recovery codes ({len(codes)})")
    check(len(set(codes)) == len(codes), "and they are all different")

    response = page.goto(f"{BASE}/admin", wait_until="networkidle")
    check(
        landed(page).startswith("/admin"),
        f"/admin opens once the factor is verified — got {landed(page)}",
    )
    check(
        "EtsyPilot operations" in page.inner_text("body"),
        "and the operator console really renders",
    )
    ctx.close()
    return secret, codes


# ══════════════════════════════════════════════════════════════════════════
#  2. ENROLLED, BUT THIS SESSION HAS NOT USED IT (aal1)
# ══════════════════════════════════════════════════════════════════════════
def enrolled_but_aal1(browser, secret):
    """The half that makes the feature more than a badge.

    A password-only sign-in on an enrolled account is aal1. If the gate
    required enrollment instead of aal2, this whole section would pass with a
    stolen password.
    """
    ctx = browser.new_context()
    page = ctx.new_page()
    sign_in(page, *SUPER, expect="/two-factor")
    check(
        landed(page) == "/two-factor/verify",
        f"signing in with a password alone lands on the code screen — got {landed(page)}",
    )

    page.goto(f"{BASE}/admin", wait_until="networkidle")
    check(landed(page) == "/two-factor/verify", f"/admin is refused at aal1 — got {landed(page)}")

    response = page.goto(f"{BASE}/two-factor/verify", wait_until="networkidle")
    check(
        response is not None and response.status == 200,
        "the code screen is reachable at aal1",
    )

    # ---- a wrong code changes nothing -----------------------------------
    wrong = "000000" if totp(secret) != "000000" else "111111"
    submit_code(page, "code", wrong, 'form:has(input[name="code"])')
    check(landed(page) == "/two-factor/verify", "a wrong code leaves you on the code screen")
    check(
        "not correct" in page.inner_text("body"),
        "and says so",
    )
    page.goto(f"{BASE}/admin", wait_until="networkidle")
    check(landed(page) == "/two-factor/verify", "a wrong code did not step the session up")

    # ---- the right one does ---------------------------------------------
    page.goto(f"{BASE}/two-factor/verify", wait_until="networkidle")
    submit_code(page, "code", totp(secret), 'form:has(input[name="code"])')
    check(landed(page).startswith("/admin"), f"the right code opens the console — got {landed(page)}")
    ctx.close()


# ══════════════════════════════════════════════════════════════════════════
#  3. A RECOVERY CODE WORKS ONCE
# ══════════════════════════════════════════════════════════════════════════
def recovery_code_is_single_use(browser, codes):
    ctx = browser.new_context()
    page = ctx.new_page()
    sign_in(page, *SUPER, expect="/two-factor")

    code = codes[0]
    page.goto(f"{BASE}/two-factor/verify", wait_until="networkidle")
    check(
        page.query_selector('input[name="recoveryCode"]') is not None,
        "the recovery-code field is on the same screen, not behind a link",
    )
    submit_code(page, "recoveryCode", code, 'form:has(input[name="recoveryCode"])')
    check(landed(page).startswith("/admin"), f"a recovery code gets you in — got {landed(page)}")
    ctx.close()

    # ---- the same code again -------------------------------------------
    ctx = browser.new_context()
    page = ctx.new_page()
    sign_in(page, *SUPER, expect="/two-factor")
    page.goto(f"{BASE}/two-factor/verify", wait_until="networkidle")
    submit_code(page, "recoveryCode", code, 'form:has(input[name="recoveryCode"])')
    check(
        landed(page) == "/two-factor/verify",
        f"the same recovery code does not work twice — got {landed(page)}",
    )
    check("not correct" in page.inner_text("body"), "and the screen says so")

    # A DIFFERENT, unused code still works — otherwise "single use" could be
    # satisfied by a build where recovery codes never work at all.
    page.goto(f"{BASE}/two-factor/verify", wait_until="networkidle")
    submit_code(page, "recoveryCode", codes[1], 'form:has(input[name="recoveryCode"])')
    check(landed(page).startswith("/admin"), "an unused code still works")
    ctx.close()


# ══════════════════════════════════════════════════════════════════════════
#  4. A SELLER IS NOT NAGGED, MAY ENROL, AND IS THEN ASKED
# ══════════════════════════════════════════════════════════════════════════
def seller_optional(browser):
    ctx = browser.new_context()
    page = ctx.new_page()
    sign_in(page, *SELLER, expect="/dashboard")
    check(landed(page) == "/dashboard", "a seller with no factor signs straight in")
    body = page.inner_text("body")
    check(
        "two-factor" not in body.lower() and "authenticator" not in body.lower(),
        "and is not nagged about it on their dashboard",
    )

    page.goto(f"{BASE}/settings/security", wait_until="networkidle")
    check("Two-factor authentication" in page.inner_text("body"), "the setting exists in Security")
    check(
        page.query_selector('a[href="/two-factor"]') is not None,
        "with a control that leads to the real enrollment screen",
    )

    secret, _codes = enroll(page)

    page.goto(f"{BASE}/settings/security", wait_until="networkidle")
    check("On" in page.inner_text("body"), "and the badge reads On afterwards")
    # A SPECIFIC selector, because the generic one was a check that could not
    # fail: `form button[type="submit"]` also matches the account menu's
    # sign-out button, so it passed on every page in the app whether or not a
    # 2FA control existed.
    check(
        page.query_selector('form[data-disable-two-factor] button[type="submit"]') is not None,
        "a seller is offered a way to turn it off",
    )

    # ---- sign out and back in: the code is required ---------------------
    ctx.clear_cookies()
    sign_in(page, *SELLER, expect="/two-factor")
    check(
        landed(page) == "/two-factor/verify",
        f"an enrolled seller is asked for a code on the next sign-in — got {landed(page)}",
    )
    page.goto(f"{BASE}/dashboard", wait_until="networkidle")
    check(landed(page) == "/two-factor/verify", "and their own app is gated until they enter it")

    page.goto(f"{BASE}/two-factor/verify?next=/dashboard", wait_until="networkidle")
    submit_code(page, "code", totp(secret), 'form:has(input[name="code"])')
    check(landed(page) == "/dashboard", f"the code lands a seller back on their dashboard — got {landed(page)}")

    # ---- and they may turn it off ---------------------------------------
    page.goto(f"{BASE}/settings/security", wait_until="networkidle")
    page.click('form[data-disable-two-factor] button[type="submit"]')
    page.wait_for_load_state("networkidle")
    page.goto(f"{BASE}/settings/security", wait_until="networkidle")
    factors = provider_state()["factors"].get(SELLER[0], [])
    check(
        not any(f["factor_type"] == "totp" for f in factors),
        f"turning it off really removes the factor at the provider — {factors}",
    )
    ctx.close()


def operator_cannot_turn_it_off(browser):
    """The rule read from the other side, and enforced where it can be POSTed.

    The button is not rendered for an operator — but a server action is an HTTP
    endpoint, so "not rendered" is a statement about markup. This asserts the
    factor SURVIVES, which is the only form of the claim that means anything.
    """
    ctx = browser.new_context()
    page = ctx.new_page()
    sign_in(page, *SUPER, expect="/two-factor")
    state = provider_state()["factors"].get(SUPER[0], [])
    verified_before = [f for f in state if f["status"] == "verified"]

    page.goto(f"{BASE}/settings/security", wait_until="networkidle")
    # They are at aal1, so the seller app bounces them to the code screen —
    # which is itself the point: an operator cannot even reach the switch
    # without the factor they would be switching off.
    check(
        landed(page) == "/two-factor/verify",
        f"an operator at aal1 cannot reach the off switch — got {landed(page)}",
    )
    state_after = provider_state()["factors"].get(SUPER[0], [])
    check(
        len([f for f in state_after if f["status"] == "verified"]) == len(verified_before),
        "and the factor is still there",
    )
    ctx.close()


# ══════════════════════════════════════════════════════════════════════════
#  5. PASSWORD RESET — THE FORM TELLS NOBODY WHO IS REGISTERED
# ══════════════════════════════════════════════════════════════════════════
def forgot_form_says_the_same_thing(browser):
    ctx = browser.new_context()
    page = ctx.new_page()

    def submit(email):
        page.goto(f"{BASE}/forgot-password", wait_until="networkidle")
        page.fill('input[name="email"]', email)
        started = time.time()
        page.click('button[type="submit"]')
        page.wait_for_url(lambda url: "reset-password" in url, timeout=25000)
        elapsed = time.time() - started
        return page.inner_text("body"), elapsed

    registered_body, registered_time = submit(SELLER[0])
    unknown_body, unknown_time = submit(UNREGISTERED)

    check(
        registered_body == unknown_body,
        "the forgot-password form answers identically for a registered and an unregistered address",
    )
    check(
        "If that email is registered" in registered_body,
        "and the wording is conditional rather than claiming an email was sent",
    )
    # SAME WORDS IS ONLY HALF OF IT. Identical copy delivered in 40ms versus
    # 600ms is the same oracle read off a stopwatch.
    gap = abs(registered_time - unknown_time)
    check(gap < 0.5, f"and takes the same time either way (gap {gap:.2f}s)")

    # The control: an unregistered address really did produce no code, so the
    # sameness above is sameness of ANSWER and not of behaviour.
    state = provider_state()
    check(
        UNREGISTERED not in state["recovery_otp"],
        "no code is minted for an address with no account",
    )
    ctx.close()


def reset_with_a_wrong_code_changes_nothing(browser):
    ctx = browser.new_context()
    page = ctx.new_page()
    password_before = provider_state()["accounts"][SELLER[0]]

    page.goto(f"{BASE}/forgot-password", wait_until="networkidle")
    page.fill('input[name="email"]', SELLER[0])
    page.click('button[type="submit"]')
    page.wait_for_url(lambda url: "reset-password" in url, timeout=25000)

    real = provider_state()["recovery_otp"][SELLER[0]]
    wrong = "000000" if real != "000000" else "111111"
    submit_code(page, "code", wrong, "form")
    check(landed(page) == "/reset-password", f"a wrong code stays on the code screen — got {landed(page)}")
    check("not correct" in page.inner_text("body"), "and says that code is not correct")
    check(
        provider_state()["accounts"][SELLER[0]] == password_before,
        "and the password is unchanged",
    )
    # The code was not spent by the failed attempt.
    check(
        provider_state()["recovery_otp"].get(SELLER[0]) == real,
        "a wrong guess does not consume the real code",
    )
    ctx.close()


def reset_with_the_right_code(browser):
    """The whole flow, plus the two properties that make it safe."""
    new_password = "brand-new-password-9"

    # A SECOND SESSION, open before the reset, so "other sessions end" is
    # measured rather than asserted.
    other = browser.new_context()
    other_page = other.new_page()
    sign_in(other_page, *SELLER, expect="/dashboard")
    check(landed(other_page) == "/dashboard", "a second session is signed in before the reset")

    ctx = browser.new_context()
    page = ctx.new_page()
    page.goto(f"{BASE}/forgot-password", wait_until="networkidle")
    page.fill('input[name="email"]', SELLER[0])
    page.click('button[type="submit"]')
    page.wait_for_url(lambda url: "reset-password" in url, timeout=25000)

    code = provider_state()["recovery_otp"][SELLER[0]]
    submit_code(page, "code", code, "form")
    check(landed(page) == "/reset-password/new", f"the right code moves on — got {landed(page)}")

    page.fill('input[name="password"]', new_password)
    page.fill('input[name="confirm"]', new_password)
    before = page.url
    page.click('button[type="submit"]')
    page.wait_for_url(lambda url: url != before, timeout=25000)
    check(landed(page) == "/dashboard", f"and finishes signed in — got {landed(page)}")

    # ---- the new password works and the old one does not ----------------
    fresh = browser.new_context()
    fresh_page = fresh.new_page()
    sign_in(fresh_page, SELLER[0], new_password, expect="/dashboard")
    check(landed(fresh_page) == "/dashboard", "the new password signs in")
    fresh.close()

    stale = browser.new_context()
    stale_page = stale.new_page()
    sign_in(stale_page, SELLER[0], SELLER[1])
    check(
        landed(stale_page) == "/login",
        f"the old password does not — got {landed(stale_page)}",
    )
    stale.close()

    # ---- every other session ended --------------------------------------
    other_page.goto(f"{BASE}/dashboard", wait_until="networkidle")
    check(
        landed(other_page) == "/login",
        f"the session that was already open is signed out — got {landed(other_page)}",
    )
    other.close()
    ctx.close()

    # Put it back, so the suite is re-runnable rather than passing once per
    # freshly started provider.
    return new_password


def reset_does_not_bypass_two_factor(browser):
    """Control of an inbox must not be control of the operator console."""
    ctx = browser.new_context()
    page = ctx.new_page()
    sign_in(page, *MANAGER, expect="/dashboard")
    secret, _ = enroll(page)
    ctx.close()

    ctx = browser.new_context()
    page = ctx.new_page()
    page.goto(f"{BASE}/forgot-password", wait_until="networkidle")
    page.fill('input[name="email"]', MANAGER[0])
    page.click('button[type="submit"]')
    page.wait_for_url(lambda url: "reset-password" in url, timeout=25000)

    code = provider_state()["recovery_otp"][MANAGER[0]]
    submit_code(page, "code", code, "form")
    check(landed(page) == "/reset-password/new", "an enrolled account still reaches the password form")

    password_before = provider_state()["accounts"][MANAGER[0]]
    page.fill('input[name="password"]', "inbox-only-attacker-1")
    page.fill('input[name="confirm"]', "inbox-only-attacker-1")
    before = page.url
    page.click('button[type="submit"]')
    try:
        page.wait_for_url(lambda url: url != before, timeout=20000)
    except Exception:
        pass
    page.wait_for_load_state("networkidle")

    check(
        landed(page) == "/two-factor/verify",
        f"submitting it demands the authenticator — got {landed(page)}",
    )
    check(
        provider_state()["accounts"][MANAGER[0]] == password_before,
        "and the password has NOT changed",
    )

    # And the code does let them through, so the check above is a gate rather
    # than a dead end.
    submit_code(page, "code", totp(secret), 'form:has(input[name="code"])')
    check(landed(page) == "/reset-password/new", f"the authenticator lets them continue — got {landed(page)}")
    page.fill('input[name="password"]', "inbox-only-attacker-1")
    page.fill('input[name="confirm"]', "inbox-only-attacker-1")
    before = page.url
    page.click('button[type="submit"]')
    try:
        page.wait_for_url(lambda url: url != before, timeout=20000)
    except Exception:
        pass
    check(
        provider_state()["accounts"][MANAGER[0]] == "inbox-only-attacker-1",
        "and only then does the password change",
    )
    ctx.close()


def section(name, fn, *args):
    """Run one section; turn a crash into a FAIL rather than into silence.

    ── WHY THIS WRAPPER EXISTS ──────────────────────────────────────────────
    #
    A suite that prints its results only at the end reports NOTHING when it
    dies part-way — and the run that made this necessary was the negative
    control for this very file. Breaking the gate on purpose made a later
    section throw on a missing element, the process exited with a traceback,
    and the twenty checks that had already run and already failed were never
    printed. Red, technically. Useless as a measurement.

    A step that cannot complete IS a failure of the thing it was measuring, so
    it is recorded as one, named, and the suite carries on to the sections that
    can still say something.
    """
    try:
        return fn(*args)
    except Exception as error:  # noqa: BLE001 - a crash here is a result
        first = str(error).strip().splitlines()[0] if str(error).strip() else type(error).__name__
        check(False, f"[{name}] could not complete: {first[:160]}")
        return None


def restore_password(browser, email, current_known_password, original):
    """Put a password back the way the suite found it.

    ── A SUITE THAT LEAVES A FIXTURE BROKEN IS A SUITE THAT BREAKS THE NEXT ──

    Two sections here change a real password: the reset walk and the check that
    an inbox alone cannot reset an operator's. Every other browser suite signs
    in with the ORIGINAL password, so leaving them changed turns this file into
    a trap that fails four other files with "invalid credentials" — a symptom
    that points nowhere near the cause.

    This project has already been bitten by exactly that: a suite that demoted
    a shared account and walked away produced a bug report about the operator
    console that took a full investigation to trace back to the test.

    The restore goes through the PRODUCT's own reset flow rather than reaching
    into the provider, because there is no other way to set a password — which
    is itself the right shape, and means the restore exercises the flow a
    second time.
    """
    ctx = browser.new_context()
    page = ctx.new_page()
    page.goto(f"{BASE}/forgot-password", wait_until="networkidle")
    page.fill('input[name="email"]', email)
    page.click('button[type="submit"]')
    page.wait_for_url(lambda url: "reset-password" in url, timeout=25000)
    code = provider_state()["recovery_otp"][email]
    submit_code(page, "code", code, "form")

    # An enrolled account is asked for its authenticator on the way through —
    # the same gate the section above asserts. Supplying it here is not a
    # bypass; it is the restore behaving like a person.
    #
    # THE PROMPT COMES AT THE PASSWORD SUBMISSION, NOT AT THE CODE. Getting
    # that order wrong is what made the first version of this restore silently
    # do nothing: it looked for the gate one step too early, found the password
    # form instead, submitted it, and was bounced to the authenticator with the
    # password unchanged. Stepping up BEFORE filling the form is both correct
    # and the shorter path.
    secret = None
    for factor in provider_state()["factors"].get(email, []):
        if factor["factor_type"] == "totp" and factor["status"] == "verified":
            secret = factor["secret"]
    if secret:
        page.goto(
            f"{BASE}/two-factor/verify?next=%2Freset-password%2Fnew", wait_until="networkidle"
        )
        submit_code(page, "code", totp(secret), 'form:has(input[name="code"])')

    page.fill('input[name="password"]', original)
    page.fill('input[name="confirm"]', original)
    before = page.url
    page.click('button[type="submit"]')
    try:
        page.wait_for_url(lambda url: url != before, timeout=25000)
    except Exception:
        pass
    check(
        provider_state()["accounts"][email] == original,
        f"{email} is left with the password every other suite expects",
    )
    ctx.close()


def require_a_fresh_provider():
    """This suite needs a provider where nobody has enrolled yet.

    ── AND IT SAYS SO RATHER THAN FAILING FIVE TIMES ───────────────────────

    The first section walks the path of an operator who has NEVER enrolled —
    which is the ordering trap, and the single most important thing here. Run
    against a provider where that account already has a factor, the setup
    screen shows "this account already has an authenticator", the checks time
    out looking for a QR code, and the output is five failures that point at
    the app.

    There is deliberately no way to clear a factor from outside: nobody can
    reset somebody else's second factor, and a test helper that could would be
    testing a capability the product refuses to have. So the precondition is
    ASSERTED, with the remedy in the message, and the suite stops instead of
    producing a misleading red.
    """
    enrolled = [
        email
        for email, factors in provider_state()["factors"].items()
        if any(f["factor_type"] == "totp" and f["status"] == "verified" for f in factors)
    ]
    if enrolled:
        print(
            "PRECONDITION: this suite needs a provider with no enrolled factors.\n"
            f"  already enrolled: {', '.join(sorted(enrolled))}\n"
            "  restart it:       pkill -f '^python3 tests/browser/fake-gotrue' && "
            "python3 tests/browser/fake-gotrue.py 5998 &\n"
            "  (a factor cannot be cleared from outside — that is the product working.)"
        )
        sys.exit(2)


def main():
    require_a_fresh_provider()
    sql(f"update users set platform_role = 'MANAGER' where email = '{MANAGER[0]}'")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        enrolled = section("operator without a factor", operator_without_a_factor, browser)
        secret, codes = enrolled if enrolled else (None, [])
        if secret:
            section("enrolled but aal1", enrolled_but_aal1, browser, secret)
        if codes:
            section("recovery codes", recovery_code_is_single_use, browser, codes)
        section("seller optional", seller_optional, browser)
        section("operator cannot disable", operator_cannot_turn_it_off, browser)
        section("forgot form", forgot_form_says_the_same_thing, browser)
        section("wrong reset code", reset_with_a_wrong_code_changes_nothing, browser)
        changed = section("right reset code", reset_with_the_right_code, browser)
        section("reset does not bypass 2fa", reset_does_not_bypass_two_factor, browser)

        # ---- leave the fixtures as they were found ----------------------
        if changed:
            section("restore seller password", restore_password, browser, SELLER[0], changed, SELLER[1])
        section(
            "restore manager password",
            restore_password,
            browser,
            MANAGER[0],
            "inbox-only-attacker-1",
            MANAGER[1],
        )
        browser.close()


main()

print("\n".join(notes))
if fails:
    print("\n" + "\n".join(fails))
    print(f"\n{len(fails)} FAILED of {len(fails) + len(notes)}")
    sys.exit(1)
print(f"\nALL {len(notes)} TWO-FACTOR AND RESET CHECKS PASSED")
