"""Every refused operator route answers 404, AND shows the right 404.

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

── AND THEN IT MADE THE SAME MISTAKE THE OTHER WAY ROUND ──────────────────

The first version of this file asserted the status and nothing else, which is
the identical gap with the arguments swapped. It would have gone green on a
build where every refused operator saw the SELLER'S 404 — "the listing was
deleted on Etsy", with buttons out to /dashboard and /listings/audit — because
that page carries a 404 status too. Checking one property and assuming the
other is what let the original defect through; asserting the other property and
assuming the first would not be an improvement.

So both are asserted, for three viewers, on every gated route:

    operator lacking that permission   404   operator copy, links inside /admin
    signed-in seller, no operator      404   seller copy, byte-for-byte the
                                             page a missing URL gives
    signed out                         404   seller copy, and the response is
                                             SERVER-RENDERED (see below)

THE CONVERSE IS ASSERTED TOO. The operator case must not contain the seller's
sentence or a link to /listings/audit; the seller case must not contain the
operator's sentence. Without those, one component rendering both bodies at once
would satisfy every positive check.

── THE BODY IS NOT IN THE HTML, WHICH IS WHY IT IS WAITED FOR ─────────────

MEASURED on next start, Next 16.3.6: a request-time notFound() produces
`<html id="__next_error__">` with an EMPTY body. The whole page — chrome, copy,
links — travels as an RSC payload in inline scripts and is rendered by the
client after hydration. With JavaScript disabled the refused operator's 404 is
blank; with it on, it is blank for 0.3s here, 7s throttled to slow-3G, 15s on
2G.

That is a property of the 404 STATUS on this version, not of where the gate
sits. Three-way probe, same viewer, same permission:

    page gate, no loading.tsx     404   blank __next_error__ shell
    page gate, with loading.tsx   200   fully server-rendered
    layout gate, with loading.tsx 404   blank __next_error__ shell

So `wait_until="load"` is not enough to read these pages, and it does not fail
when it is wrong — it returns "". An earlier probe read exactly that and
reported two routes as having no 404 copy at all. settled_body() waits for
content and treats an empty body as a failure, because a body assertion that
passes against "" is not a body assertion.
"""
import os
import re
import subprocess
import sys

from playwright.sync_api import sync_playwright

from mfa_support import sign_in_with_two_factor

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

# The two 404s, quoted from the components that render them. Fragments rather
# than whole sentences so a typographic apostrophe or a re-wrap does not fail
# the sweep for the wrong reason — but long enough that no other page contains
# them by accident.
OPERATOR_COPY = "No operator screen answers to that address"
SELLER_COPY = "deleted on Etsy"
SELLER_ONLY_LINK = "/listings/audit"

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
    """Sign in AND clear the two-factor gate.

    /admin now requires aal2, so a password-only sign-in lands on
    /two-factor or /two-factor/verify rather than on the console. Every
    assertion after this point would otherwise be measuring the wrong screen.
    tests/browser/mfa_support.py does what the person with the phone does.
    """
    sign_in_with_two_factor(page, BASE, email, password)


def settled_body(page):
    """The rendered text, waited for — never sampled and never empty.

    A refused route's HTML carries no body (see the note at the top), so the
    text only exists once the client has hydrated. page.inner_text("body")
    immediately after wait_until="load" returns "", and "" satisfies every
    `X not in body` assertion in this file. Waiting here is what stops a body
    assertion from passing because there was no body.
    """
    page.wait_for_function(
        "() => document.body && document.body.innerText.trim().length > 0",
        timeout=30000,
    )
    return page.inner_text("body")


