"""What a seller is told about their plan, and about where the seasons came from.

Two servers, because the whole question is what the MODE changes:

    DATABASE_URL=... TOKEN_ENCRYPTION_KEY=... ETSY_MODE=live npx next start -p 3121 &
    npx next start -p 3122 &
    python3 tests/browser/source-claims.py

lib/billing/index.ts fell back to MockBillingProvider whenever no payment
provider was configured, which is every deployment — the owner is applying for
the Etsy API key before wiring payments. So a live seller was shown an authored
subscription: Solo, renewing 12 September, a Visa ending 4242 they never gave
us, four invoices from May to August, and "$10.39 today, for the 23 days left in
this period". The sidebar chip said "Solo plan" on every screen, which is the
most-rendered claim in the product.

None of it was visible to the unit suite, because every test runs in demo mode
where the mock IS the right answer.

The seasonal half is the same defect in copy: /tools/seasonal-calendar said its
windows were "drawn from your own order history and public category
seasonality". There is no public category seasonality dataset. The three
windows are authored constants; the LIFT over them is genuinely measured on the
seller's own orders, and that half still says so.

It aborts rather than skips if either server is missing, or if either is in the
wrong mode. Both halves of this check pass for the wrong reason against one
server in demo mode.
"""

import os
import re
import sys
from playwright.sync_api import sync_playwright

