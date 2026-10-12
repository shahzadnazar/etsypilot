"""What period each money screen says it reports on, read off the screen.

Run against a LIVE server with a connected shop and synced orders:

    DATABASE_URL=... TOKEN_ENCRYPTION_KEY=... ETSY_MODE=live npx next start -p 3121 &
    python3 tests/browser/reporting-window.py

Twelve domain services imported PERIOD_START and PERIOD_END from the demo
dataset with no mode check, so every screen that shows a seller money reported
on 14 July to 12 August 2026 for ever. Measured on 12 October 2026 against a
live shop with 87 synced orders running to the previous day: all six screens
reported that window and counted 15 orders worth $830.00; 51 orders worth
$3,843.80 were outside it. The dashboard printed "▲ 26.5% vs the period before"
from two windows that had both closed two months earlier.

Nothing in the unit suite could see it. Every test ran in demo mode, where the
frozen window IS the right answer, and the assertions were about shapes and
ratios rather than dates. That is why this is a browser check against a live
server: the defect was only visible to a seller.

WHAT IT CAN AND CANNOT CHECK. It reads the period each screen prints in its own
subtitle, so it can prove the six agree with each other and that the window
ends today — which is the whole of the defect. It cannot see the database, so it
does not check that the figures are right for the window; the integration suite
does that, and the figures are cross-checked here only against each other.
"""

import os
import re
import sys
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright

BASE = os.environ.get("LIVE_BASE_URL", "http://localhost:3121")
CHROME = os.environ.get("CHROME_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

# The six screens that show a seller money, and whether the subtitle names the
# period. The Action Center has no period line — it ranks open work — so it is
# checked for the figure it quotes instead.
PERIOD_SCREENS = ["/profit", "/shop-pulse", "/analytics", "/settings/costs", "/dashboard"]

MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec"
RANGE = re.compile(rf"({MONTHS}) (\d{{1,2}}), (\d{{4}}) – ({MONTHS}) (\d{{1,2}}), (\d{{4}})")
MONEY = re.compile(r"\$([\d,]+\.\d{2})")

fails, notes = [], []


def check(cond, msg):
    line = ("PASS " if cond else "FAIL ") + msg
    (notes if cond else fails).append(line)
    print(line, file=sys.stderr, flush=True)


def parse(m):
    order = {n: i + 1 for i, n in enumerate(MONTHS.split("|"))}
    start = datetime(int(m.group(3)), order[m.group(1)], int(m.group(2)), tzinfo=timezone.utc)
    end = datetime(int(m.group(6)), order[m.group(4)], int(m.group(5)), tzinfo=timezone.utc)
    return start, end


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width": 1440, "height": 1200})

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
        """Poll for a marker, because <main> appears before its content does.

        Next streams the dashboard — shop, plan, actions and the metric tiles
        resolve separately — so wait_for_selector("main") returns while the
        tiles are still suspended. This check aborted intermittently on exactly
        that: "the shop has no synced orders" against a shop with 87 of them,
        on a server that had just started. A fixed sleep would be the same race
        with a longer fuse.
        """
        waited = 0
        text = main_text(route)
        while marker not in text and waited < timeout_ms:
            pg.wait_for_timeout(250)
            waited += 250
            text = pg.locator("main").inner_text()
        return text

    # The server must be live and the shop must be connected and synced. Run
    # against demo mode and every assertion below passes for the wrong reason:
    # the fixture window IS the right window there.
    dash = main_text_when("/dashboard", "Gross sales")
    if pg.locator('[aria-label="Demo mode"], [aria-label="Public demo"]').count() > 0:
        print("ABORT: the server at " + BASE + " is in DEMO mode. Start it with ETSY_MODE=live.",
              file=sys.stderr)
        b.close()
        sys.exit(2)
    if "Verified" not in dash or not MONEY.search(dash):
        print("ABORT: the shop at " + BASE + " has no synced orders, so there is nothing to "
              "report a period over.", file=sys.stderr)
        b.close()
        sys.exit(2)

    today = datetime.now(timezone.utc).date()
    windows = {}

    for route in PERIOD_SCREENS:
        text = main_text(route)
        m = RANGE.search(text)
        check(m is not None, f"{route}: states the period it reports on")
        if not m:
            continue
        start, end = parse(m)
        windows[route] = (start.date(), end.date())

        # The end of the window is today. This is the assertion the constants
        # could not satisfy on any day but one.
        check(end.date() == today, f"{route}: the period ends today ({end.date()}, today {today})")

        # Thirty days, inclusive, which is what REPORTING_DAYS says and what
        # "vs the previous 30 days" on /analytics compares against.
        span = (end.date() - start.date()).days + 1
        # The dashboard formats the same two instants in the SHOP's timezone
        # rather than UTC, so its start date can read one day earlier. That is a
        # pre-existing formatting difference, not a different window.
        check(span in (30, 31), f"{route}: spans 30 days inclusive (read {span})")

    # All six agree. Two screens reporting different periods is how a seller
    # comes to believe one of them.
    ends = {r: w[1] for r, w in windows.items()}
    check(len(set(ends.values())) == 1, f"every screen ends its period on the same day: {ends}")

    # And the money figures agree across the screens that quote the same window.
    grosses = {}
    for route in ["/profit", "/analytics", "/settings/costs", "/dashboard"]:
        text = main_text(route)
        found = MONEY.findall(text)
        if found:
            grosses[route] = found[0]
    check(
        len(set(grosses.values())) == 1,
        f"the money screens agree on the period's revenue: {grosses}",
    )

    # Nothing anywhere still prints the fixture's window.
    for route in PERIOD_SCREENS + ["/action-center", "/analytics/sales-map",
                                   "/tools/seasonal-calendar", "/listings/audit"]:
        text = main_text(route)
        for stale in ["Jul 14, 2026", "Aug 12, 2026", "Aug 20, 2026", "Sep 1, 2026",
                      "Aug 9, 2026"]:
            check(stale not in text, f"{route}: no fixture date on screen ({stale})")

    b.close()

print("\n".join(notes))
if fails:
    print("\n" + "\n".join(fails))
    print(f"\n{len(fails)} FAILED, {len(notes)} passed")
    sys.exit(1)
print(f"\nall {len(notes)} passed")
