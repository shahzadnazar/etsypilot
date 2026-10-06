"""Promotion, demotion, step-up and the audit log, against a running server.

    python3 tests/browser/fake-gotrue.py 5998 &
    AUTH_MODE=live NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:5998 \
      NEXT_PUBLIC_SUPABASE_ANON_KEY=anon DATABASE_URL=postgres://... \
      SUPER_ADMIN_EMAILS=boss@etsypilot.app ADMIN_EMAILS=ops@etsypilot.app \
      npx next start -p 3100 &
    python3 tests/browser/admin-role-change.py

WHY A BROWSER AND A REAL DATABASE. The unit tests mock the repositories and
the password check, so they prove what the domain DECIDES. They cannot prove
that a promotion reaches Postgres, that a MANAGER is actually refused the
audit log by URL, or — the claim that matters most — that confirming a
password leaves the operator's session cookie exactly as it was. The previous
step in this project found three separate leaks that unit tests reported as
closed; all three were only visible from outside the process.

Supabase Auth is stood in for by tests/browser/fake-gotrue.py, deliberately
rather than mocked away: the app's real @supabase/supabase-js client runs
against it, so what is being observed is that client's actual behaviour.
"""
import json
import os
import sys
import urllib.request

from playwright.sync_api import sync_playwright

from mfa_support import sign_in_with_two_factor