def check_body(body, url, who, expected, forbidden):
    """One viewer's 404 says its own words and none of the other's."""
    check(expected in body, f"{url} tells a {who} {expected!r}")
    for phrase in forbidden:
        check(phrase not in body, f"{url} does not tell a {who} {phrase!r}")


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

            # ---- and the page underneath it -------------------------------
            #
            # A refused OPERATOR is already inside the console: the group
            # layout admitted them, the banner and their rail are drawn around
            # this. They get copy that is true where they are standing, and
            # every way out leads back into /admin. The seller's words here
            # would be false — there is no listing, and nothing was deleted on
            # Etsy.
            body = settled_body(page)
            check_body(
                body,
                route["url"],
                "refused operator",
                OPERATOR_COPY,
                (SELLER_COPY, SELLER_ONLY_LINK),
            )
            # The links are read from the DOM, not from the text, because the
            # seller 404's buttons are LABELLED "Back to overview" and "Listing
            # audit" — a check on the words alone would miss a correct-looking
            # label pointing out of the console.
            hrefs = page.eval_on_selector_all("main a", "els => els.map(e => e.getAttribute('href'))")
            check(
                len(hrefs) > 0 and all(h and h.startswith("/admin") for h in hrefs),
                f"{route['url']} offers a refused operator only links inside the console — {hrefs}",
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
            # The status alone is not the control either. A build that served
            # the 404 PAGE at status 200 is the exact defect this file was
            # written for, and it would satisfy the line above.
            body = settled_body(page)
            check(
                OPERATOR_COPY not in body and SELLER_COPY not in body,
                f"{route['url']} gives a super admin the screen, not a 404 page at status 200",
            )
        context.close()

        # ---- and a seller sees a missing URL, not a refused one ---------------
        context = browser.new_context()
        page = context.new_page()
        sign_in(page, *SELLER)
        missing = page.goto(f"{BASE}/no-such-page-at-all", wait_until="load")
        missing_body = settled_body(page)
        check(
            SELLER_COPY in missing_body,
            "the control URL really is the seller 404 and not some other page",
        )
        for route in table:
            response = page.goto(f"{BASE}{route['url']}", wait_until="load")
            status = response.status if response else 0
            check(status == 404, f"{route['url']} answers 404 to a plain seller — got {status}")
            body = settled_body(page)
            check(
                body == missing_body,
                f"{route['url']} is the same page a missing URL gives",
            )
            # Equality with the control already implies both of these. They are
            # written out anyway because equality is the assertion that goes
            # vacuously true if the control page ever changes shape, and these
            # two say what the property IS: a seller must not learn from the
            # words on the page what the status code is careful not to tell
            # them. "No operator screen answers to that address" announces that
            # operator screens exist.
            check_body(body, route["url"], "plain seller", SELLER_COPY, (OPERATOR_COPY,))
        check(missing.status == 404, "and that missing URL is itself a 404")
        context.close()

        # ---- and a signed-out visitor -----------------------------------
        #
        # STATED, because the prompt asked what this case currently does
        # rather than assuming it does anything in particular. Measured: it
        # never reaches the app. middleware.ts rewrites the request to a path
        # with no route, so Next answers with its ordinary routing-level 404 —
        # which, unlike either refusal above, is FULLY SERVER-RENDERED. 10,278
        # bytes of real HTML against 8,088 for the same URL requested by a
        # signed-in seller, whose refusal happens during render and therefore
        # returns the empty __next_error__ shell.
        #
        # So the anonymous case is the strongest of the three and the only one
        # that is genuinely indistinguishable from a URL nobody wrote.
        # tests/browser/admin-hidden.py asserts that byte-for-byte; what is
        # asserted here is only that this sweep's routes are covered by it too.
        context = browser.new_context()
        page = context.new_page()
        anonymous_missing = page.goto(f"{BASE}/no-such-page-at-all", wait_until="load")
        anonymous_missing_body = settled_body(page)
        for route in table:
            response = page.goto(f"{BASE}{route['url']}", wait_until="load")
            status = response.status if response else 0
            check(status == 404, f"{route['url']} answers 404 to a signed-out visitor — got {status}")
            body = settled_body(page)
            check(
                body == anonymous_missing_body,
                f"{route['url']} is the same page a missing URL gives a signed-out visitor",
            )
            check_body(body, route["url"], "signed-out visitor", SELLER_COPY, (OPERATOR_COPY,))
        check(anonymous_missing.status == 404, "and that URL is a 404 when signed out too")
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
