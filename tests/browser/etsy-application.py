"""What a seller — and an Etsy API reviewer — is shown about plans and providers.

Three servers, because the whole question is what the configuration changes:

    # live, nothing configured
    DATABASE_URL=... TOKEN_ENCRYPTION_KEY=... ETSY_MODE=live npx next start -p 3121 &
    # demo, to prove the demo is untouched
    npx next start -p 3122 &
    # live, with a keyword data provider configured and no adapter written
    SIGNALS_PROVIDER=example SIGNALS_API_KEY=x ... ETSY_MODE=live npx next start -p 3151 &
    python3 tests/browser/etsy-application.py

Three things are checked that no unit test can see, because each is about what
is rendered rather than what is computed:

  1. The pricing page and the billing page. Etsy's API review criterion 1 puts
     the home and pricing pages in scope, and `domain/billing/plans.ts:60` was
     advertising "Keyword, niche and product research" under a $0 tier — a
     feature 3dbce03 made unbuilt in live mode, and one Etsy itself now gives
     away free in Marketplace Insights. Prohibited Behavior item 22.
  2. Export, on no plan at all. "Full data export (CSV and JSON)" was a Growth
     line while Privacy §6 promised it to everyone with no request, and GDPR
     Article 20 gives it to everyone free. The three datasets have to answer
     with a file.
  3. The sub-processor page. A keyword data provider that is not bought must
     read NOT IN USE with a reason, and must not be named — and the moment a
     deployment configures one, the same page must move it to "in use, not yet
     named" without anybody editing the page. That second half is what the
     third server is for, and it is the only way to show the seam reports
     itself.
"""

import os
import re
import sys
from playwright.sync_api import sync_playwright

