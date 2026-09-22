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

BASE = os.environ.get("ADMIN_BASE_URL", "http://localhost:3100")
GOTRUE = os.environ.get("GOTRUE_URL", "http://127.0.0.1:5998")
CHROME = os.environ.get("CHROME_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

SUPER = ("boss@etsypilot.app", "correct-horse-battery")
ADMIN = ("ops@etsypilot.app", "admin-password-here")
SELLER = ("seller@example.com", "seller-password-x")
SUBJECT = ("promoted@example.com", "manager-password-y")

fails, notes = [], []


def check(ok, label):
    (notes if ok else fails).append(("PASS  " if ok else "FAIL  ") + label)


def gotrue_calls():
    with urllib.request.urlopen(f"{GOTRUE}/__calls") as response:
        return json.loads(response.read())


def sign_in(page, email, password):
    # networkidle rather than load: on a cold server the first submit raced
    # hydration and the POST was swallowed, which looked like a rejected
    # password. Waiting for the page to settle removes the race from the
    # HARNESS without hiding anything about the app.
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill('input[name="email"]', email)
    page.fill('input[name="password"]', password)
    page.click('button[type="submit"]')
    page.wait_for_url(f"{BASE}/dashboard", timeout=15000)


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
            check(
                "/dashboard" in page.url,
                f"{email} signs in and is provisioned (landed on {page.url.split(BASE)[-1]})",
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
        check("/dashboard" in page.url, "the super admin signs in")

        page.goto(f"{BASE}/admin/users", wait_until="load")
        body = page.inner_text("body")
        check(SUBJECT[0] in body, "the account list shows the subject")
        check("Change role" in body, "the super admin is offered the role control")
        check("Set by environment" in body, "an env-derived role offers no control, and says why")

        subject_row = page.locator("tr", has_text=SUBJECT[0])
        href = subject_row.locator("a", has_text="Change role").get_attribute("href")
        check(bool(href), "the subject's row links to its own confirmation page")
        subject_id = href.rsplit("/role", 1)[0].rsplit("/", 1)[-1]

        # ---- a wrong password changes nothing --------------------------------
        page.goto(f"{BASE}{href}", wait_until="load")
        check("Confirm your password" in page.inner_text("body"), "the confirmation page asks for a password")

        before_cookies = sb_cookies(context)
        check(len(before_cookies) > 0, "the operator holds a session cookie before confirming")

        page.check('input[name="role"][value="MANAGER"]')
        page.fill('input[name="password"]', "definitely-not-the-password")
        page.click('button[type="submit"]')
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
        page.click('button[type="submit"]')
        page.wait_for_url("**/admin/users?changed=*", timeout=15000)

        check("/admin/users" in page.url, "a correct password applies the change and returns to the list")
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
        page.goto(f"{BASE}/admin/audit", wait_until="load")
        audit = page.inner_text("body")
        check("Promoted to manager" in audit, "the audit log records the promotion")
        check("Password did not match" in audit, "the audit log records the REFUSED attempt too")
        check(SUPER[0] in audit, "it names the operator who acted")
        check(SUBJECT[0] in audit, "it names the account that was affected")
        check("cannot be edited or removed" in audit, "and says the records cannot be changed")

        # ---- the managers page -------------------------------------------------
        page.goto(f"{BASE}/admin/managers", wait_until="load")
        managers = page.inner_text("body")
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
        page.click('button[type="submit"]')
        page.wait_for_url("**/admin/users?changed=*", timeout=15000)

        page.goto(f"{BASE}/admin/managers", wait_until="load")
        check(SUBJECT[0] not in page.inner_text("body"), "a demoted account leaves the managers list")

        page.goto(f"{BASE}/admin/audit", wait_until="load")
        check("Demoted to user" in page.inner_text("body"), "the demotion is recorded as its own event")
        context.close()

        browser.close()


main()

print("\n".join(notes))
if fails:
    print("\n" + "\n".join(fails))
    print(f"\n{len([f for f in fails if f.startswith('FAIL')])} FAILED of {len(fails) + len(notes)}")
    sys.exit(1)
print(f"\nALL {len(notes)} ROLE-CHANGE CHECKS PASSED")
