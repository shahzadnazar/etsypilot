"""The operator panel's read-only modules, seen by four different operators.

    python3 tests/browser/fake-gotrue.py 5998 &
    AUTH_MODE=live NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:5998 \
      NEXT_PUBLIC_SUPABASE_ANON_KEY=anon DATABASE_URL=postgres://... \
      SUPER_ADMIN_EMAILS=boss@etsypilot.app ADMIN_EMAILS=ops@etsypilot.app \
      npx next start -p 3100 &
    python3 tests/browser/admin-modules.py

ONE FILE FOR ALL OF THEM, not one per screen, because the claim is the same
claim five times over and a copy per screen is five places for it to rot:

  the screen renders for a viewer holding its key
  the screen 404s for a viewer without it
  the navigation offers it in the first case and not the second
  nothing about it — not a heading, not a figure, not the href — reaches the
  refused viewer's PAYLOAD, which is a stronger claim than "is not visible"

MODULES below is the table; adding a screen is adding a row. The per-screen
assertions that are genuinely specific live in SPECIFICS and run only for the
viewer who can see the screen.

WHY NOT UNIT TESTS. The gating decision is a pure function and is tested as
one. What cannot be tested that way is what a browser was SENT: a React Server
Component streams its props, so a section fetched and then dropped at render
time is still in the flight payload. "Absent from the screen" and "absent from
the response" are different claims and only the second one is worth anything.

NO STEP-UP BUDGET IS SPENT HERE. Permissions are changed with SQL rather than
through the matrix; the matrix editor has its own check that pays for its own
actions (see admin-permissions.py).
"""
import os
import subprocess
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("ADMIN_BASE_URL", "http://localhost:3100")
CHROME = os.environ.get("CHROME_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
PSQL = os.environ.get("PSQL_DSN", "postgres://postgres@127.0.0.1:5999/etsypilot")

SUPER = ("boss@etsypilot.app", "correct-horse-battery")
ADMIN = ("ops@etsypilot.app", "admin-password-here")
MANAGER = ("promoted@example.com", "manager-password-y")

# path, permission key, nav label, a string only this screen renders.
#
# THE LABEL MUST BE DISTINCTIVE. The absence check below asserts it appears
# nowhere for a viewer without the permission, so a label that is also a word
# the SHELL uses makes the check fire on the chrome. "Operations" did exactly
# that — the rail is headed Operations — and the item is now "Bulk
# operations", which is both unambiguous for a reader and checkable.
MODULES = [
    ("/admin/etsy", "etsy.view", "Etsy connections", "What the seller sees when a reconnection ends"),
    ("/admin/subscriptions", "subscriptions.view", "Subscriptions", "Trials ending within"),
    ("/admin/usage", "usage.view", "Usage & quota", "These figures are counts"),
    ("/admin/ai", "ai.view", "AI activity", "generated text is deliberately not shown"),
    ("/admin/operations", "operations.view", "Bulk operations", "Why items failed"),
]

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


def sign_in(page, email, password):
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill('input[name="email"]', email)
    page.fill('input[name="password"]', password)
    page.click('button[type="submit"]')
    page.wait_for_url(f"{BASE}/dashboard", timeout=15000)


def set_manager_permissions(keys):
    array = "{" + ",".join(keys) + "}" if keys else "{}"
    sql(
        "insert into admin_role_permissions (role, permissions) "
        f"values ('MANAGER', '{array}') on conflict (role) "
        f"do update set permissions = '{array}'"
    )


def fetch(page, path):
    """Status, the full response body, and the rendered text.

    Absence is asserted against the BODY (every byte, including the RSC flight
    payload); presence against the TEXT, because React separates adjacent text
    nodes with comment markers and a substring check on the body fails on
    copy that is plainly on the screen.
    """
    response = page.goto(f"{BASE}{path}", wait_until="load")
    if response is None:
        return 0, "", ""
    return response.status, response.text(), page.inner_text("body")


def nav_hrefs(page):
    return page.eval_on_selector_all(
        'a[href^="/admin"]', "els => els.map(e => e.getAttribute('href'))"
    )


# ─────────────────────────── per-screen specifics ────────────────────────────


def etsy_specifics(page, body, text):
    """/admin/etsy, for a viewer who can see it."""
    check("Healthy" in text, "the state summary is rendered")
    check(
        "Token expired" in text,
        "EVERY STATE IS COUNTED, including the ones at zero (D34)",
    )
    check(
        "Never synced" in text,
        "and 'never synced' is its own state, not a variety of stale",
    )
    check("vault://etsy" not in body and "token_ref" not in body,
          "THE TOKEN REFERENCE IS NOT IN THE PAYLOAD, on the screen about tokens")
    check(
        "Shop connected" in text and "Nothing was connected" in text,
        "the seller's own reconnection copy is rendered from CONNECT_OUTCOMES",
    )
    check(
        "no reconnect" in text and "no force-sync" in text,
        "the page NAMES what it cannot do rather than leaving a gap",
    )
    # Scoped to <main>, not the document. The SHELL legitimately contains
    # controls — the theme toggle is three radio buttons and the account menu
    # holds the sign-out form, which must be a form and must be a POST. The
    # claim is about the screen, so the selector is about the screen.
    buttons = page.locator("main button").count()
    check(buttons == 0, f"there is no button in the page content ({buttons})")
    check(page.locator("main form").count() == 0, "and no form")


def subscriptions_specifics(page, body, text):
    """/admin/subscriptions, for a viewer who can see it."""
    check("No billing record" in text,
          "an account with no subscription row is its own bucket, not the free tier")
    check("Past due" in text, "every status is counted, including the empty ones (D34)")
    check("Trialing" in text, "including trialing")
    # THE AFFORDANCE, NOT THE WORD. Asked first as a substring and it fired on
    # the page's own sentence — "There is no refund either" — which is the
    # eleventh time in this build that a guard has matched the documentation it
    # was written to protect. The page must be able to say refunds do not
    # exist; what it must not have is a column, a control or a state.
    headers = [h.lower() for h in page.eval_on_selector_all("main th", "els => els.map(e => e.innerText)")]
    check(
        not any("refund" in h for h in headers),
        f"NO REFUND COLUMN ANYWHERE ON THE SCREEN (D83) — headers {headers}",
    )
    check(
        "REFUNDED" not in body,
        "and the removed REFUNDED status appears nowhere in the payload",
    )
    check("does not refund" in text, "and the page still SAYS there is none")
    check(
        "stripe" not in body.lower(),
        "no billing-provider handle reaches the browser",
    )
    check("No upgrade, no downgrade, no cancel" in text,
          "the page names what it cannot do")
    buttons = page.locator("main button").count()
    check(buttons == 0, f"there is no button in the page content ({buttons})")
    check(page.locator("main form").count() == 0, "and no form")


def usage_specifics(page, body, text):
    """/admin/usage, for a viewer who can see it."""
    check("Over" in text and "Not on this plan" in text,
          "every band is counted, including the empty ones (D34)")
    check(
        "usage_records" in text and "nothing in the product writes it" in text,
        "the page says the figures are counted, not read from the stored counter",
    )
    check("No quota reset, no top-up" in text, "and names what it cannot do")
    check(
        "failed AI generation is never counted" in text,
        "and states D37's rule about failed generations",
    )
    # NO SELLER CONTENT, measured against text the fixtures deliberately put
    # in the database. A sweep for a string the database does not hold proves
    # nothing, so the seeded listings are titled "Handmade beeswax lavender
    # candle N" and the seeded generations output "A generated title nobody but
    # the seller should read N".
    for content in ("beeswax", "lavender", "nobody but the seller"):
        check(content not in body.lower(), f"no seller content in the payload ({content})")
    buttons = page.locator("main button").count()
    check(buttons == 0, f"there is no button in the page content ({buttons})")
    check(page.locator("main form").count() == 0, "and no form")


def ai_specifics(page, body, text):
    """/admin/ai, for a viewer who can see it."""
    check("Titles" in text and "Explanations" in text,
          "every generation kind is counted, including the empty ones")
    check("Drafted, not yet decided" in text,
          "a draft is labelled undecided, not 'not accepted'")
    check("Acceptance rate" in text, "the acceptance rate is shown")
    check("Calculated" in text, "and carries a provenance badge")
    # THE SELLER'S OWN WORDS. The fixtures deliberately seed generations whose
    # output contains this phrase; a sweep for a string the database does not
    # hold proves nothing.
    check(
        "nobody but the seller" not in body.lower(),
        "NO GENERATED TEXT REACHES THE PAYLOAD",
    )
    check("beeswax" not in body.lower(), "and no listing copy either")
    check("Volume, not money" in text, "the page says there is no cost figure")
    buttons = page.locator("main button").count()
    check(buttons == 0, f"there is no button in the page content ({buttons})")
    check(page.locator("main form").count() == 0, "and no form")


def operations_specifics(page, body, text):
    """/admin/operations, for a viewer who can see it."""
    check("Partial success" in text and "Rollback available" in text,
          "every operation state is counted, including the empty ones (D34)")
    check("Stuck in applying" in text, "the stuck section exists")
    check(
        "Price must be greater than zero" in text,
        "the per-item failure REASONS are shown — that is what support needs",
    )
    # The seeded items carry before/after values with a distinctive phrase.
    check(
        "seller wrote this title" not in body.lower(),
        "NO LISTING CONTENT REACHES THE PAYLOAD, only the reason",
    )
    check(
        "no retry, no clear, no cancel and no rollback" in text.lower(),
        "the page names all four missing controls",
    )
    buttons = page.locator("main button").count()
    check(buttons == 0, f"there is no button in the page content ({buttons})")
    check(page.locator("main form").count() == 0, "and no form")
    links = page.locator("main a").count()
    check(links == 0, f"and no link out of the page content ({links})")


SPECIFICS = {
    "/admin/operations": operations_specifics,
    "/admin/ai": ai_specifics,
    "/admin/etsy": etsy_specifics,
    "/admin/subscriptions": subscriptions_specifics,
    "/admin/usage": usage_specifics,
}


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME)

        for email, password in (MANAGER, ADMIN):
            context = browser.new_context()
            sign_in(context.new_page(), email, password)
            context.close()
        sql(f"update users set platform_role='MANAGER' where email='{MANAGER[0]}'")

        boss = browser.new_context()
        boss_page = boss.new_page()
        sign_in(boss_page, *SUPER)

        ops = browser.new_context()
        ops_page = ops.new_page()
        sign_in(ops_page, *ADMIN)

        manager = browser.new_context()
        manager_page = manager.new_page()

        for path, key, label, marker in MODULES:
            # ---- SUPER_ADMIN: holds everything --------------------------
            status, body, text = fetch(boss_page, path)
            check(status == 200, f"{path} renders for a super admin ({status})")
            check(marker in text, f"{path} renders its own content for a super admin")
            check(label in text, f"{path} is offered in the navigation to a super admin")
            if path in SPECIFICS:
                SPECIFICS[path](boss_page, body, text)

            # ---- ADMIN: holds every delegatable permission by default ----
            status, body, text = fetch(ops_page, path)
            check(status == 200, f"{path} renders for an admin ({status})")
            check(marker in text, f"{path} renders its own content for an admin")

            # ---- MANAGER WITH the key -----------------------------------
            set_manager_permissions(["users.view", key])
            sign_in(manager_page, *MANAGER)
            status, body, text = fetch(manager_page, path)
            check(status == 200, f"{path} renders for a manager holding {key} ({status})")
            check(marker in text, f"{path} renders its content for a manager holding {key}")
            check(path in set(nav_hrefs(manager_page)), f"{path} is in their navigation")

            # ---- MANAGER WITHOUT the key --------------------------------
            set_manager_permissions(["users.view"])
            status, body, text = fetch(manager_page, path)
            check(status == 404, f"{path} 404s a manager without {key} ({status})")
            check(marker not in body, f"{path}'s content is absent from the refused PAYLOAD")

            # And the navigation does not offer it on a page they CAN open.
            _, list_body, list_text = fetch(manager_page, "/admin/users")
            check(
                path not in set(nav_hrefs(manager_page)),
                f"{path} IS OMITTED FROM THEIR NAVIGATION, not shown locked",
            )
            check(
                path not in list_body,
                f"and {path} is absent from that page's payload too",
            )
            check(
                label not in list_text,
                f"and its label ({label}) appears nowhere for them",
            )
            for tell in ("Locked", "padlock", 'aria-disabled="true"'):
                check(tell not in list_body, f"nothing hints at {path} ({tell})")

        set_manager_permissions(["users.view"])
        browser.close()

    for line in notes:
        print(line)
    for line in fails:
        print(line)
    print(f"\n{len(notes)} passed, {len(fails)} failed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
