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
    # Free, Basic, Pro — and is where the Free card exists at all. The public
    # /pricing page renders FOUNDING_TIERS (Starter, Growth, Pro, Studio) and
    # has NO Free card, taking each tier's contents from the plan it maps to
    # through includesFor(). So the absence assertions belong on both and the
    # Free-card content assertions belong only on /billing. The first draft of
    # this check asserted "All six calculators" on /pricing and failed, which
    # is how the second surface was found.
    #
    # THE TWO SURFACES NOW USE DIFFERENT NAMES, and that is the point of the
    # per-route expectation below. The owner renamed the PLANS to Free, Basic
    # and Pro; the four founding TIERS on /pricing keep the names and prices
    # they were set with (Starter, Growth, Pro, Studio), because mapping four
    # paid tiers onto three plan names needs a pricing decision nobody has
    # made. A single "Growth is on the page" assertion passed on /pricing and
    # would have gone red on /billing for the right reason, which is not a
    # reason to loosen it — each surface is checked for the vocabulary it
    # actually renders.
    #
    for base, label in [(LIVE, "live"), (DEMO, "demo")]:
        for route, named_tier in [("/pricing", "Growth"), ("/billing", "Pro")]:
            text = body(base, route)
            # The page is really a plan surface and not an error page.
            check(named_tier in text and "$" in text,
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
        check("Free" in billing_text and "Basic" in billing_text,
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

    # And the top plan still has reasons to exist, on both surfaces. It is
    # called Pro on /billing and its contents reach /pricing through
    # includesFor(), so the CAPABILITIES are checked rather than the label.
    for route in ["/pricing", "/billing"]:
        top = body(LIVE, route)
        for real in ["2,000 listings", "90-day rollback", "Priority sync"]:
            check(real in top, f"live {route}: the top plan still lists {real!r}")
        # "500 AI generations" was here. The tier is thinner for it, which is
        # the true position rather than a gap to fill with a replacement line.
        check("AI generations" not in top,
              f"live {route}: the top plan advertises no AI allowance")

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
    # ── THE PAGE IS SILENT ABOUT THE REMOVED FEATURES, AND THAT IS THE RULE ─
    #
    # Anthropic, PBC was the one named provider in use. The feature that sent
    # to it is gone, so the row went with it — a sub-processor row is an
    # Article 28 statement that this company processes your data TODAY — and
    # for one revision the page explained the removal in a sentence.
    #
    # The owner's decision is that it explains nothing: no mention of either
    # removed feature on any seller-facing surface, not even a statement of
    # absence. The documents must be accurate rather than complete, and with
    # nothing sent to a model, silence is accurate. So this is asserted as
    # silence, in every form the words could take.
    # "draft" on its own is a different word in the same spelling: every legal
    # page carries the banner "Draft. Not in force…", and a check that banned
    # it would be satisfied by deleting the banner. The feature's own phrasings
    # are what is banned.
    for word in ["Anthropic", "AI provider", "language model", "AI feature",
                 "AI draft", "listing draft", "drafter", "copilot"]:
        check(word.lower() not in subs.lower(),
              f"live /legal/subprocessors: says nothing about a model provider ({word!r})")
    # Still not a blank page: the one named row left is the source of the data.
    check("Etsy, Inc." in subs,
          "live /legal/subprocessors: the named section still carries Etsy, Inc.")
    check("A sub-processor is a company that processes your data" in subs,
          "live /legal/subprocessors: still explains what the list is")

    # ── 4. /data/sources REPORTS THE EMPTY SEAM, AND NAMES NO MODEL AT ALL ──
    sources = body(LIVE, "/data/sources")
    check("Not built yet — no source" in sources,
          "live /data/sources: market signals report no source")
    check("Bought keyword data" not in sources,
          "live /data/sources: does not describe a source it does not have")
    # The catalogue had a language-model row for one revision, stating the
    # absence. It has none now: a row about a feature the product does not
    # have is still a sentence about that feature, on the page a seller opens
    # to find out what it reads from. Every row here names something real.
    for word in ["Language model", "AI provider", "Rule-based drafter", "Live model", "Anthropic"]:
        check(word.lower() not in sources.lower(),
              f"live /data/sources: names no model, in any form ({word!r})")
    # Anti-vacuity: the page is the catalogue, and it is still there.
    for real in ["Etsy Open API", "Your cost setup", "Demo dataset"]:
        check(real in sources, f"live /data/sources: still lists {real!r}")

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