LIVE = os.environ.get("LIVE_BASE_URL", "http://localhost:3121")
DEMO = os.environ.get("DEMO_BASE_URL", "http://localhost:3122")
CHROME = os.environ.get("CHROME_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

# Everything MockBillingProvider invented, by what it put on the screen.
FABRICATED = [
    "Visa ending 4242",
    "renews Sep 12, 2026",
    "YOUR PLAN",
    "Billing history",
    "23 days left in this period",
    "Solo · $15 per month",
]

# Sources that do not exist, named in copy.
INVENTED_SOURCES = [
    "public category seasonality",
    "modelled from public signals",
    "Public marketplace signals",
]

CHIP_SCREENS = ["/dashboard", "/profit", "/listings"]

fails, notes = [], []


def check(cond, msg):
    line = ("PASS " if cond else "FAIL ") + msg
    (notes if cond else fails).append(line)
    print(line, file=sys.stderr, flush=True)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width": 1440, "height": 1400})

    BANNER = '[aria-label="Demo mode"], [aria-label="Public demo"]'

    def body(base, route):
        resp = pg.goto(f"{base}{route}", wait_until="load")
        if resp is None or resp.status >= 400:
            print(f"ABORT: {base}{route} returned {resp.status if resp else 'nothing'}",
                  file=sys.stderr)
            b.close()
            sys.exit(2)
        pg.wait_for_selector("main", timeout=20000)
        pg.wait_for_timeout(300)
        return pg.locator("body").inner_text()

    body(LIVE, "/dashboard")
    if pg.locator(BANNER).count() > 0:
        print("ABORT: the server at " + LIVE + " is in DEMO mode. Start it with ETSY_MODE=live.",
              file=sys.stderr)
        b.close()
        sys.exit(2)
    body(DEMO, "/dashboard")
    if pg.locator(BANNER).count() == 0:
        print("ABORT: the server at " + DEMO + " is not serving the demo. Unset ETSY_MODE.",
              file=sys.stderr)
        b.close()
        sys.exit(2)

    # ── LIVE: no plan, no subscription, nothing charged ────────────────────
    billing = body(LIVE, "/billing")
    check("billing is not open yet" in billing, "live /billing: says billing is not open")
    check(
        "You are not on a plan, and you have not been charged anything." in billing,
        "live /billing: says the seller is on no plan and has not been charged",
    )
    check(
        "no plan limit is applied to any of it" in billing,
        "live /billing: says no plan limit is applied",
    )
    for ghost in FABRICATED:
        check(ghost not in billing, f"live /billing: nothing fabricated ({ghost!r})")
    # The plans themselves are real and still listed — this is not a blank page.
    for plan in ["Free", "Solo", "Growth", "$15", "$29"]:
        check(plan in billing, f"live /billing: the real plans are still listed ({plan!r})")
    check(
        billing.count("Not available to buy yet.") == 3,
        "live /billing: each of the three cards says it cannot be bought yet",
    )
    # The trial terms, the owner's sentence, with the card requirement right.
    check("7-day free trial" in billing, "live /billing: states the trial terms verbatim")
    check("no card required" not in billing, "live /billing: does not claim the trial needs no card")
    check(
        "Nothing charges automatically" not in billing,
        "live /billing: does not claim nothing charges at the end",
    )

    # The chip, on three other screens.
    for route in CHIP_SCREENS:
        text = body(LIVE, route)
        check("No plan yet" in text, f"live {route}: the chip says no plan")
        check("Solo plan" not in text, f"live {route}: the chip does not claim a paid plan")
        check(
            "Over your plan limit" not in text,
            f"live {route}: no limit from a plan nobody bought",
        )

    # ── LIVE: the seasonal windows are an assumption, and say so ───────────
    seasonal = body(LIVE, "/tools/seasonal-calendar")
    check(
        "assumption" in seasonal,
        "live /tools/seasonal-calendar: names the dates as an assumption",
    )
    check(
        "measured on your own orders" in seasonal,
        "live /tools/seasonal-calendar: keeps the measured half labelled measured",
    )
    tools = body(LIVE, "/tools")
    check("as CobaltRank assumes it" in tools, "live /tools: the card names the assumption")
    for route, text in [("/tools/seasonal-calendar", seasonal), ("/tools", tools)]:
        for invented in INVENTED_SOURCES:
            check(invented not in text, f"live {route}: no invented source ({invented!r})")

    # And the catalogue says what the product has, on the page that lists it.
    sources = body(LIVE, "/data/sources")
    check(
        "Not connected — billing is not open" in sources,
        "live /data/sources: reports no payment provider",
    )
    check(
        "Three windows, authored" in sources,
        "live /data/sources: lists the seasonal windows as authored",
    )

    # ── DEMO: the subscription and the calendar are both still there ───────
    demo_billing = body(DEMO, "/billing")
    check("Solo · $15 per month" in demo_billing, "demo /billing: the subscription is present")
    check("Billing history" in demo_billing, "demo /billing: the ledger is present")
    check(
        "This is a demo subscription." in demo_billing,
        "demo /billing: the page says the subscription is a demo one",
    )
    check(
        "no real money moves" in demo_billing,
        "demo /billing: says no money moves",
    )
    check(pg.locator(BANNER).count() > 0, "demo /billing: the persistent demo banner is on the page")

    for route in CHIP_SCREENS:
        text = body(DEMO, route)
        check("Solo plan" in text, f"demo {route}: the demo plan chip is present")
        check(pg.locator(BANNER).count() > 0, f"demo {route}: the demo banner is on the page")

    demo_seasonal = body(DEMO, "/tools/seasonal-calendar")
    check(len(demo_seasonal) > 500, "demo /tools/seasonal-calendar: the calendar is present")
    check("assumption" in demo_seasonal, "demo /tools/seasonal-calendar: names the assumption")
    for invented in INVENTED_SOURCES:
        check(invented not in demo_seasonal, f"demo seasonal: no invented source ({invented!r})")

    demo_sources = body(DEMO, "/data/sources")
    check(
        "Demo billing — the flows run, no money moves" in demo_sources,
        "demo /data/sources: reports the demo provider as a demo one",
    )

    b.close()

print("\n".join(notes))
if fails:
    print("\n" + "\n".join(fails))
    print(f"\n{len(fails)} FAILED, {len(notes)} passed")
    sys.exit(1)
print(f"\nall {len(notes)} passed")
