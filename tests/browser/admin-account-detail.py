"""The account detail screen, read by four different operators.

    python3 tests/browser/fake-gotrue.py 5998 &
    AUTH_MODE=live NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:5998 \
      NEXT_PUBLIC_SUPABASE_ANON_KEY=anon DATABASE_URL=postgres://... \
      SUPER_ADMIN_EMAILS=boss@etsypilot.app ADMIN_EMAILS=ops@etsypilot.app \
      npx next start -p 3100 &
    python3 tests/browser/admin-account-detail.py

WHY THIS EXISTS RATHER THAN MORE UNIT TESTS. tests/unit/admin-account-detail
proves what visibleSections DECIDES. It cannot prove what a browser was SENT,
and on this screen those are different questions with different failure modes:

  OMITTED, NOT LOCKED   a section the viewer may not see must leave no trace.
                        A unit test asserting `sections` excludes 'financials'
                        says nothing about a heading, a skeleton or an empty
                        card rendered from somewhere else on the page.

  NOT IN THE PAYLOAD    React Server Components stream their props. A section
                        hidden with CSS, or fetched and then dropped at render
                        time, is still in the flight payload — so the figures
                        are asserted absent from the whole response body, not
                        from the visible text.

  THE BUYER             no country, receipt or line item may appear. That is a
                        claim about bytes on the wire, and the only way to
                        check bytes on the wire is to read them.

Four viewers, because the interesting failures are asymmetric: a screen that
shows a manager too much and a screen that shows a super admin too little look
identical from one session.

NO STEP-UP BUDGET IS SPENT HERE. Permissions are changed with SQL rather than
through the matrix — this check is about what the detail screen renders, and
the matrix editor has its own check that pays for its own actions. See
tests/browser/admin-permissions.py, which notes the eight-action ceiling.
"""
import os
import subprocess
import sys

from playwright.sync_api import sync_playwright

from mfa_support import sign_in_with_two_factor

