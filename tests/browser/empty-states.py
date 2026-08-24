"""What every screen says when the shop has nothing in it.

Run against a server started with DEMO_DATASET=empty:

    DEMO_DATASET=empty npx next start -p 3112
    python3 tests/browser/empty-states.py

Why this is a separate file rather than a flag on rendered-output.py: it needs
a differently-configured server, and a check that silently skips when that
server is missing would be a vacuous pass — the shape this project has now met
four times. If the empty server is not up, this aborts loudly.

Every empty state in the product was unreachable before DEMO_DATASET=empty
existed, which is why so few of them did. The demo shop always has 450 listings
and 438 orders, so a screen that renders nonsense with no data renders perfectly
in every review. What one run found, on a product eleven phases in:

  /profit          "Net profit $1,322.05" on zero revenue. A LOSS shown as a
                   PROFIT — Money rendered Math.abs(value) and added a minus
                   only when the caller asked. The most consequential number in
                   the product, wrong in the direction that flatters.
  /listings/audit  "Health score 100 / 100" for a shop with no listings,
                   directly above "Covers 0% of your listings".
  /listings/ai-copilot   HTTP 500. Not "no listings yet" — "Something went
                   wrong on our side."
  /listings/bulk-editor  A wizard on step 3 with two steps ticked, offering to
                   "Validate 0 listings".
"""

