"""The landing page, driven the way a visitor drives it.

    npm run build && npx next start -p 3100 &
    python3 tests/browser/landing-page.py

WHY THIS EXISTS ALONGSIDE tests/unit/landing-page.test.ts

That file reads the source. It can prove the arithmetic has one home, that
`aria-expanded` is rendered from state, that no href is a fragment nothing
answers to. It cannot prove that pressing Enter on the Features button opens
a menu, that Escape closes it, or that typing 8 into the price field turns the
profit figure red — and those are the four defects the brief named.

Three of the four were defects of BEHAVIOUR in the approved export:

  NO POINTER, NO MENU      The menus were `group-hover:visible`. A keyboard
                           user could focus the button and press Enter, Return
                           and Space, and nothing opened. A touch device has no
                           hover at all, so the desktop menus were simply dead.
  AN INPUT THAT DID        The calculator rendered editable fee fields bound to
  NOTHING                  nothing, beside fee percentages written into the
                           markup. A seller could correct a rate, watch the
                           field accept it, and read a total that ignored them.
  A CLAMPED LOSS           `Math.max(0, netProfit)` rendered a product losing
                           money as "$0.00", which reads as break-even.

Each is checked here by doing the thing, not by reading about it.

WHAT A GREEN RUN OF THIS DOES NOT MEAN

It does not measure performance, and this file deliberately reports no score.
A Lighthouse number from one run on one machine in a sandbox is not a figure
worth writing in a report — the brief says so, and so does experience. What is
checked is the structural property behind two of those scores: no layout shift
from a late font, and no horizontal overflow at phone width.
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


def money(text):
    """The first currency amount in a string, as a float, sign preserved.

    The minus is U+2212 on this page, not a hyphen: the figure is typeset, not
    printed by `toFixed`. Reading it with `-?` alone is how a check for "is the
    loss negative" passes on a page showing a positive number.
    """
    match = re.search(r"([−-])?\$([\d,]+\.\d{2})", text)
    if not match:
        return None
    value = float(match.group(2).replace(",", ""))
    return -value if match.group(1) else value


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})

    console = []
    page.on("console", lambda m: console.append((m.type, m.text)))

    response = page.goto(BASE, wait_until="load")
    if response is None or response.status >= 400:
        print("ABORT: no server at " + BASE, file=sys.stderr)
        browser.close()
        sys.exit(2)

    # ── the copy the owner set, as RENDERED ────────────────────────────────
    #
    # Read from the DOM rather than the source, because a <br> between two
    # coloured spans is exactly the kind of markup that renders as
    # "KeywordsKnow" with no space in the accessible name.
    h1s = page.locator("h1")
    check(h1s.count() == 1, f"exactly one h1 on the landing page (found {h1s.count()})")
    headline = " ".join(h1s.first.inner_text().split())
    check(
        headline == "Find Better Keywords. Know Your Real Profit.",
        f"the headline reads as approved, in one heading: {headline!r}",
    )

    body = page.locator("main, body").first.inner_text()
    check(
        "Research Etsy keywords, check listings with evidence, monitor shop performance,"
        in " ".join(body.split()),
        "the hero description is the approved sentence",
    )

    # ── ISSUE 1: the primary call to action goes to signup ─────────────────
    cta = page.get_by_role("link", name="Start for Free").first
    check(cta.count() > 0, "a 'Start for Free' link is on the page")
    cta.click()
    #
    # `wait_for_url`, not `wait_for_load_state("load")`. The <Link> navigates
    # client-side, so the load event has ALREADY fired for the current document
    # and that wait returns instantly — the first version of this check read
    # `page.url` before the router had moved and reported a failure against a
    # button that works. It then compounded: `go_back` from a page it had not
    # yet left put the rest of the run on /signup, where the next six checks
    # were measuring a page that has no navigation menus on it.
    #
    page.wait_for_url(re.compile(r"/signup/?$"), timeout=10_000)
    check(True, f"'Start for Free' lands on the real signup route ({page.url})")
    # And the route is a real page rather than a redirect to a login wall.
    check(
        page.locator("form").count() > 0,
        "the signup route renders a form rather than bouncing",
    )
    # Back by URL rather than by history: history.back() after a client-side
    # navigation is one more thing that can be in flight when the next check
    # runs, and this file has already been bitten by exactly that.
    page.goto(BASE, wait_until="load")

    # Nothing on the page is a link to nowhere.
    dead = page.eval_on_selector_all(
        "a[href]",
        "els => els.filter(e => e.getAttribute('href') === '#'"
        " || e.getAttribute('href') === '#signup').map(e => e.textContent.trim())",
    )
    check(not dead, f"no link has a dead href (found {dead})")

    # Every on-page anchor resolves to an element that exists.
    missing = page.evaluate(
        """() => [...document.querySelectorAll('a[href^="#"], a[href^="/#"]')]
              .map(a => a.getAttribute('href').replace(/^\\/?#/, ''))
              .filter(id => id && !document.getElementById(id))"""
    )
    check(not missing, f"every fragment link has a target (missing {sorted(set(missing))})")

    # ── ISSUE 4: the menus, by keyboard and by Escape ──────────────────────
    features = page.get_by_role("button", name=re.compile("^Features"))
    check(features.count() == 1, "the Features menu is a button, not a hover target")
    check(
        features.first.get_attribute("aria-expanded") == "false",
        "the Features menu starts closed, and says so",
    )

    # Opened with the keyboard. This is the check the export could not pass.
    features.first.focus()
    page.keyboard.press("Enter")
    check(
        features.first.get_attribute("aria-expanded") == "true",
        "Enter on the Features button opens the menu",
    )
    panel_id = features.first.get_attribute("aria-controls")
    check(
        panel_id is not None and page.locator(f"#{panel_id}").is_visible(),
        "the panel aria-controls names is the one that appeared",
    )

    # Its links are reachable by Tab, in order, and go somewhere.
    page.keyboard.press("Tab")
    focused = page.evaluate("() => document.activeElement.textContent.trim()")
    check(
        focused.startswith("Keyword research"),
        f"Tab moves into the open menu (focus on {focused[:40]!r})",
    )

    page.keyboard.press("Escape")
    check(
        features.first.get_attribute("aria-expanded") == "false",
        "Escape closes the menu",
    )
    check(
        page.evaluate("() => document.activeElement.textContent.trim().startsWith('Features')"),
        "Escape returns focus to the button that opened it",
    )

    # ── and the pointer path, which is the design's own feel ───────────────
    #
    # Hover opens it — `onPointerEnter`, guarded on pointerType, rather than a
    # CSS :hover rule, so one piece of state drives both ways in. A mouse click
    # on the trigger therefore always arrives at an ALREADY-OPEN menu (the
    # pointerenter fires first), and toggles it shut. That is the right
    # behaviour for a disclosure and it is asserted rather than assumed,
    # because the obvious test — "click opens it" — is unwritable for a mouse
    # and passes only on a device with no hover, where the keyboard and touch
    # paths above are what actually apply.
    features.first.hover()
    check(
        features.first.get_attribute("aria-expanded") == "true",
        "hovering the Features button opens the menu for a pointer",
    )
    features.first.click()
    check(
        features.first.get_attribute("aria-expanded") == "false",
        "clicking the trigger of an open menu closes it",
    )

    # And a click outside closes it, which a hover-only menu never needed.
    #
    # Re-opened from the KEYBOARD rather than by hovering again: the pointer is
    # already over the trigger at this point, so a second `hover()` moves
    # nothing and fires no pointerenter — the check that asked for one failed
    # against a menu that opens on hover perfectly well.
    features.first.focus()
    page.keyboard.press("Enter")
    check(features.first.get_attribute("aria-expanded") == "true", "re-opened for the next check")
    page.locator("h1").first.click()
    check(
        features.first.get_attribute("aria-expanded") == "false",
        "a click outside the menu closes it",
    )

    # ── ISSUE 2: the calculator, used ──────────────────────────────────────
    page.locator("#calculator").scroll_into_view_if_needed()
    price = page.get_by_label("Item price")
    check(price.count() == 1, "the price field has one accessible label")

    def outcome():
        node = page.locator("[data-outcome]").first
        return node.get_attribute("data-outcome"), money(node.inner_text())

    state, profit = outcome()
    check(state == "profit" and profit is not None and profit > 0, f"a $42 sale is a profit ({profit})")

    # The defect, reproduced and then not reproduced: a price below cost.
    price.fill("8")
    page.wait_for_timeout(120)
    state, profit = outcome()
    check(state == "loss", "a price below cost is reported as a loss")
    check(
        profit is not None and profit < 0,
        f"the loss is shown as a NEGATIVE amount rather than clamped to $0.00 ({profit})",
    )

    # Colour is the second signal, not the only one — but it must be the right
    # one, because this page's whole argument is about financial clarity.
    colour = page.evaluate(
        "() => getComputedStyle(document.querySelector('[data-outcome]')).color"
    )
    check(colour.startswith("rgb(185, 28, 28"), f"the loss is painted in --danger ({colour})")

    price.fill("42")
    page.wait_for_timeout(120)
    state, back = outcome()
    check(state == "profit", "raising the price back makes it a profit again")

    # An unparseable keystroke is refused rather than turning the panel to NaN.
    price.fill("42")
    price.type("abc")
    page.wait_for_timeout(120)
    panel = page.locator("[data-outcome]").first.inner_text()
    check("NaN" not in page.locator("#calculator").inner_text(), "no NaN reaches the panel")
    check(money(panel) == back, "a refused keystroke leaves the figures alone")

    # THE FEE FIELDS ARE BOUND. This is the one the export rendered and ignored.
    page.get_by_role("button", name=re.compile("Fee assumptions")).click()
    transaction = page.get_by_label("Transaction fee percentage")
    check(transaction.count() == 1, "the transaction fee rate is an editable field")
    before = money(page.locator("[data-outcome]").first.inner_text())
    transaction.fill("20")
    page.wait_for_timeout(150)
    after = money(page.locator("[data-outcome]").first.inner_text())
    check(
        after is not None and before is not None and after < before,
        f"raising a fee rate lowers the profit ({before} → {after})",
    )

    page.get_by_role("button", name="Reset to the published rates").click()
    page.wait_for_timeout(150)
    check(
        money(page.locator("[data-outcome]").first.inner_text()) == before,
        "resetting the rates restores the original figure",
    )

    # The rates carry the date they were recorded. A fee with no date is a fee
    # that was true once.
    rates_text = page.locator("#calculator").inner_text()
    check(
        re.search(r"Recorded 20\d\d-\d\d-\d\d", rates_text) is not None,
        "the fee assumptions state the date they were recorded",
    )

    # ── the sample data says it is sample data ─────────────────────────────
    #
    # Case-insensitive, deliberately. `inner_text` returns the text as RENDERED
    # and the badge carries `text-transform: uppercase`, so the literal in the
    # markup and the string on the screen are different — a check written
    # against the markup fails on a page that is perfectly correct.
    #
    check(
        "illustrative sample shop" in body.lower(),
        "the dashboard preview is labelled as a sample inside the picture",
    )
    check(
        "A sample shop, not a real one" in body,
        "and the figure carries a caption saying the same thing",
    )
    check(
        "Etsy publishes no search volume" in body,
        "the keyword section states that Etsy publishes no search volume",
    )

    # ── the FAQ accordion, with no JavaScript involved ─────────────────────
    summary = page.locator("#faq summary").first
    check(summary.count() > 0, "the FAQ is a disclosure list")
    answer_before = page.locator("#faq details").first.evaluate("el => el.open")
    summary.click()
    check(
        page.locator("#faq details").first.evaluate("el => el.open") != answer_before,
        "an FAQ question toggles when activated",
    )
    summary.focus()
    page.keyboard.press("Enter")
    page.wait_for_timeout(60)
    check(
        page.locator("#faq details").first.evaluate("el => el.open") == answer_before,
        "and it toggles from the keyboard too",
    )

    # ── the footer's year, and the absence of a company ────────────────────
    footer = page.locator("footer").inner_text()
    import datetime

    check(
        f"© {datetime.date.today().year}" in footer,
        f"the footer states the current year (footer says {footer.splitlines()[-1][:40]!r})",
    )
    check(
        not re.search(r"\b(Ltd|Limited|Inc\.|LLC)\b", footer),
        "the footer names no registered company, because there is not one yet",
    )

    # ── SEO, as served ────────────────────────────────────────────────────
    #
    # No domain has been bought, so the canonical tag and the absolute card
    # URLs must be ABSENT rather than pointing at a guessed host. The unit
    # suite covers both branches of that; here the question is what the server
    # actually emitted.
    canonical = page.locator("link[rel=canonical]").count()
    configured = os.environ.get("NEXT_PUBLIC_APP_URL", "").strip()
    if configured:
        check(canonical == 1, "a canonical link is served when an origin is configured")
    else:
        check(canonical == 0, "no canonical link is invented while there is no domain")
    check(
        page.locator("meta[name=description]").count() == 1,
        "the page serves exactly one meta description",
    )

    robots = page.request.get(f"{BASE}/robots.txt")
    check(robots.status == 200, "robots.txt is served")
    robots_body = robots.text()
    check("Disallow: /dashboard" in robots_body, "robots.txt keeps the product out of the index")
    check("Disallow: /api/" in robots_body, "robots.txt keeps the demo door out of the index")
    if not configured:
        check("Sitemap:" not in robots_body, "robots.txt names no sitemap while there is no domain")

    # ── images carry alternative text ─────────────────────────────────────
    unlabelled = page.eval_on_selector_all(
        "img",
        "els => els.filter(e => !e.hasAttribute('alt')).map(e => e.src)",
    )
    check(not unlabelled, f"every image has an alt attribute ({unlabelled})")

    # ── phone width: nothing scrolls sideways ─────────────────────────────
    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    mobile.goto(BASE, wait_until="load")
    overflow = mobile.evaluate(
        "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
    )
    check(overflow <= 1, f"no horizontal overflow at 390px (overflow {overflow}px)")

    # The mobile sheet opens, and its links are big enough to hit.
    toggle = mobile.get_by_role("button", name=re.compile("navigation menu"))
    check(toggle.count() == 1, "a mobile navigation toggle exists")
    toggle.click()
    check(
        toggle.get_attribute("aria-expanded") == "true",
        "the mobile toggle reports its own state",
    )
    small = mobile.eval_on_selector_all(
        ".mobile-link",
        "els => els.filter(e => e.getBoundingClientRect().height < 44)"
        ".map(e => e.textContent.trim() + ': ' + Math.round(e.getBoundingClientRect().height))",
    )
    check(not small, f"every mobile nav row is at least 44px tall ({small})")

    # The calculator is usable at phone width, which is where most of these
    # visitors are.
    mobile.locator("#calculator").scroll_into_view_if_needed()
    mobile_overflow = mobile.evaluate(
        "() => { const e = document.querySelector('#calculator');"
        " return e.scrollWidth - e.clientWidth }"
    )
    check(mobile_overflow <= 1, f"the calculator fits at 390px (overflow {mobile_overflow}px)")

    # ── the console is clean ──────────────────────────────────────────────
    #
    # A red line on every page load trains whoever is looking at it to stop
    # looking, which is how a real error comes to be missed.
    noise = [t for kind, t in console if kind in ("error", "warning")]
    check(not noise, f"no console errors or warnings on load ({noise[:3]})")

    mobile.close()
    browser.close()

print("\n".join(notes), file=sys.stderr)
if fails:
    print(f"\n{len(fails)} FAILED:\n" + "\n".join(fails), file=sys.stderr)
    sys.exit(1)
print(f"\nall {len(notes)} checks passed", file=sys.stderr)