LIVE = os.environ.get("LIVE_BASE_URL", "http://localhost:3121")
DEMO = os.environ.get("DEMO_BASE_URL", "http://localhost:3122")
CONFIGURED = os.environ.get("CONFIGURED_BASE_URL", "http://localhost:3151")
CHROME = os.environ.get("CHROME_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

BANNER = '[aria-label="Demo mode"], [aria-label="Public demo"]'

# What Etsy now provides free, so no tier may advertise it (item 22).
ETSY_FREE = ["Keyword, niche and product research", "Keyword research", "niche research"]

fails, notes = [], []


def check(cond, msg):
    line = ("PASS " if cond else "FAIL ") + msg
    (notes if cond else fails).append(line)
    print(line, file=sys.stderr, flush=True)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width": 1440, "height": 1600})

    def body(base, route):
        resp = pg.goto(f"{base}{route}", wait_until="load")
        if resp is None or resp.status >= 400:
            print(f"ABORT: {base}{route} returned {resp.status if resp else 'nothing'}",
                  file=sys.stderr)
            b.close()
            sys.exit(2)
        pg.wait_for_selector("main, article, section", timeout=20000)
        pg.wait_for_timeout(300)
        return pg.locator("body").inner_text()

    body(LIVE, "/pricing")
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

    # ── 1. THE PRICING PAGE AND THE PLAN CARDS ─────────────────────────────
    #
    # TWO SURFACES, AND THEY ARE NOT THE SAME PAGE. /billing renders PLANS —
    # Free, Solo, Growth — and is where the Free card exists at all. The public
    # /pricing page renders FOUNDING_TIERS (Starter, Growth, Pro, Studio) and
    # has NO Free card, taking each tier's contents from the plan it maps to
    # through includesFor(). So the absence assertions belong on both and the
    # Free-card content assertions belong only on /billing. The first draft of
    # this check asserted "All six calculators" on /pricing and failed, which
    # is how the second surface was found.
    for base, label in [(LIVE, "live"), (DEMO, "demo")]:
        for route in ["/pricing", "/billing"]:
            text = body(base, route)
            # The page is really a plan surface and not an error page.
            check("Growth" in text and "$" in text,
                  f"{label} {route}: tiers and prices are on the page")
            for free in ETSY_FREE:
                check(free not in text,
                      f"{label} {route}: does not advertise what Etsy gives free ({free!r})")
            check("Research and calculators" not in text,
                  f"{label} {route}: no tier is positioned on research")
            check("Full data export" not in text,
                  f"{label} {route}: export is not sold as a tier feature")
            check("CSV and JSON" not in text,
                  f"{label} {route}: no tier claims a file format as a feature")

        billing_text = body(base, "/billing")
        check("Free" in billing_text and "Solo" in billing_text,
              f"{label} /billing: the three PLANS tiers are listed")
        check("Calculators and methodology, no shop connection" in billing_text,
              f"{label} /billing: the Free tier is positioned on what it has")
        for real in ["All six calculators", "Methodology and data sources"]:
            check(real in billing_text, f"{label} /billing: the Free tier lists {real!r}")
        # "5 AI generations / month" was the third line here, and D95 removed
        # the feature it priced. Checked in the negative now, on both surfaces:
        # a tier that advertises a generation allowance is selling nothing.
        check("AI generations" not in billing_text,
              f"{label} /billing: no tier advertises an AI allowance")
        check("No shop connection, profit or bulk editing" in billing_text,
              f"{label} /billing: the Free tier still states what it excludes")

    # And Growth still has reasons to exist, on both surfaces.
    for route in ["/pricing", "/billing"]:
        growth = body(LIVE, route)
        for real in ["2,000 listings", "90-day rollback", "Priority sync"]:
            check(real in growth, f"live {route}: Growth still lists {real!r}")
        # "500 AI generations" was here. Growth is thinner for it, which is the
        # true position rather than a gap to fill with a replacement line.
        check("AI generations" not in growth,
              f"live {route}: Growth advertises no AI allowance")

    # ── 2. EXPORT, ON NO PLAN AT ALL ───────────────────────────────────────
    #
    # The live server's session is on no plan — /billing says so — so this is
    # the ungated case by construction rather than by arranging one.
    billing = body(LIVE, "/billing")
    check("You are not on a plan" in billing, "live /billing: the session is on no plan")
    for dataset in ["transactions", "audit", "audit-log"]:
        resp = pg.request.get(f"{LIVE}/api/export/{dataset}")
        check(resp.status == 200, f"export /{dataset} answers on no plan (got {resp.status})")
        check("csv" in resp.headers.get("content-type", ""),
              f"export /{dataset} answers with a CSV")
        check(len(resp.body()) > 20, f"export /{dataset} is not an empty file")
    # A name the list does not carry is still a 404 — ungated is not unguarded.
    missing = pg.request.get(f"{LIVE}/api/export/listings")
    check(missing.status == 404, f"export /listings is still refused (got {missing.status})")

    # ── 3. THE SUB-PROCESSOR PAGE, NOTHING CONFIGURED ──────────────────────
    subs = body(LIVE, "/legal/subprocessors")
    check("keyword data provider" in subs,
          "live /legal/subprocessors: the keyword data provider has a row")
    check("Not in use" in subs, "live /legal/subprocessors: it is marked not in use")
    check("No keyword data provider is bought or configured" in subs,
          "live /legal/subprocessors: the row says why, measured")
    check("Nothing is sent to any of them." in subs,
          "live /legal/subprocessors: the section states nothing is sent")
    # Nothing may name a provider that is not connected.
    for invented in ["eRank", "Semrush", "Keyword Tool", "Marmalade"]:
        check(invented not in subs,
              f"live /legal/subprocessors: names no unconnected provider ({invented!r})")
    # Anthropic, PBC was the one named provider in use, and D95 removed the
    # feature that sent to it. A sub-processor row is an Article 28 statement
    # that this company processes your data TODAY, so the row came off with the
    # feature — and both directions are checked, because a table that names a
    # company nothing sends to is false in the same way as a missing row.
    # Asserted on the ROW rather than on the word. The page names Anthropic in
    # one sentence — saying a sub-processor has been removed is the same kind
    # of notice as saying one has been added, and a guard satisfiable only by
    # deleting that sentence would eventually be satisfied by deleting it. What
    # must be gone is the row: the "what they do" cell that said a provider
    # receives listing content.
    check("AI provider. Receives listing title and tags" not in subs,
          "live /legal/subprocessors: no row says an AI provider receives listing content")
    check("Anthropic, PBC was on this list" in subs,
          "live /legal/subprocessors: the removal is stated rather than silent")
    # Still not a blank page: the one named row left is the source of the data.
    check("Etsy, Inc." in subs,
          "live /legal/subprocessors: the named section still carries Etsy, Inc.")
    check("CobaltRank no longer has an AI feature" in subs,
          "live /legal/subprocessors: says why the AI provider is not listed")

    # ── 4. /data/sources REPORTS THE EMPTY SEAM, AND THE ABSENT MODEL ──────
    sources = body(LIVE, "/data/sources")
    check("Not built yet — no source" in sources,
          "live /data/sources: market signals report no source")
    check("Bought keyword data" not in sources,
          "live /data/sources: does not describe a source it does not have")
    # The language-model row did NOT disappear with the Copilot. This page is
    # the catalogue of what the product reads from, and "there is no language
    # model here" is a fact a seller came to it to learn — the same reason the
    # email, payment and keyword-provider rows are listed while resolving to
    # nothing. It used to read "Rule-based drafter — nothing leaves this
    # machine" or "Live model", whichever the adapter answered.
    check("Not connected — no AI provider in this product" in sources,
          "live /data/sources: the language-model row says there is no model")
    check("no listing, order or cost of yours is sent to a language model" in sources.lower(),
          "live /data/sources: the row says what is not sent, not only that it is off")
    for gone in ["Rule-based drafter", "Live model", "Anthropic"]:
        check(gone not in sources,
              f"live /data/sources: no longer claims a drafter ({gone!r})")

    # ── 5. THE SEAM REPORTS ITSELF WHEN A PROVIDER IS CONFIGURED ───────────
    configured_subs = body(CONFIGURED, "/legal/subprocessors")
    check("In use, and not yet named" in configured_subs,
          "configured /legal/subprocessors: the provider moves to in-use")
    check("A keyword data provider is configured on this deployment" in configured_subs,
          "configured /legal/subprocessors: says the role is live and must be named")
    check("and nothing from your shop" in configured_subs,
          "configured /legal/subprocessors: says no shop data would reach it")
    for invented in ["eRank", "Semrush", "Marmalade"]:
        check(invented not in configured_subs,
              f"configured /legal/subprocessors: still names no provider ({invented!r})")

    configured_sources = body(CONFIGURED, "/data/sources")
    check("Not built yet — provider configured, adapter missing" in configured_sources,
          "configured /data/sources: reports the provider with no adapter")
    check("Live sampling" not in configured_sources,
          "configured /data/sources: does NOT claim a live source it cannot read")

    # The Research screens stay unbuilt either way — configuration is not an
    # adapter, and this is the assertion that proves it.
    research = body(CONFIGURED, "/research/keywords")
    check("Live sampling" not in research,
          "configured /research/keywords: claims no live source")
    check(re.search(r"not built|no source|cannot", research, re.I) is not None,
          "configured /research/keywords: still says it is not built")

    b.close()

print("\n".join(notes))
if fails:
    print("\n" + "\n".join(fails))
    print(f"\n{len(fails)} FAILED, {len(notes)} passed")
    sys.exit(1)
print(f"\nall {len(notes)} passed")