import os
import re
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("EMPTY_BASE_URL", "http://localhost:3112")
CHROME = os.environ.get("CHROME_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
fails, notes = [], []


def check(cond, msg):
    line = ("PASS " if cond else "FAIL ") + msg
    (notes if cond else fails).append(line)
    print(line, file=sys.stderr, flush=True)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width": 1440, "height": 1000})

    # The server must genuinely be the empty one. Running these against the
    # normal demo shop would pass some checks for entirely the wrong reason.
    resp = pg.goto(f"{BASE}/listings/audit", wait_until="load")
    if resp is None or resp.status >= 400:
        print("ABORT: no server at " + BASE, file=sys.stderr)
        b.close(); sys.exit(2)
    # (?<!\d) is load-bearing. Without it this guard passed against the NORMAL
    # demo shop, because "450 listings checked" contains "0 listings checked" as
    # a substring — the guard meant to prove the checks were pointed at the
    # right server was itself satisfied by the wrong one.
    if not re.search(r"(?<!\d)0 listings checked", pg.locator("main").inner_text()):
        print("ABORT: the server at " + BASE + " is not serving the EMPTY dataset.\n"
              "Start it with DEMO_DATASET=empty.", file=sys.stderr)
        b.close(); sys.exit(2)

    # --- nothing crashes ---------------------------------------------------
    ROUTES = ["/dashboard", "/billing", "/profit", "/shop-pulse", "/listings/audit",
              "/listings/bulk-editor", "/listings/ai-copilot", "/research/keywords",
              "/research/keyword-lists", "/settings/shops", "/settings/export",
              "/settings/costs", "/settings/audit-log", "/settings/profile", "/listings",
              "/settings/security", "/data/sources", "/data/methodology",
              "/listings/change-history", "/analytics", "/analytics/sales-map",
              "/analytics/experiments",
              "/tools", "/action-center", "/onboarding"]
    broke = []
    for route in ROUTES:
        r = pg.goto(f"{BASE}{route}", wait_until="load")
        if r is None or r.status >= 400:
            broke.append(f"{route}={r.status if r else 'none'}")
    check(broke == [], f"Every page renders with an empty shop{'' if not broke else f' — {broke}'}")

    # --- a loss is a loss --------------------------------------------------
    pg.goto(f"{BASE}/profit", wait_until="load"); pg.wait_for_timeout(400)
    profit = pg.locator("main").inner_text()
    # Fixed costs (labour, other) apply with no orders, so this shop is losing
    # money. The figure must carry a minus.
    check("−$1,322.05" in profit.split("Net profit")[1][:120],
          "A shop with no revenue and fixed costs shows a NEGATIVE net profit")
    check("0.0%" not in profit.split("Net margin")[1][:120],
          "Net margin is not reported as 0.0% when there is no revenue to be a margin of")

    # --- an absent score is absent, not perfect ----------------------------
    pg.goto(f"{BASE}/listings/audit", wait_until="load"); pg.wait_for_timeout(400)
    audit = pg.locator("main").inner_text()
    check("100 / 100" not in audit, "An empty catalogue does not score 100 / 100")
    check("no health score" in audit.lower(), "The audit says why there is no score")
    check("Unavailable" in audit, "...and the badge says Unavailable, not Calculated")

    # --- empty states, not errors and not dead wizards ---------------------
    pg.goto(f"{BASE}/listings/ai-copilot", wait_until="load"); pg.wait_for_timeout(400)
    copilot = pg.locator("main").inner_text()
    check("went wrong" not in copilot, "An empty shop is not an error on the Copilot")
    check("No listings to draft for yet" in copilot, "The Copilot says what is missing")

    pg.goto(f"{BASE}/listings/bulk-editor", wait_until="load"); pg.wait_for_timeout(400)
    bulk = pg.locator("main").inner_text()
    check("Validate 0 listings" not in bulk, "The bulk editor does not offer to validate nothing")
    check("No listings to edit yet" in bulk, "The bulk editor says what is missing")


    # --- an absence is not an achievement ----------------------------------
    #
    # Costs & fees had the same shape of defect the health score had: with no
    # listings at all it reported "Every active listing has a cost", which is
    # vacuously true and reads as a shop in good order. Zero out of zero is not
    # completeness; it is nothing to be complete about.
    pg.goto(f"{BASE}/settings/costs", wait_until="load"); pg.wait_for_timeout(400)
    costs = pg.locator("main").inner_text()
    check("Every active listing has a cost" not in costs,
          "An empty catalogue is not congratulated on its cost coverage")
    check("No listings to cost yet" in costs, "Costs & fees says what is missing")
    check("of 0 active listings" not in costs,
          "The coverage card does not report a count out of zero as a fact")

    # --- a log of nothing is empty, not seeded -----------------------------
    #
    # The demo records were seeded whatever the dataset, so the audit log's own
    # empty state could not be reached at all - and an empty state nobody can
    # render is an empty state nobody has read.
    pg.goto(f"{BASE}/settings/audit-log", wait_until="load"); pg.wait_for_timeout(400)
    log = pg.locator("main").inner_text()
    check("Nothing has happened on this shop yet" in log,
          "The audit log has a reachable empty state")
    check("Apply refused" not in log,
          "...and an empty shop is not shown another shop's records")
    # `or "Refused only" in log` would have made this pass on the label alone,
    # which is present whatever the count. The count is the claim.
    flat = " ".join(log.split())
    check("All · 0" in flat and "Refused only · 0" in flat,
          "Both filter counts read zero rather than being hidden")

    # --- three zeros describe nothing ---------------------------------------
    pg.goto(f"{BASE}/listings", wait_until="load"); pg.wait_for_timeout(400)
    listings = pg.locator("main").inner_text()
    check("0 active" not in listings,
          "The listings header does not report a catalogue of zeros as a summary")
    check("No listings yet" in listings, "All Listings says what is missing")
    check("Search title, tag or SKU" not in listings,
          "...and offers no filter bar over nothing to filter")

    # --- an immutable trail of nothing is empty ----------------------------
    pg.goto(f"{BASE}/listings/change-history", wait_until="load"); pg.wait_for_timeout(400)
    history = pg.locator("main").inner_text()
    check("Nothing has been changed yet" in history,
          "Change history has a reachable empty state")
    check("Roll back" not in history,
          "...and offers no rollback with nothing to roll back")

    # --- analytics of nothing --------------------------------------------
    pg.goto(f"{BASE}/analytics", wait_until="load"); pg.wait_for_timeout(400)
    analytics = pg.locator("main").inner_text()
    check("No orders in this period" in analytics,
          "Shop analytics says there is nothing to analyse")
    check("$0.00" not in analytics,
          "...and reports no average order rather than an average of $0.00")

    pg.goto(f"{BASE}/analytics/sales-map", wait_until="load"); pg.wait_for_timeout(400)
    smap = pg.locator("main").inner_text()
    check("No orders in this period" in smap, "The sales map says what is missing")
    check("other regions" not in smap,
          "...and does not print a suppressed-regions row with nothing in it")
    # --- and every empty state points somewhere ----------------------------
    # rules.md section 12: never fail silently. An empty state that does not say
    # what to do next is a dead end with better typography.
    for route, marker in (("/listings/ai-copilot", "audit"), ("/listings/bulk-editor", "audit")):
        pg.goto(f"{BASE}{route}", wait_until="load"); pg.wait_for_timeout(300)
        links = pg.evaluate("() => [...document.querySelectorAll('main a')].map(a => a.textContent.trim())")
        check(any(marker in l.lower() for l in links),
              f"The empty state on {route} offers a next step")

    b.close()

print("\n".join(notes))
if fails:
    print("\n" + "\n".join(fails))
    print(f"\n{len(fails)} FAILED of {len(fails) + len(notes)}")
    sys.exit(1)
print(f"\nALL {len(notes)} EMPTY-STATE CHECKS PASSED")
