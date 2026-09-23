"""The permission matrix, and the transaction that closed A2's audit gap.

    python3 tests/browser/fake-gotrue.py 5998 &
    AUTH_MODE=live NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:5998 \
      NEXT_PUBLIC_SUPABASE_ANON_KEY=anon DATABASE_URL=postgres://... \
      SUPER_ADMIN_EMAILS=boss@etsypilot.app ADMIN_EMAILS=ops@etsypilot.app \
      npx next start -p 3100 &
    python3 tests/browser/admin-permissions.py

WHY THIS EXISTS RATHER THAN MORE UNIT TESTS. The units mock the repositories,
so they prove what the domain decides. Two claims here cannot be checked that
way at all:

  ENFORCEMENT      that unticking a box in one browser session actually takes
                   a page away from a DIFFERENT person in a DIFFERENT session,
                   and that re-ticking gives it back. Mocking the store out is
                   mocking out the thing in question.

  THE TRANSACTION  that a failing audit write leaves platform_role unchanged.
                   A mock that throws proves the caller handles a throw; it
                   says nothing about whether Postgres rolled anything back.
                   So the audit table is made to reject inserts, with a
                   trigger, and the role is read back out of the database.

Supabase Auth is stood in for by tests/browser/fake-gotrue.py so the app's real
client runs. Postgres is real.

RUN IT AGAINST A FRESHLY STARTED SERVER. Every privileged action here spends
from the step-up budget — 10 per 15 minutes per operator, shared between role
changes and permission changes — and that budget lives in memory in the server
process. This check does eight such actions as one super admin, which is close
enough to the ceiling that a server with any of the budget already spent will
start returning RATE_LIMITED partway through. That is the limit working; an
earlier version of this file did twelve actions and reported it as a product
failure. The count is kept at eight deliberately, and each one is noted below.
"""
import os
import subprocess
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("ADMIN_BASE_URL", "http://localhost:3100")
CHROME = os.environ.get("CHROME_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
PSQL = os.environ.get(
    "PSQL_DSN", "postgres://postgres@127.0.0.1:5999/etsypilot"
)

SUPER = ("boss@etsypilot.app", "correct-horse-battery")
ADMIN = ("ops@etsypilot.app", "admin-password-here")
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


def sql(statement):
    """Talk to the database directly, as a separate process."""
    result = subprocess.run(
        ["psql", PSQL, "-tAc", statement],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"psql failed: {result.stderr.strip()}")
    return result.stdout.strip()


def sign_in(page, email, password):
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill('input[name="email"]', email)
    page.fill('input[name="password"]', password)
    page.click('button[type="submit"]')
    page.wait_for_url(f"{BASE}/dashboard", timeout=15000)


def status_of(page, path):
    response = page.goto(f"{BASE}{path}", wait_until="load")
    return response.status if response else 0


def save_permissions(page, role, ticked, password):
    """Set one role's boxes to exactly `ticked` and submit."""
    page.goto(f"{BASE}/admin/permissions/{role}", wait_until="networkidle")
    boxes = page.locator('input[name="permissions"]')
    for index in range(boxes.count()):
        box = boxes.nth(index)
        value = box.get_attribute("value")
        if value in ticked:
            box.check()
        else:
            box.uncheck()
    page.fill('input[name="password"]', password)
    # expect_navigation, not wait_for_load_state: the latter resolves against
    # the page ALREADY loaded, so every assertion after a submit was reading
    # the pre-submit body. The database assertions passed throughout, which is
    # what made it obvious the fault was in the harness and not the app.
    with page.expect_navigation(wait_until="load", timeout=15000):
        page.click('main button[type="submit"]')
    guard_budget(page, f"saving {role} permissions")


def guard_budget(page, label):
    """Abort loudly if the step-up budget ran out mid-check.

    A RATE_LIMITED refusal is the limiter working, not the feature failing, and
    every assertion after it would report a false negative. Better to stop and
    say so than to print a wall of failures that mean "restart the server".
    """
    if "outcome=RATE_LIMITED" in page.url:
        print(
            f"ABORT: step-up budget exhausted at {label}. The limiter is in-process; "
            "restart the server and re-run."
        )
        sys.exit(2)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME)

        # ---- accounts exist by signing in; provisioning does the rest -------
        for email, password in (SUBJECT, ADMIN):
            context = browser.new_context()
            page = context.new_page()
            sign_in(page, email, password)
            context.close()

        # The subject is promoted to MANAGER directly, so this check is about
        # permissions rather than re-testing the role editor.
        sql(
            "update users set platform_role='MANAGER' "
            f"where email='{SUBJECT[0]}'"
        )

        # ---- the seed is what A1 had ----------------------------------------
        seeded_admin = sql("select permissions from admin_role_permissions where role='ADMIN'")
        seeded_manager = sql("select permissions from admin_role_permissions where role='MANAGER'")
        # Derived from the code, not a literal. A6 added an eighth permission
        # and this assertion — which counted commas — went red on the migration
        # that granted it, reporting a correct seed as a failure. The unit
        # suite pins the number in one place; this one asks whether Postgres
        # ended up with what domain/admin/roles.ts declares.
        declared = [
            line.split("'")[1]
            for line in open("domain/admin/roles.ts").read().splitlines()
            if line.strip().startswith("'") and ".view" in line
        ]
        check(
            all(f"{key}" in seeded_admin for key in declared) and len(declared) >= 7,
            f"ADMIN is seeded with every declared permission, {len(declared)} of them ({seeded_admin})",
        )
        check(seeded_manager == "{users.view}", f"MANAGER is seeded with users.view only ({seeded_manager})")

        # ---- the manager can see the accounts list, as A1 left it ------------
        manager = browser.new_context()
        manager_page = manager.new_page()
        sign_in(manager_page, *SUBJECT)
        check(
            status_of(manager_page, "/admin/users") == 200,
            "the manager can open Accounts while users.view is ticked",
        )
        check(
            status_of(manager_page, "/admin/permissions") == 404,
            "a MANAGER gets 404 from the permission matrix",
        )

        # ---- the super admin unticks it -------------------------------------
        boss = browser.new_context()
        boss_page = boss.new_page()
        sign_in(boss_page, *SUPER)

        boss_page.goto(f"{BASE}/admin/permissions", wait_until="load")
        matrix = boss_page.inner_text("body")
        check("Permissions" in matrix, "the super admin can open the matrix")
        check("roles.write" in matrix, "the matrix NAMES the capabilities it cannot grant")
        check(
            boss_page.locator('input[type="checkbox"]').count() == 0,
            "the matrix itself is read-only; the checkboxes live on their own page",
        )

        check(
            status_of(boss_page, "/admin/permissions/SUPER_ADMIN") == 404,
            "the editor 404s for SUPER_ADMIN, so no form promises what it cannot do",
        )
        check(
            status_of(boss_page, "/admin/permissions/USER") == 404,
            "and for USER, which has no set to edit",
        )

        # ---- ACTION 1 -------------------------------------------------------
        save_permissions(boss_page, "MANAGER", ticked=set(), password=SUPER[1])
        check(
            "Permissions changed" in boss_page.inner_text("body"),
            "unticking everything is accepted and confirmed",
        )
        stored = sql("select permissions from admin_role_permissions where role='MANAGER'")
        check(stored == "{}", f"the emptied set reached Postgres as an empty array ({stored})")

        # ---- THE ENFORCEMENT CLAIM -------------------------------------------
        # A DIFFERENT session, a DIFFERENT person, already signed in.
        check(
            status_of(manager_page, "/admin/users") == 404,
            "the manager LOSES Accounts on their very next request",
        )
        check(
            status_of(manager_page, "/admin") == 404,
            "and /admin stops existing for them entirely",
        )

        # ---- re-tick, and they get it back (ACTION 2) ------------------------
        # Restored AND widened in one action: subscriptions.view is not in
        # MANAGER's defaults, so this proves the store can grant beyond them
        # without spending a second slice of the step-up budget on it.
        save_permissions(
            boss_page, "MANAGER", ticked={"users.view", "subscriptions.view"}, password=SUPER[1]
        )
        stored = sql("select permissions from admin_role_permissions where role='MANAGER'")
        check(stored.startswith("{users.view"), f"the set is restored in Postgres ({stored})")
        check(
            "subscriptions.view" in stored,
            f"and a permission the defaults never granted is stored ({stored})",
        )
        check(
            status_of(manager_page, "/admin/users") == 200,
            "the manager GETS Accounts back, same session, no sign-out",
        )

        # ---- a wrong password changes nothing, and is recorded (ACTION 3) ----
        before = sql("select permissions from admin_role_permissions where role='MANAGER'")
        save_permissions(boss_page, "MANAGER", ticked=set(), password="not-the-password")
        refused = boss_page.inner_text("body")
        check("Not changed" in refused, "a wrong password is refused in words")
        check("Password did not match" in refused, "and says which check refused it")
        after = sql("select permissions from admin_role_permissions where role='MANAGER'")
        check(before == after, f"no permission changed ({before} -> {after})")
        recorded = sql(
            "select count(*) from admin_permission_audit_events "
            "where outcome_kind='REFUSED' and refusal_reason='WRONG_PASSWORD'"
        )
        check(recorded == "1", f"the refused attempt is in the audit log ({recorded} record)")
        check(
            status_of(manager_page, "/admin/users") == 200,
            "and the manager still has the page the failed attempt would have taken",
        )

        # ---- what an ADMIN may and may not do ---------------------------------
        admin = browser.new_context()
        admin_page = admin.new_page()
        sign_in(admin_page, *ADMIN)
        check(status_of(admin_page, "/admin/users") == 200, "an ADMIN can still read Accounts")
        check(
            status_of(admin_page, "/admin/permissions") == 404,
            "an ADMIN cannot open the matrix",
        )
        check(
            status_of(admin_page, "/admin/permissions/MANAGER") == 404,
            "nor the editor by URL",
        )
        check(
            "Permissions" not in admin_page.inner_text("nav"),
            "and is not offered it in the navigation",
        )

        # An ADMIN's own set is editable, so revoking theirs must bite too.
        # ---- ACTION 4 -------------------------------------------------------
        save_permissions(boss_page, "ADMIN", ticked={"users.view"}, password=SUPER[1])
        check(
            status_of(admin_page, "/admin/users") == 200,
            "the ADMIN keeps Accounts, which is still ticked",
        )
        restored_admin = sql("select permissions from admin_role_permissions where role='ADMIN'")
        check(
            restored_admin == "{users.view}",
            f"the ADMIN row really is down to one permission ({restored_admin})",
        )
        # ---- ACTION 5 -------------------------------------------------------
        save_permissions(boss_page, "ADMIN", ticked=set(), password=SUPER[1])
        check(
            status_of(admin_page, "/admin/users") == 404,
            "and loses it when their last permission goes",
        )
        check(
            status_of(boss_page, "/admin/permissions") == 200,
            "while the SUPER_ADMIN still has the screen that would restore it",
        )
        # ---- ACTION 6 -------------------------------------------------------
        save_permissions(
            boss_page,
            "ADMIN",
            ticked={
                "users.view",
                "users.detail",
                "subscriptions.view",
                "usage.view",
                "ai.view",
                "etsy.view",
                "operations.view",
            },
            password=SUPER[1],
        )
        check(
            status_of(admin_page, "/admin/users") == 200,
            "restoring the ADMIN set gives the page back",
        )

        # ---- the audit log shows both kinds of change -------------------------
        boss_page.goto(f"{BASE}/admin/audit", wait_until="load")
        audit = boss_page.inner_text("body")
        check("Revoked" in audit or "Granted" in audit, "permission changes appear in the log")
        check("role, not a person" in audit, "and are marked as being about a role")
        check(
            "Password did not match" in audit,
            "the refused permission attempt is there too",
        )

        # ---- THE TRANSACTION: a failing audit write rolls the change back -----
        #
        # The audit table is made to reject inserts. A promotion is then
        # attempted through the UI, and platform_role is read back OUT OF
        # POSTGRES. A mock could not establish this: what is being tested is
        # whether the database rolled the UPDATE back.
        sql(
            "create or replace function reject_audit() returns trigger as $$ "
            "begin raise exception 'audit table is unavailable'; end; $$ language plpgsql"
        )
        sql(
            "create trigger reject_audit_insert before insert on admin_audit_events "
            "for each row execute function reject_audit()"
        )
        try:
            role_before = sql(f"select platform_role from users where email='{SUBJECT[0]}'")
            user_id = sql(f"select id from users where email='{SUBJECT[0]}'")

            # ---- ACTION 7 ---------------------------------------------------
            boss_page.goto(f"{BASE}/admin/users/{user_id}/role", wait_until="networkidle")
            boss_page.check('input[name="role"][value="USER"]')
            boss_page.fill('input[name="password"]', SUPER[1])
            with boss_page.expect_navigation(wait_until="load", timeout=15000):
                boss_page.click('main button[type="submit"]')

            body = boss_page.inner_text("body")
            check("Not changed" in body, "a role change whose record fails is reported as failed")
            check(
                "Could not be recorded" in body,
                "and says the change was rolled back rather than blaming the password",
            )

            role_after = sql(f"select platform_role from users where email='{SUBJECT[0]}'")
            check(
                role_before == role_after,
                f"THE ROLE IS UNCHANGED IN POSTGRES ({role_before} -> {role_after})",
            )
            check(role_after == "MANAGER", "the manager is still a manager")
            check(
                status_of(manager_page, "/admin/users") == 200,
                "and still has the panel, because nothing happened",
            )
        finally:
            sql("drop trigger if exists reject_audit_insert on admin_audit_events")
            sql("drop function if exists reject_audit()")

        # The same change now succeeds, proving the trigger was what stopped it
        # and not something about the request.
        # ---- ACTION 8 ---------------------------------------------------------
        boss_page.goto(f"{BASE}/admin/users/{user_id}/role", wait_until="networkidle")
        boss_page.check('input[name="role"][value="USER"]')
        boss_page.fill('input[name="password"]', SUPER[1])
        with boss_page.expect_navigation(wait_until="load", timeout=15000):
            boss_page.click('main button[type="submit"]')
        check(
            sql(f"select platform_role from users where email='{SUBJECT[0]}'") == "USER",
            "with the audit table working again, the same change applies",
        )

        browser.close()


main()

print("\n".join(notes))
if fails:
    print("\n" + "\n".join(fails))
    print(f"\n{len(fails)} FAILED of {len(fails) + len(notes)}")
    sys.exit(1)
print(f"\nALL {len(notes)} PERMISSION CHECKS PASSED")
