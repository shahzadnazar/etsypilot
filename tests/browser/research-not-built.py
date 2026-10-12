"""What the Research section shows in each mode, read off the screen.

Two servers, because the whole question is what the MODE changes:

    # live: a connected shop, no market-data source
    DATABASE_URL=... TOKEN_ENCRYPTION_KEY=... ETSY_MODE=live npx next start -p 3121 &
    # demo: the fictional catalogue
    npx next start -p 3122 &
    python3 tests/browser/research-not-built.py

Why this is in the browser and not in the unit suite. The defect it covers was
invisible to 1,466 passing tests: lib/signals/index.ts handed out
MockMarketSignalsService unconditionally, so on a live deployment — a real
connected shop, a paying seller — all five Research screens printed a mock's
figures, and the demo badge was absent too, because the badge asks isDemoMode()
and that is false exactly then. Every one of those screens rendered perfectly in
every review, because every review was in demo mode.

So this asks the two questions a review cannot: what does a SELLER see, and what
does a VISITOR see, on the same five routes.

It aborts rather than skips if either server is missing. A check that passes
quietly when the thing it measures is not running is the shape this project has
met five times.
"""

import os
import re
import sys
from playwright.sync_api import sync_playwright

LIVE = os.environ.get("LIVE_BASE_URL", "http://localhost:3121")
DEMO = os.environ.get("DEMO_BASE_URL", "http://localhost:3122")
CHROME = os.environ.get("CHROME_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

PAGES = [
    ("/research/keywords", "Keywords"),
    ("/research/opportunities", "Find hot products"),
    ("/research/niche", "Niche research"),
    ("/research/competitors", "Compare shops"),
    ("/research/keyword-lists", "Keyword Lists"),
]

# Every one of these was on a Research screen before this commit. They are the
# claims, not the vocabulary: "sample" and "sample data" are what the copy says
# now and are deliberately absent.
CLAIMS = [
    r"\bobserv(e|ed|es|ing|ation)\b",
    r"\bsampl(ed|ing|er)\b",
    r"\bcounted\b",
    r"\bpublicly visible\b",
    r"\bon Etsy right now\b",
    r"\bpublic marketplace signals\b",
    r"\blast (updated|observed|refreshed)\b",
]

# A date on one of these screens could only have come from the authored constant
# in lib/signals/mock.ts, which is gone. 20 August 2026, 2 months ago, 2026-08-20.
DATES = [
    r"\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}",
    r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}",
    r"\b\d+ (minutes?|hours?|days?|weeks?|months?) ago\b",
    r"\b2026-\d{2}-\d{2}\b",
]

# Keyword Lists is the exception, and only in demo. Its cards carry each list's
# own `updatedAt` — a property of the list, which is a sample list and says so.
# That is not an observation time for a figure, which is what the rule is about,
# and there are no figures on that screen at all.
NO_DATE_RULE = {"/research/keyword-lists"}

fails, notes = [], []


def check(cond, msg):
    line = ("PASS " if cond else "FAIL ") + msg
    (notes if cond else fails).append(line)
    print(line, file=sys.stderr, flush=True)


