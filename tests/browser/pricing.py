"""The pricing surface, driven the way a visitor drives it.

    npm run build && npx next start -p 3100 &
    python3 tests/browser/pricing.py

WHY THIS EXISTS ALONGSIDE tests/unit/pricing.test.ts

That file reads the source. It can prove no price is written into the markup,
that `checkoutState` cannot call a plan purchasable, and that every limit in
the comparison table is read from the entitlements the product enforces. It
cannot prove that the Monthly/Annually control actually changes what is on the
screen, that the browser's back button undoes it, that the comparison page
opens on the interval the visitor chose, or that a disabled button is really
unclickable.

Those are the four things a pricing page gets wrong in ways no amount of
source reading would catch, because three of them are properties of the URL and
the fourth is a property of the DOM:

  THE TOGGLE IS TWO LINKS    So the selection survives navigation, a pasted
                             URL and the back button — none of which React
                             state does. Each is checked by doing it.
  THE DISABLED CTA           A `disabled` attribute that an element does not
                             actually honour is a button that takes money it
                             should not.
  THE STICKY HEADER          Checked by scrolling and measuring, because this
                             one shipped broken: `overflow-x: auto` makes an
                             element a scroll container on BOTH axes, and a
                             sticky descendant then sticks to IT rather than
                             to the viewport. The plan names sat on top of the
                             first category row at rest.
  NO HORIZONTAL OVERFLOW     At 390px, on both pages, including the table that
                             is deliberately allowed to scroll inside its own
                             container.
"""

