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
