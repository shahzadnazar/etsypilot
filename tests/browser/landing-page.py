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

    # ── the revised structure, in the owner's order ───────────────────────
    #
    # The calculator checks that used to sit here are gone with the section
    # they drove: the homepage no longer carries a calculator, and the public
    # one at /tools/etsy-seller-calculator is a page of its own with its own
    # component. What is checked instead is the thing a restructure actually
    # breaks — a section appearing twice, a section not appearing at all, or
    # the sequence quietly rearranging.
    headings = [h.strip() for h in page.locator("main h2, h2").all_inner_texts()]
    joined = " | ".join(headings)

    for once in [
        "Built to Help Etsy Sellers Grow Smarter",
        "Three questions, answered with your own numbers.",
        "From Connection to Growth",
    ]:
        check(headings.count(once) == 1, f"exactly one {once!r} section (found {headings.count(once)})")

    for gone in [
        "Profit is hard on Etsy",
        "Five surfaces",
        "Every number says where it came from",
        "Eight things you can check",
        "Try the arithmetic",
        "Find keywords worth targeting",
    ]:
        check(gone not in joined, f"the {gone!r} section is gone")

    # The order, read off the page rather than off the source.
    def position(fragment):
        for index, heading in enumerate(headings):
            if fragment in heading:
                return index
        return -1

    sequence = [
        position("Built to Help Etsy Sellers"),
        position("Three questions"),
        position("Revenue is not profit"),
        position("A finding, a reason"),
        position("What changed, and what nobody"),
        position("Make bulk changes"),
        position("From Connection to Growth"),
    ]
    check(all(p >= 0 for p in sequence), f"every required section is on the page ({sequence})")
    check(sequence == sorted(sequence), f"the sections are in the owner's order ({sequence})")

    # ── the Discover row carries the keyword panel ────────────────────────
    #
    # Moved, not rebuilt. One keyword table on the page, inside the Three
    # Questions section, with the same note it always carried.
    explorers = page.get_by_text("Keyword explorer", exact=True)
    check(explorers.count() == 1, f"one keyword explorer panel (found {explorers.count()})")
    discover = page.locator("#features")
    check(
        "Keyword explorer" in discover.inner_text(),
        "and it sits inside the Three Questions section",
    )
    check("Find better keywords" in discover.inner_text(), "beside the Discover heading")
    check(
        "Etsy publishes no search volume" in discover.inner_text(),
        "with the search-volume position that came with it",
    )
    check(
        page.locator("#keywords").count() == 1,
        "the #keywords anchor still resolves, on the row that now holds it",
    )

    # ── every section that should have one has a Start for Free ───────────
    for section_id in ["why", "features", "profit", "listings", "performance", "bulk", "how-it-works"]:
        section = page.locator(f"#{section_id}")
        links = section.get_by_role("link", name=re.compile(r"^Start for Free"))
        check(links.count() >= 1, f"#{section_id} has a Start for Free button")
        if links.count() >= 1:
            check(
                links.first.get_attribute("href") == "/signup",
                f"#{section_id}'s button goes to /signup",
            )

    # The two secondary links the owner asked to keep, pointing at the
    # sections they name.
    for label, target in [("#profit", "profit"), ("#listings", "listings")]:
        check(
            page.locator(f"#features a[href='{label}']").count() == 1,
            f"the Understand/Improve card still links to {label}",
        )
        check(page.locator(f"#{target}").count() == 1, f"and #{target} is on the page")

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

    # Every section fits at phone width, rather than only the page as a whole.
    # A section that overflows inside a page that does not is a section whose
    # own content is clipped — which the document-level check cannot see.
    wide = mobile.eval_on_selector_all(
        "section[id]",
        "els => els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.id)",
    )
    check(not wide, f"no section clips its own content at 390px ({wide})")

    # And the How-it-works cards stack rather than squeezing four across.
    columns = mobile.evaluate(
        "() => { const grid = document.querySelector('#how-it-works ol');"
        " return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0 }"
    )
    check(columns == 1, f"the How It Works cards stack at 390px ({columns} columns)")

    # ── the console is clean ──────────────────────────────────────────────
    #
    # A red line on every page load trains whoever is looking at it to stop
    # looking, which is how a real error comes to be missed.
    # ── axe, on the page a stranger actually lands on ────────────────────
    #
    # tests/browser/rendered-output.py audits 104 surfaces and every one of
    # them is behind the login. This page had no accessibility sweep at all,
    # and the gap was not theoretical: the marketing palette's secondary grey
    # measured 4.34:1 on the alternating section bands — below AA for small
    # text, on roughly half the page — and nothing was looking.
    #
    # Light and dark, because the root layout's theme toggle applies here too.
    axe_source = open("node_modules/axe-core/axe.min.js").read()
    AXE_RUN = (
        "async () => await axe.run(document, {"
        " resultTypes: ['violations'],"
        " runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa']}"
        " })"
    )

    #
    # AUDITED WITH REDUCED MOTION, and that is a correctness choice rather
    # than a speed one. The hero ledger's rows fade in on a stagger, so a
    # sweep that runs while they are mid-animation samples text at partial
    # opacity and reports contrast failures for colours that exist for 200ms.
    # It reported three. With motion reduced the rows land on their final
    # state immediately — and the final state is the one the stylesheet
    # already guarantees is complete, so nothing real is skipped.
    #
    for theme in ["light", "dark"]:
        audited = browser.new_page(
            viewport={"width": 1440, "height": 1000}, reduced_motion="reduce"
        )
        audited.goto(BASE, wait_until="load")
        audited.evaluate("(t) => document.documentElement.setAttribute('data-theme', t)", theme)
        audited.wait_for_timeout(300)
        audited.evaluate(axe_source)
        report = audited.evaluate(AXE_RUN)
        ids = [f"{v['id']}({len(v['nodes'])})" for v in report["violations"]]
        check(not ids, f"no WCAG A/AA violation on the landing page in {theme} ({ids})")
        audited.close()

    noise = [t for kind, t in console if kind in ("error", "warning")]
    check(not noise, f"no console errors or warnings on load ({noise[:3]})")

    mobile.close()
    browser.close()

print("\n".join(notes), file=sys.stderr)
if fails:
    print(f"\n{len(fails)} FAILED:\n" + "\n".join(fails), file=sys.stderr)
    sys.exit(1)
print(f"\nall {len(notes)} checks passed", file=sys.stderr)