BASE = os.environ.get("ADMIN_BASE_URL", "http://localhost:3100")
CHROME = os.environ.get("CHROME_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
PSQL = os.environ.get("PSQL_DSN", "postgres://postgres@127.0.0.1:5999/etsypilot")

SUPER = ("boss@etsypilot.app", "correct-horse-battery")
ADMIN = ("ops@etsypilot.app", "admin-password-here")
# The accounts tests/browser/fake-gotrue.py already knows. Adding two more to
# the double would be a second place for this check to drift from the others.
MANAGER = ("promoted@example.com", "manager-password-y")
SUBJECT = ("seller@example.com", "seller-password-x")

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
    """Sign in AND clear the two-factor gate.

    /admin now requires aal2, so a password-only sign-in lands on
    /two-factor or /two-factor/verify rather than on the console. Every
    assertion after this point would otherwise be measuring the wrong screen.
    tests/browser/mfa_support.py does what the person with the phone does.
    """
    sign_in_with_two_factor(page, BASE, email, password)


def fetch(page, path):
    """Status, the FULL response body, and the rendered text. All three.

    The two bodies answer opposite questions and using one for both is how the
    first run of this check reported four failures that were all its own:

      body   every byte the server sent, including the RSC flight payload. The
             only thing that can answer "is the seller's profit ABSENT?" — a
             section fetched and then dropped at render time, or hidden with
             CSS, is still in here.

      text   what a person would read. The only thing that can answer "is the
             coverage STATED?", because React separates adjacent text nodes
             with comment markers: `Cost coverage <!-- -->64<!-- -->%` is in
             the body and `Cost coverage 64%` is not, though the screen plainly
             says so.

    So: absence is asserted against `body`, presence against `text`.
    """
    response = page.goto(f"{BASE}{path}", wait_until="load")
    if response is None:
        return 0, "", ""
    """
    WAIT FOR THE SKELETON TO GO, because `load` is not the content.

    An operator route with a loading.tsx streams: `load` fires with the
    PLACEHOLDER on screen and the real rows still arriving. Reading
    inner_text() there returns skeleton markup, so `marker in text` fails on a
    page that is perfectly correct.

    This was latent for as long as the page happened to win the race. Adding
    the two-factor gate put one more round trip in front of every request, the
    page started losing, and 23 checks went red across four screens at once —
    all of them reporting "does not render its own content" about content that
    renders. loading.tsx marks itself aria-busy, so its disappearance is the
    signal, and a route without one detaches nothing and returns at once.
    """
    page.wait_for_selector('[aria-busy="true"]', state="detached", timeout=30000)
    return response.status, response.text(), page.inner_text("body")


def set_manager_permissions(keys):
    array = "{" + ",".join(keys) + "}" if keys else "{}"
    sql(
        "insert into admin_role_permissions (role, permissions) "
        f"values ('MANAGER', '{array}') "
        f"on conflict (role) do update set permissions = '{array}'"
    )


# What each section puts on screen, and nothing else does. Used for both
# directions: present when the permission is held, ABSENT when it is not.
MARKERS = {
    "identity": "Onboarding",
    "shop": "Last synced",
    "connection": "Scopes Etsy granted",
    "plan": "Trial ends",
    "usage": "ai generation",
    "financials": "Cost coverage",
}


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME)

        # ---- accounts exist by signing in; provisioning does the rest -------
        for email, password in (SUBJECT, MANAGER, ADMIN):
            context = browser.new_context()
            sign_in(context.new_page(), email, password)
            context.close()

        sql(f"update users set platform_role='MANAGER' where email='{MANAGER[0]}'")

        user_id = sql(f"select id from users where email='{SUBJECT[0]}'")
        shop_id = sql(f"select id from shops where owner_id='{user_id}'")
        if not user_id or not shop_id:
            print("ABORT: provisioning did not create a user and shop for the subject.")
            sys.exit(2)

        # ---- give the subject something in every section --------------------
        sql(
            "insert into etsy_connections (shop_id, scopes, token_ref, expires_at) values "
            f"('{shop_id}', '[\"listings_r\",\"shops_r\",\"transactions_r\"]', "
            "'vault://etsy/secret-token-ref-abc123', now() + interval '30 days') "
            "on conflict (shop_id) do update set scopes = excluded.scopes, "
            "token_ref = excluded.token_ref, expires_at = excluded.expires_at"
        )
        sql(
            "insert into subscriptions (id, user_id, shop_id, plan, status, renews_at) values "
            f"('sub-detail-1', '{user_id}', '{shop_id}', 'GROWTH', 'ACTIVE', "
            "now() + interval '20 days') on conflict (id) do nothing"
        )
        sql(
            "insert into usage_records (id, subscription_id, shop_id, metric, used, \"limit\", "
            "period_start, period_end) values "
            f"('usage-detail-1', 'sub-detail-1', '{shop_id}', 'ai_generation', 37, 200, "
            "date_trunc('month', now()), date_trunc('month', now()) + interval '1 month') "
            "on conflict (id) do nothing"
        )
        sql(
            "insert into profit_records (id, shop_id, period_start, period_end, gross_revenue, "
            "etsy_fees, payment_processing, offsite_ads, shipping, cogs, labour, other_costs, "
            "net_profit, coverage_percent, computed_at) values "
            f"('profit-detail-1', '{shop_id}', date_trunc('month', now()), "
            "date_trunc('month', now()) + interval '1 month', 1840.00, 92.00, 53.36, 18.40, "
            "110.00, 620.00, 0, 0, 946.24, 64, now()) on conflict (id) do nothing"
        )
        # Two orders inside the period, each with a COUNTRY CODE on the row.
        # Seeded deliberately: the screen must aggregate over these rows and
        # still never carry the country. A sweep for a value the database does
        # not hold proves nothing.
        for index, country in enumerate(("GB", "JP")):
            sql(
                "insert into orders (id, shop_id, etsy_receipt_id, placed_at, gross, refunds, "
                "etsy_fees, payment_processing, offsite_ads, country_code) values "
                f"('order-detail-{index}', '{shop_id}', 'RECEIPT-90210{index}', "
                f"now() - interval '3 days', 920.00, 0, 46.00, 26.68, 9.20, '{country}') "
                "on conflict (id) do nothing"
            )

        detail_path = f"/admin/users/{user_id}"

        # ================= VIEWER 1: SUPER_ADMIN ==============================
        boss = browser.new_context()
        boss_page = boss.new_page()
        sign_in(boss_page, *SUPER)

        status, body, text = fetch(boss_page, detail_path)
        check(status == 200, f"super admin opens the detail screen ({status})")
        for key, marker in MARKERS.items():
            check(marker in text, f"super admin sees the {key} section")
        check(
            "6 sections" in text,
            "the summary line counts six sections for a viewer who holds everything",
        )
        check(
            "Change platform role" in text,
            "the role link is offered to a super admin",
        )
        check(
            "946.24" in text and "1840.00" in text,
            "the money figures are the seller's real ones, not placeholders",
        )
        check("Cost coverage 64%" in text, "coverage is stated as a number")
        check(
            "the real figure is lower" in text,
            "and the DIRECTION of the error is stated, not left to be inferred",
        )
        check("Calculated" in text, "the figures carry a provenance badge")
        check("Verified" not in text, "and none of them claims to be VERIFIED")
        check(
            "vault://etsy" not in body and "secret-token-ref" not in body,
            "THE ETSY TOKEN REFERENCE IS NOT IN THE PAYLOAD, for the most privileged viewer",
        )
        for buyer in ("RECEIPT-90210", "country_code", '"GB"', '"JP"'):
            check(buyer not in body, f"no buyer-identifying value in the payload ({buyer})")
        check(
            "listings_r" in text,
            "the granted scopes ARE shown — the positive control for the sweep above",
        )

        # ================= VIEWER 2: ADMIN ===================================
        ops = browser.new_context()
        ops_page = ops.new_page()
        sign_in(ops_page, *ADMIN)

        status, body, text = fetch(ops_page, detail_path)
        check(status == 200, f"admin opens the detail screen ({status})")
        check(MARKERS["financials"] in text, "an ADMIN holds financials.view by default")
        check("946.24" in text, "and sees the net profit figure")
        check(
            "Change platform role" not in body,
            "the role link is ABSENT for an admin, not disabled",
        )
        # Asked of the DOM rather than of the bytes: the layout's theme
        # bootstrap script carries the comment "Private browsing with storage
        # disabled", and a substring sweep fired on it. A guard must not match
        # unrelated prose any more than it may match its own.
        check(
            ops_page.locator('[disabled], [aria-disabled="true"]').count() == 0,
            "and nothing on the page is rendered as a disabled control",
        )
        status_role, _, _ = fetch(ops_page, f"{detail_path}/role")
        check(status_role == 404, f"the role editor 404s an admin who types the URL ({status_role})")

        # ================= VIEWER 3: MANAGER with users.detail ===============
        set_manager_permissions(["users.view", "users.detail"])

        manager = browser.new_context()
        manager_page = manager.new_page()
        sign_in(manager_page, *MANAGER)

        status, body, text = fetch(manager_page, detail_path)
        check(status == 200, f"a manager holding users.detail opens the screen ({status})")
        check(MARKERS["identity"] in text, "and sees identity")
        check(MARKERS["shop"] in text, "and sees the shop")
        check(
            "2 sections" in text,
            "the summary counts TWO — the number does not leak the total either",
        )
        for key in ("connection", "plan", "usage", "financials"):
            check(MARKERS[key] not in body, f"the {key} section is absent, not locked")

        # The figures themselves, not only the headings.
        for figure in ("946.24", "1840.00", "GROWTH", "listings_r", "Cost coverage"):
            check(figure not in body, f"no gated data reached the payload ({figure})")
        check(
            "Locked" not in body and "padlock" not in body.lower(),
            "NOTHING HINTS AT WHAT THEY CANNOT SEE — omitted, never locked",
        )

        # ================= VIEWER 4: MANAGER without users.detail ============
        set_manager_permissions(["users.view"])

        status, body, _ = fetch(manager_page, detail_path)
        check(
            status == 404,
            f"a manager WITHOUT users.detail gets 404 on their very next request ({status})",
        )
        check(
            "Onboarding" not in body and "seller@example.com" not in body,
            "and the 404 body carries nothing about the account",
        )

        list_status, list_body, _ = fetch(manager_page, "/admin/users")
        check(list_status == 200, "they can still open the accounts list, which needs users.view")
        check(
            f'href="/admin/users/{user_id}"' not in list_body,
            "THE LIST OMITS THE DETAIL LINK for them",
        )
        check(
            SUBJECT[0] in list_body,
            "while still showing the row — the positive control for the assertion above",
        )

        # And the link comes back when the permission does.
        set_manager_permissions(["users.view", "users.detail"])
        _, list_body, _ = fetch(manager_page, "/admin/users")
        check(
            f'href="/admin/users/{user_id}"' in list_body,
            "and the link RETURNS when the permission is re-ticked",
        )

        # ================= the empty states ==================================
        # The manager's own account: a real shop with nothing computed. Read as
        # the SUPER ADMIN, because an empty state is only observable to a
        # viewer who can see the section at all — the first run of this check
        # asked a manager who held no subscriptions.view, found no plan section
        # and called it a missing empty state, when it was the gating working.
        manager_id = sql(f"select id from users where email='{MANAGER[0]}'")
        _, body, text = fetch(boss_page, f"/admin/users/{manager_id}")
        check(
            "has never been computed" in text,
            "a shop with no profit record says so IN WORDS",
        )
        check(
            "0.00" not in text,
            "and shows no zero — absent and zero must not look alike (D34)",
        )
        check(
            "No subscription record" in text,
            "an account with no subscription says so, rather than showing a free plan",
        )
        check(
            "Never connected to Etsy" in text,
            "and a shop with no grant says that, rather than showing no scopes",
        )
        check(
            "No usage records" in text,
            "and an unmetered account says so, rather than reading zero",
        )

        # ---- the seller is told the same thing ------------------------------
        seller = browser.new_context()
        seller_page = seller.new_page()
        sign_in(seller_page, *SUBJECT)
        _, body, text = fetch(seller_page, "/settings/data-permissions")
        check("What EtsyPilot staff can see" in text, "the seller-facing page names staff access")
        check("Financials" in text, "and lists the financials permission by its label")
        check(
            "Acting as a seller (impersonation)" in text,
            "and states what staff cannot do, from the same constant the guard reads",
        )
        check(
            "financials.view" not in body,
            "without leaking internal permission KEYS to the seller",
        )

        # ---- demo mode is untouched -----------------------------------------
        status, _, _ = fetch(seller_page, "/admin/users")
        check(status == 404, f"a seller still gets 404 from the operator area ({status})")

        browser.close()

    for line in notes:
        print(line)
    for line in fails:
        print(line)
    print(f"\n{len(notes)} passed, {len(fails)} failed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
