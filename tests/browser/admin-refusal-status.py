"""Every refused operator route answers 404 — the STATUS, not the page.

    python3 tests/browser/fake-gotrue.py 5998 &
    AUTH_MODE=live NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:5998 \
      NEXT_PUBLIC_SUPABASE_ANON_KEY=anon DATABASE_URL=postgres://... \
      SUPER_ADMIN_EMAILS=boss@etsypilot.app ADMIN_EMAILS=ops@etsypilot.app \
      npx next start -p 3100 &
    python3 tests/browser/admin-refusal-status.py

WHY THIS FILE EXISTS, AND WHY IT IS SEPARATE.

/admin answers 404 rather than 403 so that a refused request does not confirm
the operator console is there. For eight of nine gated routes it was answering
200 with the 404 PAGE — correct copy, correct links, wrong status line. A
browser shows the right thing; a scanner reads the status and learns the route
exists.

It survived a round of verification because the check that should have caught
it did this:

    refused = pg.goto(f"{BASE}/admin/audit")
    check("deleted on Etsy" not in body, "...keeps the in-console 404")

The response object was captured and its status never read. The only status
assertions in that sweep were for viewers the GROUP layout refuses — a plain
seller and a manager with no permissions at all — and those were 404 because
the group layout runs above every boundary. The case the defect lived in, an
operator who holds console access and lacks ONE permission, had its body
asserted and its status skipped.

So this file asserts one thing and asserts it from the outside: the number on
the status line. It reads the route table from the app's own layout files
rather than from a list written here, so a route added without a gate is a
route this cannot silently skip.
"""
import os
import re
import subprocess
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("ADMIN_BASE_URL", "http://localhost:3100")
CHROME = os.environ.get("CHROME_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
PSQL = os.environ.get("PSQL_DSN", "postgres://postgres@127.0.0.1:5999/etsypilot")
ADMIN_ROOT = os.path.join("app", "(admin)")

SUPER = ("boss@etsypilot.app", "correct-horse-battery")
MANAGER = ("promoted@example.com", "manager-password-y")
SELLER = ("seller@example.com", "seller-password-x")

# Every permission a MANAGER's role may be granted. The two capabilities that
# are NOT here — audit.view and roles.write — are super-admin-only and
# non-delegatable, which is what makes a fully-granted manager the right
# "lacking" viewer for the routes behind them.
DELEGATABLE = [
    "users.view",
    "users.detail",
    "subscriptions.view",
    "usage.view",
    "ai.view",
    "etsy.view",
    "operations.view",
    "metrics.view",
    "financials.view",
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


def set_manager_permissions(keys):
    array = "{" + ",".join(keys) + "}" if keys else "{}"
    sql(
        "insert into admin_role_permissions (role, permissions) "
        f"values ('MANAGER', '{array}') on conflict (role) "
        f"do update set permissions = '{array}'"
    )


def sign_in(page, email, password):
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill('input[name="email"]', email)
    page.fill('input[name="password"]', password)
    page.click('main button[type="submit"]')
    page.wait_for_url(f"{BASE}/dashboard", timeout=20000)


def strip_comments(text):
    return re.sub(r"^\s*//.*$", "", re.sub(r"/\*[\s\S]*?\*/", "", text), flags=re.M)


def routes():
    """Every operator route, with the permission its own PAGE requires.

    ── THE TABLE COMES FROM THE PAGES, NOT FROM THE LAYOUTS ─────────────────

    The first version of this function read the requirement from the layout
    chain, and a negative control killed it: deleting a route's layout.tsx —
    which is exactly the regression this file exists to catch — removed that
    route from the table, and the sweep went green on twelve routes instead of
    thirteen. A check that stops measuring the thing it measures, the moment
    that thing breaks, is the failure mode this repo keeps finding.

    The PAGE always declares what it requires, because it gates itself whether
    or not a layout does. So the route list and the expected refusal come from
    there, and a missing layout shows up the only way it should: as a 200 where
    this expects a 404.
    """
    subject = sql("select id from users where email = 'seller@example.com'")
    out = []
    for base, _dirs, files in sorted(os.walk(ADMIN_ROOT)):
        if "page.tsx" not in files:
            continue
        source = strip_comments(open(os.path.join(base, "page.tsx")).read())
        permissions = re.findall(r"requireAdmin\('([\w.]+)'\)", source)
        # A refusal, not a question: the accounts list ASKS about roles.write to
        # decide whether to draw a column, and still renders without it.
        capabilities = re.findall(
            r"!\s*access\.canSuperAdminOnly\('([\w.]+)'\)\)\s*notFound\(\)", source
        )
        if not permissions:
            raise RuntimeError(f"{base}/page.tsx declares no requireAdmin — cannot be swept")

        parts = base.split(os.sep)
        url = "/" + "/".join(
            part
            for part in parts[len(ADMIN_ROOT.split(os.sep)) :]
            if not (part.startswith("(") and part.endswith(")"))
        )
        url = url.replace("[userId]", subject).replace("[role]", "MANAGER")
        has_skeleton = any(
            os.path.exists(os.path.join(os.sep.join(parts[:depth]), "loading.tsx"))
            for depth in range(len(parts), 0, -1)
        )
        out.append(
            {
                "url": url,
                "permissions": permissions,
                "capabilities": capabilities,
                "skeleton": has_skeleton,
            }
        )
    return out


def main():
    table = routes()
    check(len(table) >= 12, f"the sweep found the operator routes ({len(table)})")

    with_skeleton = [r for r in table if r["skeleton"]]
    without = [r for r in table if not r["skeleton"]]
    # BOTH GROUPS, and this is the assertion that would have caught the defect
    # the first time. The split between them was the whole clue: routes with a
    # loading.tsx answered 200 and the one without answered 404, so a sweep
    # covering either group alone would have read as entirely fine.
    check(len(with_skeleton) > 0, f"routes WITH a skeleton are in the sweep ({len(with_skeleton)})")
    check(len(without) > 0, f"routes WITHOUT one are too ({len(without)})")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])

        sql(f"update users set platform_role = 'MANAGER' where email = '{MANAGER[0]}'")

        # ---- a viewer lacking each route's permission gets 404 ---------------
        for route in table:
            needed = route["permissions"]
            capabilities = route["capabilities"]

            if capabilities:
                # audit.view and roles.write cannot be granted to a manager at
                # all, so the strongest possible manager is the right subject:
                # every delegatable permission, and still refused.
                held = list(DELEGATABLE)
                why = f"holding every delegatable permission but not {capabilities[0]}"
            else:
                held = [key for key in DELEGATABLE if key not in needed]
                why = f"holding everything except {', '.join(needed)}"

            set_manager_permissions(held)
            context = browser.new_context()
            page = context.new_page()
            sign_in(page, *MANAGER)
            response = page.goto(f"{BASE}{route['url']}", wait_until="load")
            status = response.status if response else 0
            shape = "skeleton" if route["skeleton"] else "no skeleton"
            check(
                status == 404,
                f"{route['url']} ({shape}) answers 404 to a manager {why} — got {status}",
            )
            context.close()

        # ---- the positive control --------------------------------------------
        #
        # Every assertion above is "this returns 404". A build where /admin
        # returned 404 to everyone would satisfy all of them, and would also be
        # a console nobody can open. So the same routes are requested by a
        # viewer who IS allowed, and have to answer 200.
        set_manager_permissions(list(DELEGATABLE))
        context = browser.new_context()
        page = context.new_page()
        sign_in(page, *SUPER)
        for route in table:
            response = page.goto(f"{BASE}{route['url']}", wait_until="load")
            status = response.status if response else 0
            check(status == 200, f"{route['url']} answers 200 to a super admin — got {status}")
        context.close()

        # ---- and a seller sees a missing URL, not a refused one ---------------
        context = browser.new_context()
        page = context.new_page()
        sign_in(page, *SELLER)
        missing = page.goto(f"{BASE}/no-such-page-at-all", wait_until="load")
        missing_body = page.inner_text("body")
        for route in table:
            response = page.goto(f"{BASE}{route['url']}", wait_until="load")
            status = response.status if response else 0
            check(status == 404, f"{route['url']} answers 404 to a plain seller — got {status}")
            check(
                page.inner_text("body") == missing_body,
                f"{route['url']} is the same page a missing URL gives",
            )
        check(missing.status == 404, "and that missing URL is itself a 404")
        context.close()

        browser.close()

    set_manager_permissions(["users.view"])


main()

print("\n".join(notes))
if fails:
    print("\n" + "\n".join(fails))
    print(f"\n{len(fails)} FAILED of {len(fails) + len(notes)}")
    sys.exit(1)
print(f"\nALL {len(notes)} REFUSAL-STATUS CHECKS PASSED")
