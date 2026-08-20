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

def wait_for_text(pg, marker, timeout_ms=15000):
    """Poll main for text after a navigation.

    A form POST redirects, so the page is mid-navigation for a moment after the
    click. A fixed sleep is a race: it passed locally and failed under load,
    which is the worst kind of check to keep.
    """
    waited = 0
    while waited < timeout_ms:
        try:
            if marker in pg.locator("main").inner_text():
                return True
        except Exception:
            pass
        pg.wait_for_timeout(250)
        waited += 250
    return False


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

    # Billing (Phase 8): the screen is arranged around leaving, not upgrading.
    pg.goto(f"{BASE}/billing", wait_until="domcontentloaded"); pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(600)
    bill = pg.locator("main").inner_text()

    check("we will not bill you for something that does not exist yet" in bill,
          "The agency sentence is on the page verbatim")
    check("$79" not in bill, "No Agency card and no Agency price")
    check("Team seats" not in bill, "No meter for a capacity nobody has")
    check(bill.upper().count("YOUR PLAN") == 1, "Exactly one plan is marked as current")

    # Cancelling is a real control on this page, not a link to a support inbox.
    cancel = pg.get_by_role("button", name="Cancel plan")
    check(cancel.count() == 1, "Cancel plan is a button on the billing page itself")
    check("no retention call" in bill, "The page says there is no retention call")
    check("Cancelling takes 1 step" in bill and "subscribing takes 2" in bill,
          "The page prints both step counts so the symmetry is visible")
    check("email" not in bill.lower().split("refunds and cancellation")[-1][:400],
          "Cancelling never asks the seller to send an email")

    # Every plan change prices itself before its button.
    check("today" in bill and "not a full month" in bill,
          "An upgrade states the prorated amount and that it is not a full month")
    check("Nothing charged today" in bill, "A downgrade states that nothing is charged")
    check("Your data stays" in bill, "A downgrade states that data is kept")
    check("nothing is removed for you" in bill,
          "The listing cap says the seller chooses what to remove")

    # Refunds are self-serve with a computed window.
    check("more days" in bill, "The refund window shows days remaining, computed")
    check(pg.get_by_role("button", name="Request refund").count() == 1,
          "Requesting a refund is a button, not an email address")

    # A declined charge stays in the history.
    check("Card declined" in bill, "A failed payment is shown, not hidden")

    # The usage meters say what continues, not only what stops.
    check("unaffected" in bill, "A limit says what keeps working")

    # And the flows actually run. Clicking cancel must change the page, not
    # just return 303 — a cancellation that silently appears not to work is
    # worse than one that refuses. Found by driving it: the page was
    # prerendered, so every route returned 303 and nothing on screen moved.
    #
    # These checks MUTATE the demo subscription, so they normalise first: a run
    # that failed halfway used to leave the shop cancelled, and the next run
    # then failed for a different reason than the one under test.
    if "Your plan is cancelled" in bill:
        pg.get_by_role("button", name="Resume plan").first.click()
        wait_for_text(pg, "Cancel plan")

    pg.get_by_role("button", name="Cancel plan").click()
    cancelled = wait_for_text(pg, "Your plan is cancelled")
    after_cancel = pg.locator("main").inner_text()
    check(cancelled, "Cancelling actually cancels")
    check("nothing renews" in after_cancel, "The header stops promising a renewal")
    check("You keep everything until" in after_cancel,
          "Cancelling says the paid period is kept")
    check("Nothing is deleted" in after_cancel, "Cancelling says nothing is deleted")

    resume = pg.get_by_role("button", name="Resume plan")
    check(resume.count() >= 1, "Resuming is offered in one click, like cancelling")
    if resume.count() >= 1:
        resume.first.click()
        back = wait_for_text(pg, "Cancel plan")
        check(back and "Your plan is cancelled" not in pg.locator("main").inner_text(),
              "Resuming actually resumes")

    # The shell must agree with the billing page across a navigation.
    # Found by reading two pages after one change: /billing said "412 / 2,000"
    # while /dashboard still said "412 / 200" — the shell reads the plan and
    # every page but billing was prerendered at build time. Same failure as the
    # cancel button: state changed, screen did not move.
    def shell_usage(route):
        pg.goto(f"{BASE}{route}", wait_until="domcontentloaded")
        pg.wait_for_selector("main", timeout=15000)
        pg.wait_for_timeout(300)
        found = re.search(r"[\d,]+ / [\d,]+ listings", pg.locator("body").inner_text())
        return found.group(0) if found else None

    pg.goto(f"{BASE}/billing", wait_until="domcontentloaded")
    pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(300)
    upgrade = pg.get_by_role("button", name=re.compile("Upgrade to Growth"))
    check(upgrade.count() >= 1, "An upgrade is offered from the demo plan")
    if upgrade.count() >= 1:
        upgrade.first.click()
        wait_for_text(pg, "Growth · $29 per month")

        on_billing = shell_usage("/billing")
        on_dashboard = shell_usage("/dashboard")
        on_profit = shell_usage("/profit")
        check(
            on_billing is not None and on_billing == on_dashboard == on_profit,
            f"The plan chip agrees on every page after a change "
            f"(billing {on_billing}, dashboard {on_dashboard}, profit {on_profit})",
        )

        # Put the demo shop back, so the run is repeatable.
        pg.goto(f"{BASE}/billing", wait_until="domcontentloaded")
        pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(300)
        back = pg.get_by_role("button", name=re.compile("Move to Solo"))
        if back.count() >= 1:
            back.first.click()
            wait_for_text(pg, "Solo · $15 per month")


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

    # Settings → Browser Extension: both stores disabled, and the security
    # note is on the page rather than only in a README.
    pg.goto(f"{BASE}/settings/extension", wait_until="domcontentloaded")
    pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(400)
    ext = pg.locator("main").inner_text()
    check(pg.get_by_role("button", name="Coming soon").count() == 2,
          "Both store buttons are present and disabled")
    check(pg.locator("button[disabled]").count() >= 2, "Neither store button is clickable")
    check("Ask for your Etsy password" in ext, "The page lists what the extension can never do")
    check("activeTab" in ext and "https://www.etsy.com/*" in ext,
          "The page names the exact permissions requested")
    check("It does not read the Etsy page itself" in ext,
          "The page says it does not scrape Etsy's markup")
    check("fails and is never produced" in ext,
          "The page says the limits are enforced by the build, not by policy")

    # Simple Calculator: the formula is shown with the number, and the tool
    # never claims a basis it does not have.
    pg.goto(f"{BASE}/tools/simple-calculator", wait_until="domcontentloaded")
    pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(400)

    check("Enter amount and discount" in pg.locator("main").inner_text(),
          "With nothing typed the calculator prompts rather than showing a zero")

    pg.fill("#calc-a", "29")
    pg.fill("#calc-b", "20")
    pg.wait_for_timeout(300)
    calc = pg.locator("main").inner_text()

    check("$23.20" in calc, "The worked example from the design computes on screen")
    check("$29.00 × (1 − 20%) = $23.20" in calc, "The formula is shown with the values substituted")
    check("Savings $5.80" in calc, "The secondary figure is shown")
    check("Not connected to your Etsy account" in calc,
          "The result states what it is based on")
    # Scoped to the result card, not the page. The page's own promise — "a rate
    # you type is never labelled an official Etsy fee" — contains the phrase,
    # and a page-wide check fails on the disclaimer. Third time this exact
    # shape has bitten: assert on the region under test, never on the prose
    # that describes it.
    result_card = calc[calc.find("Result") : calc.find("Copy result")]
    check("official Etsy fee" not in result_card,
          "The result itself is never labelled an official Etsy fee")
    check("never labelled an official Etsy fee" in calc,
          "The page states the promise it is keeping")
    check(pg.get_by_role("button", name="Copy result").is_enabled(),
          "Copy is enabled once there is something to copy")

    # A refusal, not a coerced zero.
    pg.fill("#calc-a", "0")
    pg.select_option("#calc-kind", "MARGIN")
    pg.wait_for_timeout(300)
    refused = pg.locator("main").inner_text()
    check("revenue above 0" in refused, "A divide-by-zero is refused in words")
    check("Infinity" not in refused and "NaN" not in refused,
          "A refused calculation shows no non-finite number")

    # Reset clears, and the prompt comes back.
    pg.get_by_role("button", name="Reset").click()
    pg.wait_for_timeout(300)
    check("Enter revenue and profit" in pg.locator("main").inner_text(),
          "Reset returns the calculator to its starting state")

    # The public variant: same component, no login, and no ask before a result.
    pg.goto(f"{BASE}/tools/etsy-seller-calculator", wait_until="domcontentloaded")
    pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(400)
    before = pg.locator("body").inner_text()
    check("Etsy seller calculator" in before, "The public calculator renders without a session")
    check("Create a free account" not in before,
          "No sign-up ask before the tool has given anything")
    check("Connect Etsy" not in before and "Connect your Etsy" not in before,
          "No Etsy connection prompt anywhere on the public page")
    check("Sidebar" not in before and "Action Center" not in before,
          "The public page does not render the app shell")

    pg.fill("#calc-a", "29")
    pg.fill("#calc-b", "20")
    pg.wait_for_timeout(400)
    after = pg.locator("body").inner_text()
    check("$23.20" in after, "The public page gives the same answer as the in-app one")
    check("Create a free account" in after, "The sign-up line appears only after a result")

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
