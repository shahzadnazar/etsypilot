"""
Rendered-output checks.

Kept, not scratch. Three times the unit suite has been green while the screen
was wrong — dark mode rendering white-on-white, the thin-sample rule labelling
the clearest case "Not enough data", and scenario selection leaking projected
KPIs above real receipts. All three were meaning errors, not logic errors, and
all three were invisible to tests that assert what the code does rather than
what the seller sees.

Two rules for anything added here:

  1. Assert on what is painted, never on what is shipped. Scope every assertion
     to `page.locator("main").inner_text()`. Searching raw HTML also matches the
     RSC serialization payload, which once produced a false pass on "no Verified
     badge appears in a projected scenario" — the string was in the wire format,
     not on the screen.

  2. Demo mode replaces every provenance badge with Demo (D11), so a
     Verified-vs-Calculated distinction is not assertable through the browser.
     Assert the thing that IS visible: the note naming the transform.

Run against a production build:

    npx next build && npx next start -p 3111 &
    python3 tests/browser/rendered-output.py

BASE and CHROME can be overridden by environment variable.
"""

import os
import re
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:3111")
CHROME = os.environ.get("CHROME_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
fails, notes = [], []

def check(cond, msg):
    (notes if cond else fails).append(("PASS " if cond else "FAIL ") + msg)

def open_tab(pg, name, marker):
    """Click until the tab's own content is on screen — hydration lands late."""
    for _ in range(20):
        try:
            pg.get_by_role("tab", name=name).click()
        except Exception:
            pass
        pg.wait_for_timeout(500)
        if marker in pg.locator("main").inner_text():
            return True
    return False

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width": 1440, "height": 1000})

    # --- Profit Reality: inputs panel ---
    pg.goto(f"{BASE}/profit", wait_until="domcontentloaded"); pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(600)
    check(open_tab(pg, "Scenarios", "Inputs"), "Scenarios tab opens")
    main = pg.locator("main").inner_text()

    check("Average price" in main, "Average price row is on the Scenarios tab")
    # D11: in demo mode every badge is replaced by Demo, so a Verified/Calculated
    # distinction is not assertable here. What IS assertable: nothing in the panel
    # tells the seller that all locked lines are verified, because two are not.
    check("Verified lines are read from your receipts" not in main,
          "Inputs panel no longer claims every locked line is verified")
    check("revenue ÷ orders" in main, "Average price names the transform on screen")
    check("fees ÷ revenue" in main, "Etsy fee rate names the transform on screen")
    inputs = main[main.find("Inputs"):]
    check(inputs.count("figures from the demo shop") >= 8,
          "Every input row carries its own badge (demo override, D11)")

    # --- Transactions: null profit renders as an em dash, never 0.00 ---
    check(open_tab(pg, "Transactions", "excluded from profit until"), "Transactions tab opens")
    tx = pg.locator("main").inner_text()
    check("—" in tx, "Transactions shows an em dash for unknown money")
    check(pg.get_by_text("No confirmed cost").first.count() > 0,
          "Unknown cost em dash carries an accessible reason")
    check(pg.get_by_text(re.compile("Not computed")).first.count() > 0,
          "Unknown profit em dash carries an accessible reason")


    # --- The totals row propagates the unknown (D34a) ---
    # Verified: broken deliberately before being kept — with sumOrNull changed to
    # skip nulls, this check fails on the em-dash assertion, as it must.
    check("Total · all" in tx, "The ledger has a totals row")
    total_row = tx[tx.find("Total · all"):]
    check("have no confirmed cost, so cost and profit cannot be totalled" in total_row,
          "The totals row says why cost and profit are blank")
    check("—" in total_row[:400], "Cost and profit totals render the em dash, not a sum")
    check(pg.get_by_text(re.compile("Unknown . cost is unknown for")).first.count() > 0,
          "The blank profit total carries its reason for screen readers")

    # --- The page does not claim an exclusion it does not perform (D34) ---
    pg.goto(f"{BASE}/profit", wait_until="domcontentloaded"); pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(600)
    banner = pg.locator("main").inner_text()
    check("exclude the rest rather than assuming a cost" not in banner,
          "Banner no longer claims uncosted orders are excluded")
    check("they are a floor" not in banner, "Banner no longer calls net profit a floor")
    check("costed by your default rule" in banner, "Banner names the fallback rule")

    # --- Money cells never wrap ---
    pg.set_viewport_size({"width": 390, "height": 900})
    pg.goto(f"{BASE}/profit", wait_until="domcontentloaded"); pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(600)
    pg.wait_for_timeout(400)
    bad = pg.evaluate("""() => {
      const out = [];
      for (const el of document.querySelectorAll('main .tnum')) {
        if (el.querySelector('.tnum, .sr-only')) continue;  // a container, not a money cell
        const t = (el.innerText || '').trim();
        if (!/[$€£]/.test(t)) continue;
        const cs = getComputedStyle(el);
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
        if (el.getBoundingClientRect().height > lh * 1.6) out.push(t.slice(0, 40));
        if (cs.fontVariantNumeric.indexOf('tabular-nums') === -1) out.push('no-tnum: ' + t.slice(0,30));
      }
      return out;
    }""")
    check(bad == [], f"No money cell wraps or loses tabular-nums at 390px (found {bad})")

    # No page scrolls sideways at 390px. Found the hard way: a seven-column
    # research table inside a card still put a scrollbar on the whole document,
    # and the fix was the designed one — cards below md, table above.
    for route in ["/research/keywords", "/listings/audit", "/listings/ai-copilot",
                  "/billing", "/settings/shops", "/tools", "/profit"]:
        pg.goto(f"{BASE}{route}", wait_until="domcontentloaded")
        pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(400)
        wide = pg.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 1")
        check(not wide, f"{route} does not scroll sideways at 390px")
    pg.set_viewport_size({"width": 1440, "height": 1000})

    # --- Phase 6 -------------------------------------------------------

    # Keyword Explorer: modelled figures never read as Etsy data.
    pg.goto(f"{BASE}/research/keywords", wait_until="domcontentloaded"); pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(600)
    kw = pg.locator("main").inner_text()
    check("not official Etsy data" in kw, "Keywords says the figures are not Etsy data")
    check("Etsy does not publish keyword search volume" in kw,
          "Keywords states that Etsy publishes no search volume")
    check("–" in kw and "/ mo" in kw, "Demand renders as a range with a unit")
    check("Sparse data" in kw, "A term with too little observation says so")
    # The sparse row must not carry a score derived from the missing demand.
    sparse_row = kw[kw.find("november birth flower"):][:200]
    check("Sparse data" in sparse_row, "The sparse row's demand cell says Sparse data")

    # Keyword Explorer for a term with no observation at all.
    pg.goto(f"{BASE}/research/keywords?q=november+birth+flower+chrysanthemum", wait_until="domcontentloaded")
    pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(600)
    thin = pg.locator("main").inner_text()
    check("Too few public signals were observed" in thin,
          "A sparse term explains itself instead of printing a small number")
    check("Not enough data" in thin, "Demand, competition and opportunity all read Not enough data")

    # Listing Audit: the score says what it weighs.
    pg.goto(f"{BASE}/listings/audit", wait_until="domcontentloaded"); pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(600)
    audit = pg.locator("main").inner_text()
    check("share of your verified revenue" in audit,
          "Health score states that it is weighted by revenue, not by count")
    check("carry no weight" in audit, "Audit says listings without orders carry no weight")
    check("no one outside Etsy can" in audit, "Audit disclaims ranking knowledge")
    check("rules" in audit and "14 rules" in audit, "Audit names how many rules it ran")

    # The money column is backward-looking; "at risk" is not.
    # Verified by breaking it first: restoring "at risk" fails this check.
    # "revenue at risk" as a LABEL must be gone. The one permitted occurrence of
    # the phrase is the sentence that disclaims it, so count rather than forbid —
    # a blanket check here fails on the disclaimer itself, which is the same
    # matching-the-prose-near-the-thing mistake as before, inverted.
    check("revenue at risk" not in audit.lower(),
          "Audit never labels a column or figure “revenue at risk”")
    check(audit.lower().count("at risk") == 1,
          "The only mention of “at risk” is the sentence saying it is not that")
    check("What it is not: money at risk" in audit,
          "The headline says outright what the figure does not claim")
    check("do not add up to this" in audit,
          "The headline says the per-rule figures do not sum to it")

    # AI Copilot: the approval gate is visible before the draft is read.
    pg.goto(f"{BASE}/listings/ai-copilot", wait_until="domcontentloaded"); pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(600)
    ai = pg.locator("main").inner_text()
    check("nothing publishes without your approval" in ai,
          "Copilot states the approval rule in the header")
    check("Send to review" in ai, "Primary action says review, not publish")
    check("Impact is not predicted" in ai, "Copilot refuses to forecast impact")
    check("Source:" in ai, "Every drafted element names its source")
    check("Publish to Etsy" not in ai, "No control on this page publishes directly")

    # Billing: three tiers, no Agency card, the approved sentence intact.
    pg.goto(f"{BASE}/billing", wait_until="domcontentloaded"); pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(600)
    bill = pg.locator("main").inner_text()
    check("we will not bill you for something that does not exist yet" in bill,
          "The agency sentence is on the page verbatim")
    check("$79" not in bill, "No Agency card and no Agency price")
    check("Team seats" not in bill, "No meter for a capacity nobody has")
    check(bill.upper().count("YOUR PLAN") == 1, "Exactly one plan is marked as current")
    check("450" not in bill, "The listings meter counts active listings, not every state")

    # Connect: the password disclosure and the revoke path.
    pg.goto(f"{BASE}/settings/shops", wait_until="domcontentloaded"); pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(600)
    conn = pg.locator("main").inner_text()
    check("never receives your Etsy password" in conn, "Connect states the password rule")
    check("Publish anything without your confirmation." in conn,
          "Connect lists what EtsyPilot cannot do")
    check("listings_r" in conn, "Etsy's own scope strings are printed so the grant is inspectable")
    check(pg.locator("input[type=password]").count() == 0, "No password field exists on the page")

    # --- Phase 7: AI hardening -------------------------------------------

    pg.goto(f"{BASE}/listings/ai-copilot", wait_until="domcontentloaded")
    pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(600)
    ai = pg.locator("main").inner_text()
    check("checked against the guardrails" in ai.lower() or "Checked against the guardrails" in ai,
          "The copilot says the draft was checked before display")
    check("no invented figures, no ranking claims, no forecasts" in ai,
          "The copilot names the three checks by what they prevent")
    check("rule-based draft (demo mode)" in ai,
          "The copilot names which provider produced the draft")
    # The guardrails themselves must not appear as claims about ranking.
    for banned in ["rank higher", "improve your visibility", "Etsy’s algorithm favours",
                   "expected lift", "you should see more"]:
        check(banned.lower() not in ai.lower(), f"Copilot page contains no “{banned}”")

    # Assisted prose is badged and traceable.
    pg.goto(f"{BASE}/action-center", wait_until="domcontentloaded")
    pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(600)
    ac = pg.locator("main").inner_text()
    check("Where to start" in ac, "The Action Center carries an assistant recommendation")
    check("Advice, not instruction" in ac, "The recommendation is framed as advice")
    check("given your screen and nothing else" in ac,
          "The page says what the assistant was allowed to see")

    pg.goto(f"{BASE}/listings/audit", wait_until="domcontentloaded")
    pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(600)
    au = pg.locator("main").inner_text()
    check("Where to start ·" in au, "The audit carries an assistant explanation for the worst rule")

    # --- Shop Pulse: baseline is described as calculated ---
    pg.set_viewport_size({"width": 1440, "height": 1000})
    pg.goto(f"{BASE}/shop-pulse", wait_until="domcontentloaded"); pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(600)
    sp = pg.locator("main").inner_text()
    check("vs calculated baseline" in sp, "Shop Pulse names the baseline as calculated")

    b.close()

print("\n".join(notes))
if fails:
    print("\n".join(fails)); sys.exit(1)
print(f"\nALL {len(notes)} CHECKS PASSED")