BASE = os.environ.get("ADMIN_BASE_URL", "http://localhost:3100")
GOTRUE = os.environ.get("GOTRUE_URL", "http://127.0.0.1:5998")
CHROME = os.environ.get("CHROME_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

SUPER = ("boss@etsypilot.app", "correct-horse-battery")
ADMIN = ("ops@etsypilot.app", "admin-password-here")
SELLER = ("seller@example.com", "seller-password-x")
SUBJECT = ("promoted@example.com", "manager-password-y")

# SCOPED TO <main>, not the document.
#
# The operator shell's account menu contains a sign-out FORM, whose button is a
# `button[type="submit"]` sitting inside a closed <details>. So on every
# operator page the bare selector now matches that button first, it is never
# actionable, and the click waits thirty seconds and fails. The submit this
# harness means is the one in the page content.

fails, notes = [], []


def check(ok, label):
    (notes if ok else fails).append(("PASS  " if ok else "FAIL  ") + label)


def gotrue_calls():
    with urllib.request.urlopen(f"{GOTRUE}/__calls") as response:
        return json.loads(response.read())


def sign_in(page, email, password):
    """Sign in AND clear the operator two-factor gate.

    This suite used to do the password half only, and had been dying on a
    traceback ever since mandatory operator 2FA landed: an operator who has
    not enrolled is sent to /two-factor, and one who has is sent to
    /two-factor/verify, so /admin/users was never reached in either state.
    The symptom was not a FAIL line, because checks are buffered and printed
    in a summary this never got to — the suite simply stopped measuring.

    mfa_support.sign_in_with_two_factor is the shared helper every other
    operator suite already uses; it handles the password, both gates and the
    second knock the enrollment path needs. The networkidle note that used to
    live here lives in that helper now, for the same reason.
    """
    sign_in_with_two_factor(page, BASE, email, password)


def refuse_if_rate_limited(page):
    """Abort loudly if the step-up limiter has closed, rather than on a traceback.

    /admin/step-up allows 10 confirmations per 15 minutes per operator, and
    this suite spends about five. So it runs cleanly once per window and the
    SECOND consecutive run is refused by the limiter — the product working,
    not a defect. That used to surface as a 30-second wait_for_url timeout and
    a traceback, which skipped the summary and took every buffered check with
    it: a suite that reported nothing at all.

    The limiter is in-memory, so restarting the server opens the window
    immediately; that is the first remedy printed because it is the fast one.
    """
    if "outcome=RATE_LIMITED" not in page.url:
        return
    print(
        "PRECONDITION: the step-up rate limiter has closed for this operator.\n"
        "  the limit:  10 password confirmations per 15 minutes "
        "(lib/security/rate-limit.ts, LIMITS.stepUp)\n"
        "  this suite: about five, so it runs once per window\n"
        "  restart the server to clear it (the limiter is in memory), "
        "or wait out the window.\n"
        "  (the refusal itself is the product working — it is also asserted, "
        "deliberately, elsewhere in this file.)"
    )
    sys.exit(2)


def settled(page, path):
    """Go to an operator page and read it once the SKELETON has gone.

    `wait_until="load"` fires with loading.tsx on screen and the rows still
    streaming, so inner_text() returns placeholder text and every `"X" in
    body` check below fails for a reason that has nothing to do with the thing
    being checked. Measured: six checks here went red together while the audit
    log itself was correct, which the database confirmed.

    The readiness signal is aria-busy being DETACHED, deliberately not any
    string a check looks for. Waiting for one of those would make that check
    unable to fail — the wait would time out instead.
    """
    page.goto(f"{BASE}{path}", wait_until="networkidle")
    page.wait_for_selector('[aria-busy="true"]', state="detached", timeout=30000)
    return page.inner_text("body")


def sign_out(context, page):
    context.clear_cookies()
    page.goto(f"{BASE}/login", wait_until="networkidle")


def sb_cookies(context):
    return sorted(
        (c["name"], c["value"]) for c in context.cookies() if c["name"].startswith("sb-")
    )


def status_of(page, path):
    response = page.goto(f"{BASE}{path}", wait_until="load")
    return response.status if response else 0


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME)

        # ---- every account gets a row by signing in once -------------------
        # Provisioning runs on sign-in, so this is how the accounts come to
        # exist at all. No seed script writes them.
        for email, password in (SELLER, SUBJECT, ADMIN):
            context = browser.new_context()
            page = context.new_page()
            sign_in(page, email, password)
            # THE FINAL URL CANNOT SAY WHERE THE APP SENT THEM, since operator
            # 2FA. sign_in_with_two_factor finishes by knocking on /admin — it
            # has to, because /admin is the only surface that can prompt for
            # enrollment — so EVERY account ends up at /admin, a seller included
            # (who gets a 404 there, which the next two checks assert). An
            # assertion that /admin or /dashboard is in the URL would therefore
            # be true of anything that got past the password, which is almost
            # vacuous.
            #
            # So this asserts what it can: no gate is still asking. The failure
            # it catches is an account that got in but could not clear the
            # second factor — a broken enrollment screen, a secret the page
            # renders wrongly — which leaves the URL at /two-factor.
            #
            # It does NOT catch a wrong password, and the first version of this
            # comment claimed it did. Measured, by running the suite with one:
            # sign_in_with_two_factor's own wait_for_url times out first and
            # the suite dies on a traceback, several frames above this line.
            # That failure is caught, just not here.
            landed = page.url.split(BASE)[-1]
            check(
                "/login" not in page.url and "/two-factor" not in page.url,
                f"{email} signs in and is provisioned (landed on {landed})",
            )
            # A plain seller must not reach the panel at all.
            if email == SELLER[0]:
                check(status_of(page, "/admin/users") == 404, "a plain seller gets 404 from /admin/users")
                check(status_of(page, "/admin/audit") == 404, "a plain seller gets 404 from /admin/audit")
            context.close()

        # ---- the super admin ------------------------------------------------
        context = browser.new_context()
        page = context.new_page()
        sign_in(page, *SUPER)
        check(
            "/login" not in page.url and "/two-factor" not in page.url,
            f"the super admin signs in (landed on {page.url.split(BASE)[-1]})",
        )

        body = settled(page, "/admin/users")
        check(SUBJECT[0] in body, "the account list shows the subject")
        check("Change role" in body, "the super admin is offered the role control")
        check("Set by environment" in body, "an env-derived role offers no control, and says why")

        subject_row = page.locator("tr", has_text=SUBJECT[0])
        href = subject_row.locator("a", has_text="Change role").get_attribute("href")
        check(bool(href), "the subject's row links to its own confirmation page")
        subject_id = href.rsplit("/role", 1)[0].rsplit("/", 1)[-1]

        # ---- the subject must START as a plain user --------------------------
        #
        # Everything below promotes, then demotes, then submits a no-op, and
        # all three read differently if the subject is already a MANAGER: the
        # confirm button is correctly disabled ("Already a manager") and the
        # click waits thirty seconds and dies. Which is what an ABORTED run
        # leaves behind — the promotion lands before the demotion does, so a
        # run interrupted in the middle (by the rate limiter, say) leaves the
        # subject promoted and the next run cannot start.
        #
        # Stated here, loudly, rather than discovered as a timeout. The suite
        # cannot fix it itself: demoting from here would be the very operation
        # under test, performed outside it.
        subject_role = page.locator("tr", has_text=SUBJECT[0]).inner_text()
        if "manager" in subject_role.lower():
            print(
                f"PRECONDITION: {SUBJECT[0]} must start as a plain USER, and is a MANAGER.\n"
                "  why:    this suite promotes then demotes, so an aborted run leaves it promoted\n"
                "  reset:  psql -c \"update users set platform_role='USER' "
                f"where email='{SUBJECT[0]}';\"\n"
                "  (the audit log keeps the history either way — it is append-only.)"
            )
            sys.exit(2)

        # ---- a wrong password changes nothing --------------------------------
        page.goto(f"{BASE}{href}", wait_until="load")
        check("Confirm your password" in page.inner_text("body"), "the confirmation page asks for a password")

        before_cookies = sb_cookies(context)
        check(len(before_cookies) > 0, "the operator holds a session cookie before confirming")

        page.check('input[name="role"][value="MANAGER"]')
        page.fill('input[name="password"]', "definitely-not-the-password")
        page.click('main button[type="submit"]')
        page.wait_for_url("**/role?outcome=*", timeout=15000)

        refused_body = page.inner_text("body")
        check("Not changed" in refused_body, "a wrong password is refused in words")
        check("Password did not match" in refused_body, "and says which check refused it")

        page.goto(f"{BASE}/admin/users", wait_until="load")
        row_text = page.locator("tr", has_text=SUBJECT[0]).inner_text()
        check("manager" not in row_text.lower(), "the subject was NOT promoted by the failed attempt")

        # ---- the real promotion ----------------------------------------------
        page.goto(f"{BASE}{href}", wait_until="load")
        page.check('input[name="role"][value="MANAGER"]')
        page.fill('input[name="password"]', SUPER[1])
        page.click('main button[type="submit"]')
        # A predicate, not a glob: playwright globs have no alternation, and this
        # has to accept the refusal URL too so the limiter check below can see it.
        page.wait_for_url(
            lambda url: "changed=" in url or "outcome=" in url, timeout=15000
        )
        refuse_if_rate_limited(page)

        check("/admin/users" in page.url, "a correct password applies the change and returns to the list")
        page.wait_for_selector('[aria-busy="true"]', state="detached", timeout=30000)
        check("Role changed" in page.inner_text("body"), "the list confirms what happened")

        row_text = page.locator("tr", has_text=SUBJECT[0]).inner_text()
        check("manager" in row_text.lower(), "the subject now reads as manager")

        # ---- THE SESSION CLAIM ------------------------------------------------
        after_cookies = sb_cookies(context)
        check(
            after_cookies == before_cookies,
            "confirming the password did NOT touch the operator's session cookie",
        )
        if after_cookies != before_cookies:
            fails.append(
                f"      before={[n for n, _ in before_cookies]} after={[n for n, _ in after_cookies]}"
            )

        calls = gotrue_calls()
        logouts = [c for c in calls if c["path"] == "/auth/v1/logout"]
        check(len(logouts) > 0, "the throwaway session was revoked at the provider")
        check(
            all(c["scope"] == "local" for c in logouts),
            "every revocation was scope=local, never global",
        )
        # A global logout here would have signed the operator out of every
        # device they own as a side effect of confirming a password.
        grants = [c for c in calls if c.get("grant_type") == "password"]
        check(len(grants) >= 2, "the password was actually checked against the provider")

        # ---- the audit log ----------------------------------------------------
        audit = settled(page, "/admin/audit")
        check("Promoted to manager" in audit, "the audit log records the promotion")
        check("Password did not match" in audit, "the audit log records the REFUSED attempt too")
        check(SUPER[0] in audit, "it names the operator who acted")
        check(SUBJECT[0] in audit, "it names the account that was affected")
        check("cannot be edited or removed" in audit, "and says the records cannot be changed")

        # ---- the managers page -------------------------------------------------
        managers = settled(page, "/admin/managers")
        check(SUBJECT[0] in managers, "the managers page lists the new manager")
        manager_row = page.locator("tr", has_text=SUBJECT[0]).inner_text()
        check(SUPER[0] in manager_row, "and says who promoted them, read from the audit log")
        check(SELLER[0] not in managers, "a plain seller is not listed as a manager")

        # THE EMAIL COLUMN, not the page and not the whole row. Two earlier
        # versions of this assertion were wrong in two different ways, and both
        # would have "passed" a broken page for the wrong reason:
        #
        #   page text   the operator banner carries the super admin's address
        #               on EVERY screen, so it is always present.
        #   whole row   the super admin's address appears in the subject's row
        #               legitimately — as the person who promoted them, which
        #               is the entire point of the column.
        #
        # What is actually claimed is that nobody whose role comes from an
        # environment variable is LISTED AS a manager, and that is the first
        # cell of a row.
        rows = page.locator("tbody tr")
        listed = [rows.nth(i).locator("td").first.inner_text().strip() for i in range(rows.count())]
        check(
            SUPER[0] not in listed,
            "the super admin is not listed AS a manager (env roles are not in this column)",
        )
        check(SELLER[0] not in listed, "nor is a plain seller")
        check(listed == [SUBJECT[0]], f"exactly the promoted account is listed (got {listed})")
        context.close()

        # ---- what an ADMIN may and may not do -----------------------------------
        context = browser.new_context()
        page = context.new_page()
        sign_in(page, *ADMIN)
        check(status_of(page, "/admin/users") == 200, "an ADMIN can still read the account list")
        admin_body = page.inner_text("body")
        check("Change role" not in admin_body, "an ADMIN is not offered the role control at all")
        check(status_of(page, "/admin/audit") == 404, "an ADMIN gets 404 from the audit log")
        check(
            status_of(page, f"/admin/users/{subject_id}/role") == 404,
            "an ADMIN gets 404 from the role editor by URL",
        )
        context.close()

        # ---- what the new MANAGER may and may not do -----------------------------
        context = browser.new_context()
        page = context.new_page()
        sign_in(page, *SUBJECT)
        check(status_of(page, "/admin/users") == 200, "the new MANAGER can read the account list")
        manager_body = page.inner_text("body")
        check("Change role" not in manager_body, "a MANAGER is not offered the role control")
        check(
            status_of(page, "/admin/audit") == 404,
            "a MANAGER cannot reach the audit log by URL",
        )
        check(
            status_of(page, f"/admin/users/{subject_id}/role") == 404,
            "a MANAGER cannot reach the role editor by URL",
        )
        context.close()

        # ---- demotion, to prove the path runs both ways ---------------------------
        context = browser.new_context()
        page = context.new_page()
        sign_in(page, *SUPER)
        page.goto(f"{BASE}/admin/users/{subject_id}/role", wait_until="load")
        page.check('input[name="role"][value="USER"]')
        page.fill('input[name="password"]', SUPER[1])
        page.click('main button[type="submit"]')
        # A predicate, not a glob: playwright globs have no alternation, and this
        # has to accept the refusal URL too so the limiter check below can see it.
        page.wait_for_url(
            lambda url: "changed=" in url or "outcome=" in url, timeout=15000
        )
        refuse_if_rate_limited(page)

        managers_after = settled(page, "/admin/managers")
        check(SUBJECT[0] not in managers_after, "a demoted account leaves the managers list")

        check("Demoted to user" in settled(page, "/admin/audit"), "the demotion is recorded as its own event")
        context.close()

        # ---- a submission that changes nothing ------------------------------------
        #
        # FOUND BY HAND: a super admin submitted "Manager" for an account already
        # holding manager, and the log read "manager -> manager  Promoted to
        # manager". The change column was honest and the sentence was not.
        #
        # THREE THINGS HAVE TO HOLD AND ONLY THE THIRD IS SERVER-SIDE, which is why
        # this block is here and not in a unit test. The disabling is a client
        # component that listens to the form; the first version of it created a ref
        # and never attached it, so it rendered a button that was never disabled and
        # every unit assertion about it still passed. Nothing but a browser sees
        # that.
        context = browser.new_context()
        page = context.new_page()
        sign_in(page, *SUPER)
        page.goto(f"{BASE}/admin/users/{subject_id}/role", wait_until="load")
        page.wait_for_timeout(800)  # the control disables after hydration, not before

        # COUNTED BEFORE THE NO-OP, because the log is append-only.
        #
        # The check at the end of this block asked for exactly one 'Promoted to
        # manager' in the whole log, which is only true on a virgin database:
        # the operator audit log cannot delete its own rows — that is the point
        # of it — so every previous run of this suite leaves one behind and the
        # check fails on the second run for a reason that is not a defect.
        # What it MEANS is "the no-op added nothing", so that is what it now
        # measures: the count before, and the same count after.
        promotions_before = settled(page, "/admin/audit").count("Promoted to manager")
        page.goto(f"{BASE}/admin/users/{subject_id}/role", wait_until="load")
        page.wait_for_timeout(800)

        submit = "form:has(input[name='role']) button[type='submit']"
        checked = page.eval_on_selector_all(
            "input[name='role']", "els => els.filter(e => e.checked).map(e => e.value)"
        )
        check(checked == ["USER"], f"the form pre-selects the role already held ({checked})")
        check(
            page.eval_on_selector(submit, "e => e.disabled") is True,
            "the submit is disabled while the selection would change nothing",
        )
        check(
            "Already a user" in page.inner_text("form:has(input[name='role'])"),
            "and it says why, rather than greying out with no explanation",
        )
        page.check("input[name='role'][value='MANAGER']")
        page.wait_for_timeout(300)
        check(
            page.eval_on_selector(submit, "e => e.disabled") is False,
            "and re-enables the moment the selection would change something",
        )

        # Back to the role already held, which is the whole point: what is about
        # to be submitted is a no-op.
        page.check("input[name='role'][value='USER']")
        page.wait_for_timeout(300)

        # Submitted anyway. A disabled button is a convenience, not a gate: a form
        # can be posted without one, and with JavaScript off this button is never
        # disabled at all. What the server does with it is the part that matters.
        page.fill("form input[name='password']", SUPER[1])
        page.eval_on_selector(submit, "e => { e.disabled = false; e.click() }")
        # A predicate, not a glob: playwright globs have no alternation, and this
        # has to accept the refusal URL too so the limiter check below can see it.
        page.wait_for_url(
            lambda url: "changed=" in url or "outcome=" in url, timeout=15000
        )
        refuse_if_rate_limited(page)

        log = settled(page, "/admin/audit")
        check("No change" in log, "a submitted no-op is RECORDED, and recorded as 'No change'")
        check(
            "user \u2192 to user No change" in " ".join(log.split()),
            "the change column stays honest: it still says user to user",
        )
        check(
            log.count("Promoted to manager") == promotions_before,
            f"and it added no 'Promoted to manager' to the log "
            f"(was {promotions_before}, now {log.count('Promoted to manager')})",
        )
        context.close()

        browser.close()


main()

print("\n".join(notes))
if fails:
    print("\n" + "\n".join(fails))
    print(f"\n{len([f for f in fails if f.startswith('FAIL')])} FAILED of {len(fails) + len(notes)}")
    sys.exit(1)
print(f"\nALL {len(notes)} ROLE-CHANGE CHECKS PASSED")
