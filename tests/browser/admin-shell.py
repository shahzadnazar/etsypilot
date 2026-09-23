"""The operator shell: its navigation, and whether it meets the seller app's bar.

    python3 tests/browser/fake-gotrue.py 5998 &
    AUTH_MODE=live NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:5998 \
      NEXT_PUBLIC_SUPABASE_ANON_KEY=anon DATABASE_URL=postgres://... \
      SUPER_ADMIN_EMAILS=boss@etsypilot.app ADMIN_EMAILS=ops@etsypilot.app \
      npx next start -p 3100 &
    python3 tests/browser/admin-shell.py

WHY THIS EXISTS RATHER THAN MORE UNIT TESTS. tests/unit/operator-shell proves
what visibleOperatorNav DECIDES, from a pure function. Three claims here cannot
be checked that way at all:

  WHAT WAS SENT    a nav item the viewer may not see must leave no trace in the
                   response — not merely be excluded from an array. A padlock
                   rendered from somewhere else, or a link hidden with CSS, is
                   still a disclosure and is still in the bytes.

  GEOMETRY         several WCAG rules are geometric (D56), so they can only
                   fail at a width where the geometry differs. The seller sweep
                   learned that the hard way at 390 and 768; the operator panel
                   is held to the same bar rather than to a new one.

  BOTH THEMES      D1/D10: a token background with a literal foreground breaks
                   on theme flip, and the operator banner is deliberately a
                   literal pair. Contrast is measured in dark as well as light,
                   because that is where the pairing goes wrong.

NO STEP-UP BUDGET IS SPENT HERE. Permissions are changed with SQL rather than
through the matrix — this check is about the chrome, and the matrix editor has
its own check that pays for its own actions (see admin-permissions.py).
"""
import json
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

VIEWPORTS = (("mobile", 390, 844), ("tablet", 768, 1024), ("desktop", 1440, 1000))

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


def nav_hrefs(page):
    """Every operator link the page actually rendered, rail and drawer alike."""
    return page.eval_on_selector_all(
        'a[href^="/admin"]', "els => els.map(e => e.getAttribute('href'))"
    )


def body_of(page, path):
    response = page.goto(f"{BASE}{path}", wait_until="load")
    return (response.status if response else 0), (response.text() if response else "")


AXE = None


def axe_violations(page, width, height, theme):
    """WCAG A/AA violations at one width in one theme.

    THE WAIT IS NOT POLITENESS. The first version of this flipped the theme and
    ran axe immediately, and axe reported a colour-contrast failure on the
    theme toggle: foreground #67605A on #D36A40. Neither colour exists at rest
    — the controls carry `transition-colors duration-150`, so the sweep was
    measuring a frame PART WAY between the two themes. Settled, the same
    element is #241B12 on #E07A4A, which passes comfortably.

    An accessibility sweep that samples during a transition is measuring a
    colour nobody ever sees, and it fails in the direction that wastes a day.
    """
    page.set_viewport_size({"width": width, "height": height})
    page.evaluate(
        "(t) => t === 'dark' "
        "? document.documentElement.setAttribute('data-theme','dark') "
        ": document.documentElement.setAttribute('data-theme','light')",
        theme,
    )
    page.wait_for_timeout(400)
    page.evaluate(AXE)
    return page.evaluate(
        """async () => {
          const r = await axe.run(document, {
            resultTypes: ['violations'],
            runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] },
          })
          return r.violations.map(v => ({
            id: v.id,
            nodes: v.nodes.map(n => ({ target: n.target.join(' '), html: n.html.slice(0, 120) })),
          }))
        }"""
    )


def overflows(page, width, height):
    page.set_viewport_size({"width": width, "height": height})
    return page.evaluate(
        "() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1"
    )