def main_text(pg, base, route):
    resp = pg.goto(f"{base}{route}", wait_until="load")
    if resp is None or resp.status >= 400:
        print(f"ABORT: {base}{route} returned {resp.status if resp else 'nothing'}", file=sys.stderr)
        sys.exit(2)
    pg.wait_for_selector("main", timeout=15000)
    return pg.locator("main").inner_text()


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width": 1440, "height": 1000})

    # ── the two servers really are in the two modes ─────────────────────────
    # Asserted before anything is measured. Both of these checks would pass
    # against one server in the wrong mode, which is the only way this file
    # can produce a confidently wrong report.
    BANNER = '[aria-label="Demo mode"], [aria-label="Public demo"]'
    main_text(pg, LIVE, "/dashboard")
    if pg.locator(BANNER).count() > 0:
        print("ABORT: the server at " + LIVE + " is in DEMO mode. Start it with ETSY_MODE=live.",
              file=sys.stderr)
        b.close(); sys.exit(2)
    main_text(pg, DEMO, "/dashboard")
    if pg.locator(BANNER).count() == 0:
        print("ABORT: the server at " + DEMO + " is not serving the demo. Unset ETSY_MODE.",
              file=sys.stderr)
        b.close(); sys.exit(2)

    # ── LIVE: five screens that say they are not built ─────────────────────
    for route, title in PAGES:
        text = main_text(pg, LIVE, route)
        check(pg.locator(BANNER).count() == 0, f"live {route}: no demo banner, so nothing is badged")
        check("Not built yet" in text, f"live {route}: says it is not built")
        check(title in text, f"live {route}: still reads as {title}, not as an error")
        # Keyword Lists has no figures on it, so it says so differently:
        # components/research/not-built.tsx carries both wordings and why.
        check(
            "There is no source for these figures yet" in text
            or "There is nothing behind this screen yet" in text,
            f"live {route}: says there is no source",
        )
        check(
            "no estimate dressed as a measurement" in text,
            f"live {route}: gives the product's own reason",
        )
        # The figures, by the names they appeared under.
        for ghost in ["Aurelia Made", "Est. monthly sales", "/ mo", "Opportunity score",
                      "Autumn gifting", "Wedding season 2027"]:
            check(ghost not in text, f"live {route}: no modelled figure left ({ghost!r})")
        for pattern in CLAIMS + DATES:
            hit = re.search(pattern, text, re.I)
            check(hit is None, f"live {route}: no claim or date ({pattern}) — found {hit.group(0) if hit else ''!r}")

    sources = main_text(pg, LIVE, "/data/sources")
    check("Not built yet — no source" in sources, "live /data/sources: reports NONE for market signals")
    check("Live sampling" not in sources, "live /data/sources: does not claim live sampling")

    # ── DEMO: the same five, with the sample, badged ────────────────────────
    for route, title in PAGES:
        text = main_text(pg, DEMO, route)
        check("Not built yet" not in text, f"demo {route}: the sample is present")
        check(title in text, f"demo {route}: reads as {title}")

        # How a visitor can tell. Three independent signals, all on screen.
        #
        # The chip is matched on its dashed border rather than on the word:
        # its inner_text carries the screen-reader detail as well, so an
        # anchored ^Demo$ matches nothing and reports every page as unbadged.
        chips = pg.locator("main span.border-dashed").count()
        check(
            pg.locator(BANNER).count() > 0,
            f"demo {route}: the persistent demo banner is on the page",
        )
        if route != "/research/keyword-lists":
            # Keyword Lists has no figures at all, so it carries no tiles.
            check(chips > 0, f"demo {route}: every figure tile carries a Demo chip ({chips} chips)")
        check(
            "sample" in text.lower(),
            f"demo {route}: the copy says what the figures are",
        )

        for pattern in CLAIMS + ([] if route in NO_DATE_RULE else DATES):
            hit = re.search(pattern, text, re.I)
            check(hit is None, f"demo {route}: no claim or date ({pattern}) — found {hit.group(0) if hit else ''!r}")

    # The sample is genuinely there, not an empty shell with a badge on it.
    keywords = main_text(pg, DEMO, "/research/keywords")
    check(bool(re.search(r"\d[\d,]*\s*–\s*[\d,]+", keywords)), "demo keywords: a demand band is rendered")
    check("Modelled sample data" in keywords, "demo keywords: the source category is the honest one")

    demo_sources = main_text(pg, DEMO, "/data/sources")
    check("Modelled sample data" in demo_sources, "demo /data/sources: still reports MOCK")

    b.close()

print("\n".join(notes))
if fails:
    print("\n" + "\n".join(fails))
    print(f"\n{len(fails)} FAILED, {len(notes)} passed")
    sys.exit(1)
print(f"\nall {len(notes)} passed")
