"""Whether a screen shows Etsy data it is no longer allowed to show.

Two servers, because one of them cannot answer the second half of the question:

    # the display gate: live mode, the dev session, a synced shop
    DATABASE_URL=... TOKEN_ENCRYPTION_KEY=... ETSY_MODE=live npx next start -p 3121 &
    # the failure path: a REAL signed-in seller, whose shop is not read-only
    python3 tests/browser/fake-gotrue.py 5998 &
    ... AUTH_MODE=live NEXT_PUBLIC_SUPABASE_URL=http://localhost:5998 \
        NEXT_PUBLIC_SUPABASE_ANON_KEY=anon npx next start -p 3131 &
    DATABASE_URL=... python3 tests/browser/freshness-window.py

The split is not tidiness. On the 3121 server getSession() falls back to the
demo session, whose shop is read-only, so a refresh is SKIPPED before it
reaches Etsy — the withholding is measurable there and a FAILED refresh is not.

Etsy's API Terms §5: "You will not display listing content more than six (6)
hours older than the corresponding information [on the Etsy Site]. You will not
display any other Etsy content more than twenty-four (24) hours older."

Before this check existed, NOTHING REFRESHED AT ALL. syncShopListings and
syncShopOrders were written, tested, and had no caller outside
tests/integration — so a seller connected a shop and nothing ever populated
`listings` or `orders`, and docs/legal/PRIVACY-POLICY-DRAFT.md §5 told sellers
otherwise. The unit suite could not see it: every unit test runs in demo mode,
where no Etsy content is displayed at all.

WHY THIS ONE TOUCHES THE DATABASE, UNLIKE THE OTHER CHECKS HERE. The defect IS
the timestamp. reporting-window.py says in its own header that it cannot see
the database and does not need to; this check cannot work without setting the
thing under test, so it moves `sync_state.last_synced_at` with psql between
phases and reads the consequence off the screen. It restores both timestamps on
the way out, including after a failure.

WHAT IT CAN AND CANNOT CHECK. It can prove that the display gate opens and
closes on the timestamp, that the SIX-hour and TWENTY-FOUR-hour windows are
separate (the phase where listings are withheld and orders are not is the whole
point), that a withheld screen says why rather than printing zeroes, and what a
seller sees when the re-read fails. It cannot prove a SUCCESSFUL fetch from
Etsy, because that needs an API key this deployment does not have — the
adapter-to-table half is measured in tests/integration/refresh-on-read.int.ts.
"""