def main():
    global AXE
    AXE = open("node_modules/axe-core/axe.min.js").read()

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME)

        for email, password in (MANAGER, ADMIN):
            context = browser.new_context()
            sign_in(context.new_page(), email, password)
            context.close()
        sql(f"update users set platform_role='MANAGER' where email='{MANAGER[0]}'")

        # ================= VIEWER 1: SUPER_ADMIN ==============================
        boss = browser.new_context()
        boss_page = boss.new_page()
        sign_in(boss_page, *SUPER)
        boss_page.goto(f"{BASE}/admin/users", wait_until="load")

        hrefs = set(nav_hrefs(boss_page))
        for href in ("/admin/users", "/admin/managers", "/admin/permissions", "/admin/audit"):
            check(href in hrefs, f"super admin is offered {href}")

        text = boss_page.inner_text("body")
        # Asked of the LANDMARK, not of the word. The badge renders through
        # `uppercase`, so innerText returns "OPERATOR" and a substring check
        # for "Operator" failed on a banner that was plainly there.
        check(
            boss_page.locator('[role="status"][aria-label="Operator console"]').count() == 1,
            "the operator banner is on the page, as a labelled status landmark",
        )
        check(SUPER[0] in text, "and names the signed-in operator")
        check("Operations" in text, "the rail is labelled Operations, not EtsyPilot")
        check(
            boss_page.locator('nav[aria-label="Operator sections"]').count() >= 1,
            "the navigation is a labelled landmark",
        )
        check(
            boss_page.locator('a[href="#main"]').count() == 1,
            "there is a skip link, in its own landmark",
        )
        check(
            boss_page.locator('div[role="radiogroup"][aria-label="Colour theme"]').count() == 1,
            "the theme toggle is present and is a radiogroup",
        )
        check(
            boss_page.locator("details summary").count() == 1,
            "the account menu is a details/summary, so it opens with no JavaScript",
        )
        check(
            boss_page.locator('form[action="/api/auth/signout"][method="post"]').count() == 1,
            "SIGN-OUT IS A FORM POST, not a link a prefetch could fire",
        )

        # No seller chrome leaked across.
        for seller in ("Shop Pulse", "Bulk Editor", "Profit Reality", "Keyword"):
            check(seller not in text, f"no seller navigation on an operator screen ({seller})")

        # ---- the banner is on EVERY operator screen -------------------------
        for path in sorted(set(nav_hrefs(boss_page))):
            status, body = body_of(boss_page, path)
            check(status == 200, f"{path} renders for a super admin ({status})")
            check(
                boss_page.locator('[role="status"][aria-label="Operator console"]').count() == 1,
                f"{path} carries the marker",
            )

        # ================= VIEWER 2: ADMIN ===================================
        ops = browser.new_context()
        ops_page = ops.new_page()
        sign_in(ops_page, *ADMIN)
        ops_page.goto(f"{BASE}/admin/users", wait_until="load")

        hrefs = set(nav_hrefs(ops_page))
        check("/admin/users" in hrefs, "an admin is offered Accounts")
        check("/admin/permissions" not in hrefs, "an admin is NOT offered the matrix")
        check("/admin/audit" not in hrefs, "an admin is NOT offered the audit log")

        body = ops_page.content()
        for absent in ("/admin/permissions", "/admin/audit"):
            check(absent not in body, f"and {absent} is absent from the PAYLOAD, not just hidden")
        for tell in ("Locked", "padlock", 'aria-disabled="true"'):
            check(tell not in body, f"nothing hints at what they cannot reach ({tell})")
        check(
            "Administration" not in ops_page.inner_text("body"),
            "THE EMPTY GROUP HEADING IS GONE TOO — a heading over nothing is a padlock",
        )

        # ================= VIEWER 3: MANAGER with users.view =================
        set_manager_permissions(["users.view"])
        manager = browser.new_context()
        manager_page = manager.new_page()
        sign_in(manager_page, *MANAGER)
        manager_page.goto(f"{BASE}/admin/users", wait_until="load")

        hrefs = set(nav_hrefs(manager_page))
        check("/admin/users" in hrefs, "a manager holding users.view is offered Accounts")
        check(
            {"/admin/permissions", "/admin/audit"}.isdisjoint(hrefs),
            "and neither administration screen",
        )
        check(
            manager_page.locator('[role="status"][aria-label="Operator console"]').count() == 1,
            "and still sees the operator marker",
        )

        # ================= VIEWER 4: MANAGER with nothing ====================
        set_manager_permissions([])
        status, body = body_of(manager_page, "/admin/users")
        check(status == 404, f"a manager with no permissions gets 404 ({status})")
        check("Operator" not in body, "AND NO OPERATOR CHROME RENDERS AROUND THE 404")
        check("/admin/managers" not in body, "the refused response offers no navigation at all")
        set_manager_permissions(["users.view"])

        # ================= geometry and accessibility ========================
        # Run against the super admin, who sees the most: the widest rail, the
        # longest nav, and every group heading.
        boss_page.set_viewport_size({"width": 1440, "height": 1000})
        boss_page.goto(f"{BASE}/admin/users", wait_until="load")
        # Every screen this operator is offered, read from the rail rather than
        # written here — so a module added in a later part is swept without
        # anybody remembering to add it to a list.
        SCREENS = sorted(set(nav_hrefs(boss_page)))
        check(len(SCREENS) >= 4, f"the sweep has screens to visit ({len(SCREENS)})")

        for label, width, height in VIEWPORTS:
            for path in SCREENS:
                boss_page.set_viewport_size({"width": width, "height": height})
                boss_page.goto(f"{BASE}{path}", wait_until="load")
                boss_page.wait_for_timeout(200)
                check(
                    not overflows(boss_page, width, height),
                    f"{path} does not scroll sideways at {label}",
                )

            boss_page.goto(f"{BASE}/admin/users", wait_until="load")
            for theme in ("light", "dark"):
                violations = axe_violations(boss_page, width, height, theme)
                check(
                    violations == [],
                    f"no WCAG A/AA violations at {label} in {theme}"
                    + ("" if not violations else f" — {json.dumps(violations)[:600]}"),
                )

        # ---- the mobile drawer ----------------------------------------------
        boss_page.set_viewport_size({"width": 390, "height": 844})
        boss_page.goto(f"{BASE}/admin/users", wait_until="load")
        check(
            boss_page.locator('nav[aria-label="Operator sections"]').first.is_visible() is False,
            "the desktop rail is not rendered at 390",
        )
        opener = boss_page.locator('button[aria-controls="operator-nav"]')
        check(opener.count() == 1, "there is a drawer opener on mobile")

        box = opener.bounding_box()
        check(
            box is not None and box["width"] >= 44 and box["height"] >= 44,
            f"and it is a 44x44 touch target ({box['width']:.0f}x{box['height']:.0f})"
            if box
            else "and it is a 44x44 touch target (not measurable)",
        )

        opener.click()
        boss_page.wait_for_selector('nav#operator-nav', timeout=5000)
        drawer_links = boss_page.eval_on_selector_all(
            '#operator-nav a[href^="/admin"]',
            "els => els.map(e => ({href: e.getAttribute('href'), h: e.getBoundingClientRect().height}))",
        )
        # DERIVED, not a literal. This read `== 4` and went red the moment a
        # fifth operator screen was built — a test that has to be edited every
        # time the product grows is a test people edit without reading. The
        # real property is the comparison against the rail, below.
        check(
            len(drawer_links) >= 2,
            f"the drawer carries the operator's screens ({len(drawer_links)})",
        )
        check(
            all(link["h"] >= 44 for link in drawer_links),
            "and every row is at least 44px tall",
        )

        # The drawer must carry the same SET as the desktop rail — asserted
        # against the rail's own list rather than a number written here.
        boss_page.set_viewport_size({"width": 1440, "height": 1000})
        boss_page.goto(f"{BASE}/admin/users", wait_until="load")
        rail = set(
            boss_page.eval_on_selector_all(
                'nav[aria-label="Operator sections"] a[href^="/admin"]',
                "els => els.map(e => e.getAttribute('href'))",
            )
        )
        check(
            rail == set(link["href"] for link in drawer_links),
            f"THE DRAWER AND THE RAIL OFFER THE SAME SET ({sorted(rail)})",
        )

        # ---- escape closes it ------------------------------------------------
        boss_page.set_viewport_size({"width": 390, "height": 844})
        boss_page.goto(f"{BASE}/admin/users", wait_until="load")
        boss_page.locator('button[aria-controls="operator-nav"]').click()
        boss_page.wait_for_selector("nav#operator-nav", timeout=5000)
        boss_page.keyboard.press("Escape")
        boss_page.wait_for_selector("nav#operator-nav", state="detached", timeout=5000)
        check(True, "Escape closes the drawer")

        browser.close()

    for line in notes:
        print(line)
    for line in fails:
        print(line)
    print(f"\n{len(notes)} passed, {len(fails)} failed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