import os
import re
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:3100")
CHROME = os.environ.get("CHROME_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

fails, notes = [], []


def check(cond, msg):
    line = ("PASS " if cond else "FAIL ") + msg
    (notes if cond else fails).append(line)
    print(line, file=sys.stderr, flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})

    console = []
    page.on("console", lambda m: console.append((m.type, m.text)))

    response = page.goto(f"{BASE}/pricing", wait_until="load")
    if response is None or response.status >= 400:
        print("ABORT: no server at " + BASE, file=sys.stderr)
        browser.close()
        sys.exit(2)

    # ── the structure the brief sets ───────────────────────────────────────
    check(page.locator("h1").count() == 1, "exactly one h1 on /pricing")
    check(
        " ".join(page.locator("h1").first.inner_text().split()) == "Choose Your Growth Plan",
        "the heading is the approved one",
    )
    body = page.locator("body").inner_text()
    check("SIMPLE, TRANSPARENT PRICING" in body.upper(), "the eyebrow is present")
    check(
        "Start free. Upgrade when your shop needs more." in " ".join(body.split()),
        "the subtitle is the approved sentence",
    )

    cards = page.locator(".plan-card")
    check(cards.count() == 3, f"exactly three pricing cards (found {cards.count()})")
    names = [cards.nth(i).locator("h3").inner_text().strip() for i in range(cards.count())]
    check(names == ["Free", "Basic", "Pro"], f"named Free, Basic, Pro in order (got {names})")

    # Equal height, which a card grid loses the moment one list grows.
    heights = [round(cards.nth(i).bounding_box()["height"]) for i in range(3)]
    check(max(heights) - min(heights) <= 1, f"the three cards are the same height ({heights})")

    # ── no invented price, anywhere on the rendered page ──────────────────
    #
    # Read from the DOM rather than the source: a price could arrive through a
    # component the unit sweep does not read, and what matters is what a
    # visitor sees.
    amounts = sorted(set(re.findall(r"\$\d[\d,]*(?:\.\d{2})?", body)))
    check(amounts == ["$0"], f"the only amount on the page is Free's $0 (found {amounts})")
    check(
        not re.search(r"save \d+%|\d+% off|two months free", body, re.I),
        "no annual saving is claimed",
    )
    for pending in ["Basic", "Pro"]:
        card = page.locator(".plan-card", has=page.get_by_role("heading", name=pending, exact=True))
        check(
            "Price to be confirmed" in card.inner_text(),
            f"{pending} says its price is not set",
        )

    # ── the calls to action ───────────────────────────────────────────────
    free_cta = page.get_by_role("link", name=re.compile(r"^Start for Free")).last
    check(free_cta.count() > 0, "Free has a real link as its call to action")

    for paid in ["Choose Basic", "Choose Pro"]:
        button = page.get_by_role("button", name=paid)
        check(button.count() == 1, f"{paid!r} is a button, not a link")
        check(button.first.is_disabled(), f"{paid!r} is disabled")
        # The reason is on the page beside it, not only in a title attribute.
        described = button.first.get_attribute("aria-describedby")
        check(
            described is not None and page.locator(f"#{described}").inner_text().strip() != "",
            f"{paid!r} names the reason it is disabled",
        )

    # A disabled button is genuinely inert, not merely styled as one.
    before = page.url
    page.get_by_role("button", name="Choose Pro").first.click(force=True)
    page.wait_for_timeout(200)
    check(page.url == before, "clicking a disabled plan button navigates nowhere")

    # ── the interval toggle ───────────────────────────────────────────────
    monthly = page.get_by_role("link", name="Monthly")
    annually = page.get_by_role("link", name="Annually")
    check(monthly.count() == 1 and annually.count() == 1, "both intervals are offered")
    check(
        monthly.first.get_attribute("aria-current") == "true"
        and annually.first.get_attribute("aria-current") is None,
        "Monthly is marked as the one in force",
    )
    check("/ month" in body, "the monthly card shows a monthly cadence")

    annually.first.click()
    page.wait_for_url(re.compile(r"billing=annual"), timeout=5_000)
    check(True, f"choosing Annually changes the URL ({page.url})")
    check(
        page.get_by_role("link", name="Annually").first.get_attribute("aria-current") == "true",
        "Annually is now the one in force",
    )
    annual_body = page.locator("body").inner_text()
    check("/ year" in annual_body, "the card now shows an annual cadence")
    check(
        "Annual billing is not set up yet" in " ".join(annual_body.split()),
        "and says annual billing is not set up",
    )

    # The browser's own buttons, which React state does not create history for.
    page.go_back()
    page.wait_for_load_state("load")
    check(
        "billing=annual" not in page.url
        and page.get_by_role("link", name="Monthly").first.get_attribute("aria-current") == "true",
        "the back button returns to Monthly",
    )
    page.go_forward()
    page.wait_for_load_state("load")
    check(
        page.get_by_role("link", name="Annually").first.get_attribute("aria-current") == "true",
        "the forward button returns to Annually",
    )

    # A pasted URL works, with no prior visit.
    fresh = browser.new_page(viewport={"width": 1440, "height": 1000})
    fresh.goto(f"{BASE}/pricing?billing=annual", wait_until="load")
    check(
        fresh.get_by_role("link", name="Annually").first.get_attribute("aria-current") == "true",
        "a direct URL opens on the chosen interval",
    )
    fresh.close()

    # ── compare all features ──────────────────────────────────────────────
    compare = page.get_by_role("link", name=re.compile("Compare All Features"))
    check(compare.count() >= 1, "a Compare All Features call to action exists")
    compare.first.click()
    page.wait_for_url(re.compile(r"/pricing/compare"), timeout=10_000)
    check(True, f"it opens the real route ({page.url})")
    check("billing=annual" in page.url, "and carries the chosen interval with it")

    # ── the comparison table ──────────────────────────────────────────────
    check(page.locator("h1").count() == 1, "exactly one h1 on /pricing/compare")
    check(
        " ".join(page.locator("h1").first.inner_text().split()) == "Compare CobaltRank Plans",
        "the comparison heading is the approved one",
    )
    table = page.locator("table.compare-table")
    check(table.count() == 1, "there is one comparison table")
    check(table.locator("caption").count() == 1, "it has a caption")
    headers = [h.strip() for h in table.locator("thead th").all_inner_texts()]
    check(len(headers) == 4, f"four column headers: a label and three plans ({len(headers)})")
    check(
        all(name in " ".join(headers) for name in ["Free", "Basic", "Pro"]),
        "the three plans are the columns",
    )

    table_text = table.inner_text()
    check("NOT BUILT" in table_text.upper(), "unbuilt features are marked as such")
    # Every cell in the keyword rows, across all three columns.
    keyword_row = table.locator("tr", has_text="Keyword lookups").first
    cells = [c.strip().upper() for c in keyword_row.locator("td").all_inner_texts()]
    check(
        cells and all("NOT BUILT" in cell for cell in cells),
        f"an unbuilt feature is unbuilt in every column, Pro included ({cells})",
    )

    # The limits are the ones the product enforces.
    for label, expected in [
        ("Listings managed", ["200", "2,000"]),
        ("Rollback window", ["30 days", "90 days"]),
        ("Performance history", ["3 months", "12 months"]),
        ("Audit history kept", ["90 days", "365 days"]),
    ]:
        row = table.locator("tr", has_text=label).first
        text = row.inner_text()
        check(all(value in text for value in expected), f"{label!r} shows {expected}")

    # ── the sticky header, by scrolling ───────────────────────────────────
    #
    # At rest the plan names must NOT be covering the first category row —
    # this shipped broken once, from a scroll container nobody meant to make.
    first_category = page.locator("th[scope=colgroup]").first
    head_box = table.locator("thead th").first.bounding_box()
    cat_box = first_category.bounding_box()
    check(
        cat_box["y"] >= head_box["y"] + head_box["height"] - 1,
        "at rest the plan headers do not cover the first category row",
    )
    #
    # Case-insensitive: the heading carries `text-transform: uppercase`, so
    # `inner_text` returns it as rendered and a check written against the
    # markup fails on a page that is perfectly correct.
    #
    check(
        "etsy keyword research" in first_category.inner_text().lower(),
        "and that category's heading is readable",
    )

    page.mouse.wheel(0, 900)
    page.wait_for_timeout(400)
    pinned = table.locator("thead th").nth(1).bounding_box()
    check(
        pinned is not None and 50 <= pinned["y"] <= 110,
        f"the plan names stay pinned under the site header while rows scroll ({pinned['y'] if pinned else None})",
    )

    # ── contact ───────────────────────────────────────────────────────────
    page.goto(f"{BASE}/pricing", wait_until="load")
    contact = page.get_by_role("link", name=re.compile("Contact Us"))
    check(contact.count() >= 1, "a Contact Us call to action exists")
    contact.first.click()
    page.wait_for_url(re.compile(r"/contact"), timeout=10_000)
    check(page.locator("h1").count() == 1, "exactly one h1 on /contact")

    contact_body = page.locator("body").inner_text()
    check(
        "Nothing has been emailed" in contact_body or "No automatic email goes out" in contact_body,
        "the page says no email is sent",
    )
    # No invented contact details.
    check(
        not re.search(r"[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}", contact_body, re.I),
        "no email address is invented",
    )
    check(
        not re.search(r"within \d+ (hours?|business days?)", contact_body, re.I),
        "no response time is promised",
    )

    # The form, or the honest absence of one. Without a database configured
    # there is nowhere to write, and the page must say so rather than take a
    # message and lose it.
    has_form = page.locator("form[action='/api/contact']").count() == 1
    if has_form:
        for field in ["Your name", "Email", "Subject", "Message"]:
            check(page.get_by_label(field, exact=True).count() == 1, f"the form has a {field} field")
        #
        # NOT `is_hidden()`. The honeypot is deliberately not `display: none`
        # — that is the first thing an automated submitter skips — so
        # Playwright correctly reports it as "visible": it has a box, it is
        # just 9999px to the left of one. Asserting the wrong property here
        # would have pushed the field towards `display: none` to make a test
        # pass, which is the test changing the product for the worse.
        #
        # So this asks the three things that are actually true of it: no
        # person can tab to it, no screen reader is told about it, and it is
        # not on the screen.
        #
        honeypot = page.locator("input[name=website]").first
        check(honeypot.get_attribute("tabindex") == "-1", "the honeypot is out of the tab order")
        check(
            honeypot.evaluate("el => el.closest('[aria-hidden=\"true\"]') !== null"),
            "the honeypot is hidden from assistive technology",
        )
        check(
            honeypot.evaluate("el => el.getBoundingClientRect().right < 0"),
            "the honeypot is positioned off the screen",
        )
    else:
        check(
            "The form is not available on this deployment" in contact_body,
            "with no database, the form is absent and the page says why",
        )

    # ── phone width ───────────────────────────────────────────────────────
    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    for route in ["/pricing", "/pricing/compare", "/contact"]:
        mobile.goto(f"{BASE}{route}", wait_until="load")
        mobile.wait_for_timeout(250)
        #
        # SCROLLED, not measured. `documentElement.scrollWidth` is the usual
        # metric and it is the one that misled here: on the comparison page it
        # read 692 against a 390 viewport while `body.scrollWidth` read 390,
        # and every element-level sweep came back clean. The question that
        # actually matters is whether the page MOVES, so this asks it.
        #
        overflow = mobile.evaluate(
            "() => { window.scrollTo(500, 0); const x = window.scrollX;"
            " window.scrollTo(0, 0); return x }"
        )
        check(overflow == 0, f"{route} does not scroll sideways at 390px (moved {overflow}px)")

    # The cards stack rather than clipping their prices or their buttons.
    mobile.goto(f"{BASE}/pricing", wait_until="load")
    mobile.wait_for_timeout(250)
    clipped = mobile.eval_on_selector_all(
        ".plan-card",
        "els => els.filter(e => e.scrollWidth > e.clientWidth + 1).length",
    )
    check(clipped == 0, f"no pricing card clips its own content at 390px ({clipped})")

    # The comparison table is the one thing allowed to scroll, inside itself.
    mobile.goto(f"{BASE}/pricing/compare", wait_until="load")
    mobile.wait_for_timeout(250)
    scroller = mobile.evaluate(
        "() => { const e = document.querySelector('table.compare-table').parentElement;"
        " return { scroll: e.scrollWidth, client: e.clientWidth } }"
    )
    check(
        scroller["scroll"] > scroller["client"],
        "the comparison table scrolls inside its own container on a phone",
    )
    # And the row labels stay put while it does, or the ticks are about nothing.
    label_before = mobile.locator("table.compare-table th[scope=row]").first.bounding_box()["x"]
    mobile.evaluate(
        "() => document.querySelector('table.compare-table').parentElement.scrollLeft = 300"
    )
    mobile.wait_for_timeout(250)
    label_after = mobile.locator("table.compare-table th[scope=row]").first.bounding_box()["x"]
    check(
        abs(label_after - label_before) <= 1,
        f"the row labels stay pinned while it scrolls ({label_before} → {label_after})",
    )

    # ── keyboard, and the console ─────────────────────────────────────────
    page.goto(f"{BASE}/pricing", wait_until="load")
    faq = page.locator("#faq details").first
    summary = faq.locator("summary")
    check(not faq.evaluate("el => el.open"), "an FAQ answer starts collapsed")
    summary.focus()
    page.keyboard.press("Enter")
    page.wait_for_timeout(120)
    check(faq.evaluate("el => el.open"), "Enter on a question opens it")
    page.keyboard.press("Enter")
    page.wait_for_timeout(120)
    check(not faq.evaluate("el => el.open"), "and closes it again")

    # Reduced motion: the resting state is the complete state, so a card is
    # fully legible with transitions off.
    reduced = browser.new_page(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    reduced.goto(f"{BASE}/pricing", wait_until="load")
    reduced.wait_for_timeout(250)
    reduced_text = reduced.locator(".plan-card").first.inner_text()
    check("Free" in reduced_text and "$0" in reduced_text, "a card is complete with motion reduced")
    transition = reduced.evaluate(
        "() => getComputedStyle(document.querySelector('.plan-card')).transitionDuration"
    )
    check(
        transition in ("0s", "0.001ms", "1e-06s"),
        f"and its transition is off rather than merely fast ({transition})",
    )
    reduced.close()

    # ── axe, over the pages the dashboard sweep never reaches ────────────
    #
    # tests/browser/rendered-output.py audits 104 surfaces and every one of
    # them is behind the login: its route list is the product, not the public
    # site. So these three pages — the ones a stranger actually lands on —
    # had no accessibility sweep at all until this ran.
    #
    # Light and dark, because a theme toggle ships in the root layout and
    # applies here; and at 390px, because a contrast failure introduced by a
    # responsive rule is still a contrast failure.
    axe_source = open("node_modules/axe-core/axe.min.js").read()
    AXE_RUN = (
        "async () => await axe.run(document, {"
        " resultTypes: ['violations'],"
        " runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa']}"
        " })"
    )

    def audit(target, where):
        target.evaluate(axe_source)
        report = target.evaluate(AXE_RUN)
        ids = [f"{v['id']}({len(v['nodes'])})" for v in report["violations"]]
        check(not ids, f"no WCAG A/AA violation on {where} ({ids})")

    for route in ["/pricing", "/pricing/compare", "/contact"]:
        for theme in ["light", "dark"]:
            # Reduced motion, for the reason tests/browser/landing-page.py
            # records: a sweep run mid-animation samples text at partial
            # opacity and reports colours that exist for 200ms.
            audited = browser.new_page(
                viewport={"width": 1440, "height": 1000}, reduced_motion="reduce"
            )
            audited.goto(f"{BASE}{route}", wait_until="load")
            audited.evaluate(
                "(t) => document.documentElement.setAttribute('data-theme', t)", theme
            )
            audited.wait_for_timeout(250)
            audit(audited, f"{route} in {theme}")
            audited.close()

    narrow = browser.new_page(viewport={"width": 390, "height": 844}, reduced_motion="reduce")
    for route in ["/pricing", "/pricing/compare"]:
        narrow.goto(f"{BASE}{route}", wait_until="load")
        narrow.wait_for_timeout(250)
        audit(narrow, f"{route} at 390px")
    narrow.close()

    noise = [t for kind, t in console if kind in ("error", "warning")]
    check(not noise, f"no console errors or warnings ({noise[:3]})")

    mobile.close()
    browser.close()

print("\n".join(notes), file=sys.stderr)
if fails:
    print(f"\n{len(fails)} FAILED:\n" + "\n".join(fails), file=sys.stderr)
    sys.exit(1)
print(f"\nall {len(notes)} checks passed", file=sys.stderr)