import os
import re
import subprocess
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("LIVE_BASE_URL", "http://localhost:3121")
AUTH = os.environ.get("AUTH_BASE_URL", "http://localhost:3131")
SELLER_EMAIL = os.environ.get("SELLER_EMAIL", "seller@example.com")
SELLER_PASSWORD = os.environ.get("SELLER_PASSWORD", "seller-password-x")
AUTH_SHOP = os.environ.get("AUTH_SHOP_ID", "")
CHROME = os.environ.get("CHROME_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
DB = os.environ.get("DATABASE_URL")
SHOP = os.environ.get("FRESHNESS_SHOP_ID", "demo-willow-fern")

MONEY = re.compile(r"\$([\d,]+\.\d{2})")

fails, notes = [], []


def check(cond, msg):
    line = ("PASS " if cond else "FAIL ") + msg
    (notes if cond else fails).append(line)
    print(line, file=sys.stderr, flush=True)


def psql(statement, tuples_only=False):
    args = ["psql", DB, "-v", "ON_ERROR_STOP=1"]
    if tuples_only:
        args += ["-t", "-A"]
    result = subprocess.run(
        args + ["-c", statement],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print("ABORT: psql failed: " + result.stderr.strip(), file=sys.stderr)
        sys.exit(2)
    return result.stdout


def age(aggregate, interval, shop=None):
    """Move one aggregate's recorded sync time back. 'now' makes it fresh."""
    value = "now()" if interval == "now" else f"now() - interval '{interval}'"
    psql(
        f"update sync_state set last_synced_at = {value} "
        f"where shop_id = '{shop or SHOP}' and aggregate = '{aggregate}'"
    )


if not DB:
    print("ABORT: DATABASE_URL is required — this check sets the timestamp it measures.",
          file=sys.stderr)
    sys.exit(2)

rows = psql(
    f"select aggregate from sync_state where shop_id = '{SHOP}' order by aggregate"
)
if "LISTINGS" not in rows or "ORDERS" not in rows:
    print(f"ABORT: shop {SHOP} has no LISTINGS and ORDERS sync rows, so there is "
          "nothing whose age could be out of window.", file=sys.stderr)
    sys.exit(2)

# The failure phase needs a shop that is NOT read-only, because a read-only
# shop is skipped before the sync is reached. This check measures; it does not
# build the fixture, so it says what is missing rather than creating it.
auth_state = psql(
    "select s.is_demo::text || ':' || (select count(*) from sync_state x "
    f"where x.shop_id = s.id and x.aggregate = 'LISTINGS')::text "
    f"from shops s where s.id = '{AUTH_SHOP}'",
    tuples_only=True,
).strip()
if auth_state != "false:1":
    print(f"ABORT: AUTH_SHOP_ID ({AUTH_SHOP or 'unset'}) must name a shop with "
          "is_demo = false and a LISTINGS sync row, owned by SELLER_EMAIL — read "
          f"'{auth_state or 'no such shop'}' as is_demo:listings_sync_rows. A "
          "read-only shop is skipped before a refresh reaches Etsy, so the "
          "failure path is unreachable through it.", file=sys.stderr)
    sys.exit(2)

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport={"width": 1440, "height": 1400})

        def main_text(route):
            resp = pg.goto(f"{BASE}{route}", wait_until="load")
            if resp is None or resp.status >= 400:
                print(f"ABORT: {BASE}{route} returned {resp.status if resp else 'nothing'}",
                      file=sys.stderr)
                b.close()
                sys.exit(2)
            pg.wait_for_selector("main", timeout=20000)
            return pg.locator("main").inner_text()

        def main_text_when(route, marker, timeout_ms=20000):
            """Poll for a marker: Next streams, and the trigger then re-renders.

            Two different races, one helper. The tiles on /dashboard resolve
            separately from <main>, and the refresh trigger posts on mount and
            calls router.refresh() — so the interesting text can arrive on the
            second render rather than the first. A fixed sleep is the same race
            with a longer fuse.
            """
            waited = 0
            text = main_text(route)
            while marker not in text and waited < timeout_ms:
                pg.wait_for_timeout(250)
                waited += 250
                text = pg.locator("main").inner_text()
            return text

        if pg.goto(f"{BASE}/dashboard", wait_until="load") is None:
            print("ABORT: no server at " + BASE, file=sys.stderr)
            sys.exit(2)
        if pg.locator('[aria-label="Demo mode"], [aria-label="Public demo"]').count() > 0:
            print("ABORT: the server at " + BASE + " is in DEMO mode. Start it with "
                  "ETSY_MODE=live — every assertion below passes for the wrong reason "
                  "in demo mode, where no Etsy content is displayed at all.",
                  file=sys.stderr)
            b.close()
            sys.exit(2)

        # ── PHASE 1: both aggregates inside their windows ──────────────────
        age("LISTINGS", "now")
        age("ORDERS", "now")

        dash = main_text_when("/dashboard", "Gross sales")
        check(MONEY.search(dash) is not None, "fresh /dashboard: shows a money figure")
        check("Re-reading" not in dash, "fresh /dashboard: does not claim to be re-reading")

        for route in ["/analytics", "/profit", "/listings", "/action-center"]:
            text = main_text(route)
            check("Re-reading your shop from Etsy" not in text,
                  f"fresh {route}: shows its data rather than withholding it")

        listings_fresh = main_text("/listings")
        check("Not synced yet" not in listings_fresh, "fresh /listings: not called unsynced")

        # ── PHASE 2: SEVEN hours old. Listings out, orders in. ─────────────
        #
        # The phase that proves the two windows are two numbers. Both
        # aggregates are aged to the same instant, so nothing but the window
        # can produce a different answer on two screens.
        age("LISTINGS", "7 hours")
        age("ORDERS", "7 hours")

        listings = main_text_when("/listings", "Re-reading your shop from Etsy")
        check("Re-reading your shop from Etsy" in listings,
              "7h /listings: withholds the catalogue and says it is re-reading")
        check("6 hours" in listings, "7h /listings: names the six-hour window")
        check("your shop is not empty" in listings,
              "7h /listings: says the shop is not empty, rather than leaving a blank")
        check("No listings yet" not in listings,
              "7h /listings: does not claim the shop has no listings")

        audit = main_text_when("/listings/audit", "Re-reading")
        check("Re-reading your catalogue" in audit,
              "7h /listings/audit: the subtitle says it is re-reading")
        check("0 errors, 0 warnings" not in audit,
              "7h /listings/audit: no clean bill of health over a withheld catalogue")

        analytics = main_text_when("/analytics", "Gross sales")
        check("Re-reading your shop from Etsy" not in analytics,
              "7h /analytics: orders are INSIDE the 24-hour window, so still shown")
        check(MONEY.search(analytics) is not None,
              "7h /analytics: still shows its money figures")

        # ── PHASE 3: TWENTY-FIVE hours old. Both out. ──────────────────────
        age("LISTINGS", "25 hours")
        age("ORDERS", "25 hours")

        for route, marker in [
            ("/profit", "Re-reading your shop from Etsy"),
            ("/analytics", "Re-reading your shop from Etsy"),
            ("/shop-pulse", "Re-reading your shop from Etsy"),
            ("/action-center", "Re-reading your shop from Etsy"),
        ]:
            text = main_text_when(route, marker)
            check(marker in text, f"25h {route}: withholds and says it is re-reading")
            check("24 hours" in text, f"25h {route}: names the twenty-four-hour window")
            check("Not synced yet" not in text,
                  f"25h {route}: does not claim the shop has never been read")

        profit = main_text("/profit")
        check("Net profit" not in profit or MONEY.search(profit) is None,
              "25h /profit: prints no waterfall over withheld receipts")

        dash25 = main_text_when("/dashboard", "Gross sales")
        check("Re-reading from Etsy" in dash25,
              "25h /dashboard: the tiles say they are re-reading")
        check("Not synced yet" not in dash25,
              "25h /dashboard: the tiles do not say the shop was never read")

        # ── PHASE 4: fresh again. The gate closes as well as opens. ────────
        age("LISTINGS", "now")
        age("ORDERS", "now")

        back = main_text_when("/analytics", "Gross sales")
        check(MONEY.search(back) is not None,
              "fresh again /analytics: the figures come back")
        check("Re-reading your shop from Etsy" not in back,
              "fresh again /analytics: no longer withholding")

        # ── THE FAILURE PATH, ON A REAL SELLER'S SESSION ──────────────────
        #
        # 3121's session is the demo one and its shop is read-only, so the
        # refresh there is SKIPPED before it reaches Etsy. A signed-in seller
        # whose shop is not read-only gets the whole way to the sync, which on
        # this deployment refuses — the Application Terms still carry
        # [[LEGAL_ENTITY]], so nothing may be read from Etsy for ANYONE.
        #
        # That is the correct behaviour and it is the state every deployment is
        # in until the documents are finished. What is checked here is the
        # copy: it must not tell the seller to accept terms that do not exist,
        # or to reconnect a shop that is connected, or to try again.
        age("LISTINGS", "7 hours", shop=AUTH_SHOP)

        pg.goto(f"{AUTH}/login", wait_until="load")
        pg.fill('input[type="email"]', SELLER_EMAIL)
        pg.fill('input[type="password"]', SELLER_PASSWORD)
        pg.click('button[type="submit"]')
        pg.wait_for_url(re.compile(r"/(dashboard|onboarding)"), timeout=20000)

        def auth_text_when(route, marker, timeout_ms=25000):
            pg.goto(f"{AUTH}{route}", wait_until="load")
            pg.wait_for_selector("main", timeout=20000)
            waited = 0
            text = pg.locator("main").inner_text()
            while marker not in text and waited < timeout_ms:
                pg.wait_for_timeout(250)
                waited += 250
                text = pg.locator("main").inner_text()
            return text

        failed = auth_text_when("/listings", "Application Terms are not published")
        check("Application Terms are not published" in failed,
              "failed re-read: names the real reason — there is no agreement to read under")
        check("not something you can fix" in failed,
              "failed re-read: says it is not the seller's to fix")
        check("Reconnect the shop" not in failed,
              "failed re-read: does not blame the seller's connection")
        check("Try again" not in failed,
              "failed re-read: offers no retry for a failure retrying cannot fix")
        check("Nothing is wrong with your shop" in failed,
              "failed re-read: reassures about the shop itself")
        check("Re-reading your shop from Etsy now" not in failed,
              "failed re-read: stops claiming a re-read is in progress")
        check("0 active" not in failed and "No listings yet" not in failed,
              "failed re-read: still states no count over a withheld catalogue")

        b.close()
finally:
    # The shop is left exactly as fresh as the last phase set it, deliberately:
    # a half-run check must not leave a shop looking stale to the next reader.
    if DB:
        age("LISTINGS", "now")
        age("ORDERS", "now")

print("\n".join(notes))
if fails:
    print("\n" + "\n".join(fails))
    print(f"\n{len(fails)} FAILED, {len(notes)} passed")
    sys.exit(1)
print(f"\nall {len(notes)} passed")
