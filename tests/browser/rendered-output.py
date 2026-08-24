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

import json
import os
import re
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:3111")
CHROME = os.environ.get("CHROME_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
fails, notes = [], []

def check(cond, msg):
    line = ("PASS " if cond else "FAIL ") + msg
    (notes if cond else fails).append(line)
    # Progress to stderr as it happens, so a run that stalls says WHERE it
    # stalled. The summary on stdout at the end is still the report.
    print(line, file=sys.stderr, flush=True)

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

    # --- The server must be serving the build you just made -----------------
    #
    # `next build` over a RUNNING `next start` leaves the old process serving a
    # manifest whose CSS chunk no longer exists. Every page then renders
    # unstyled, and the first thing that notices is the money-cell check
    # reporting eighteen cells that "lost tabular-nums" — a page-wide
    # infrastructure problem wearing a styling regression's clothes. It cost a
    # rebuild and a re-run to work out. So: fail here, in one line, with the
    # actual reason.
    pg.goto(f"{BASE}/profit", wait_until="load"); pg.wait_for_selector("main", timeout=15000)
    loaded = pg.evaluate("""() => [...document.styleSheets].filter(s => {
      try { return s.cssRules.length > 0 } catch (e) { return false }
    }).length""")
    if loaded == 0:
        print("ABORT: the page loaded with no stylesheet. The server is serving a stale\n"
              "build — restart `next start` after `next build`. Every styling check below\n"
              "would fail for this one reason.", file=sys.stderr)
        b.close()
        sys.exit(2)

    # --- Nothing a page needs may come from a third party -------------------
    #
    # Two promises collapse into one check.
    #
    # Privacy: this product tells sellers their data stays theirs. A stylesheet
    # from fonts.googleapis.com hands a third party every seller's IP address
    # and the URL of every page they open. A privacy promise undone by a font
    # link is not a privacy promise.
    #
    # Availability: a third-party <link rel="stylesheet"> is RENDER-BLOCKING.
    # The browser paints nothing until it resolves — so a seller behind a
    # corporate proxy, an aggressive blocker, or a bad mobile connection stares
    # at a blank page for however long their browser takes to give up.
    #
    # This is not hypothetical and it is why the check exists. The billing
    # cancel checks failed and it looked like a broken mutation. It was not:
    # the mutation committed in 3ms and the server returned the cancelled page
    # in 18ms. The browser then blocked for 12.6 SECONDS on the Google Fonts
    # stylesheet before giving up with ERR_CONNECTION_RESET, and `main` read as
    # empty that whole time. Every page load in the suite was paying it. The
    # fix was next/font, which fetches at build time and self-hosts; the suite
    # went from minutes to 27 seconds.
    #
    # Measuring the origin of each request is the only way to catch this. It is
    # invisible in the DOM, invisible in the tests, and on a fast developer
    # machine it is invisible in the browser too.
    third_party = []

    def record_offsite(r):
        if not r.url.startswith(BASE) and not r.url.startswith("data:"):
            third_party.append(r.url)

    pg.on("request", record_offsite)
    for route in ("/dashboard", "/billing", "/profit", "/tools/etsy-seller-calculator"):
        pg.goto(f"{BASE}{route}", wait_until="load"); pg.wait_for_selector("main", timeout=15000)
    pg.remove_listener("request", record_offsite)
    check(third_party == [],
          "No page fetches anything from a third-party origin"
          + ("" if third_party == [] else f" — got {sorted(set(third_party))[:3]}"))

    # The face itself must be served from this origin, not merely referenced.
    #
    # `and fonts` is load-bearing. Without it this passed during the deliberate
    # break, for the worst possible reason: the third-party stylesheet never
    # loaded, so the page declared NO font preloads at all, and "all of zero
    # fonts are local" is true. A check that passes when the thing it measures
    # is absent is not a check.
    fonts = pg.evaluate("""() => [...document.querySelectorAll('link[rel=preload][as=font]')]
      .map(l => l.href)""")
    check(bool(fonts) and all(f.startswith(BASE) for f in fonts),
          "The font is preloaded, and served from this origin")

    # --- Security headers, and a policy the app actually obeys --------------
    #
    # A CSP is worth exactly what the browser does with it, so this asserts on
    # both halves: the header is served, AND loading real pages produces no
    # violation.
    #
    # The second half is the one that earns its place. The first policy written
    # here used 'strict-dynamic', which by design IGNORES 'self' — so a script
    # tag Next emitted without a nonce was refused on /billing and /shop-pulse.
    # Nothing said so: no server error, no hydration warning, no missing markup.
    # The page simply lost a chunk of its JavaScript. Only the browser console
    # knew, which is the whole argument for checking it here.
    resp = pg.goto(f"{BASE}/dashboard", wait_until="load")
    h = {k.lower(): v for k, v in (resp.headers if resp else {}).items()}
    for name, expected in (
        ("x-frame-options", "DENY"),
        ("x-content-type-options", "nosniff"),
        ("referrer-policy", "strict-origin-when-cross-origin"),
    ):
        check(h.get(name) == expected, f"{name} is {expected}")
    check("max-age=" in h.get("strict-transport-security", ""), "HSTS is set")
    check("camera=()" in h.get("permissions-policy", ""), "Permissions-Policy refuses camera")

    csp = h.get("content-security-policy", "")
    check("nonce-" in csp, "The CSP carries a per-request nonce")
    check("'unsafe-inline'" not in csp.split("style-src-attr")[0],
          "Nothing but style ATTRIBUTES may be inline")
    check("frame-ancestors 'none'" in csp, "Nothing may frame this app")
    check("base-uri 'none'" in csp, "A <base> rewrite is refused")
    # The same promise as the off-origin request check, stated as policy: if a
    # host ever appears here, something off-origin was needed.
    check("http://" not in csp.replace("upgrade-insecure-requests", "")
          and "https://" not in csp,
          "The CSP names no third-party origin")

    violations = []
    pg.on("console", lambda m: violations.append(m.text[:120])
          if "Content Security Policy" in m.text else None)
    for route in ("/dashboard", "/billing", "/profit", "/shop-pulse",
                  "/listings/bulk-editor", "/tools/etsy-seller-calculator"):
        pg.goto(f"{BASE}{route}", wait_until="load"); pg.wait_for_timeout(500)
    check(violations == [],
          "No page violates its own CSP"
          + ("" if violations == [] else f" — {violations[:2]}"))

    # Every script tag must carry the nonce.
    #
    # The CSP check above catches the SYMPTOM — a page the browser refuses to
    # run properly. This one names the CAUSE, and it is the check to read first
    # when someone flips the build back to Turbopack: Next 16.3.1's Turbopack
    # build leaves exactly one tag un-nonced, and under 'strict-dynamic' that is
    # a page silently missing part of its JavaScript.
    #
    # It counts tags in the SERVED HTML rather than trusting the source, because
    # which chunk a component lands in is the bundler's decision and nothing in
    # our code says it.
    unnonced = {}
    for route in ("/dashboard", "/billing", "/shop-pulse", "/settings/shops",
                  "/tools/etsy-seller-calculator"):
        pg.goto(f"{BASE}{route}", wait_until="load")
        bad = pg.evaluate("""() => [...document.querySelectorAll('script[src]')]
          .filter(s => s.src.includes('/_next/') && !s.nonce)
          .map(s => s.src.split('/').pop())""")
        if bad:
            unnonced[route] = bad
    check(unnonced == {},
          "Every script tag the app serves carries the CSP nonce"
          + ("" if unnonced == {} else f" — {unnonced}"))

    # --- Accessibility, in BOTH themes -------------------------------------
    #
    # axe-core, run over real pages, in light and dark. Dark is not a courtesy
    # pass: every finding of the serious class here was dark-only or
    # dark-mostly, and none of them was visible in the source.
    #
    # What the first run found, on a product that looked finished:
    #
    #   222 colour-contrast nodes across 10 pages. The largest group was a
    #   foreground token that flips with the theme painted on a background
    #   literal that does not — var(--danger) on #FEF2F2 reads 7.6:1 in light
    #   and 2.5:1 in dark. Each half looked reasonable in the source. Only the
    #   pairing was wrong, and only in one theme.
    #
    #    40 region nodes. The skip link and the demo banner sat above every
    #   landmark, so a screen-reader user navigating by landmark could reach
    #   neither — including the notice saying nothing here can reach Etsy.
    #
    #     2 heading-order nodes. The billing page went h1 -> h3, which reads as
    #   a subsection of something that does not exist.
    #
    # axe is injected through evaluate() rather than add_script_tag, because
    # the CSP refuses an un-nonced inline script — correctly. Playwright's
    # evaluate runs through CDP, which is not subject to the page's policy.
    #
    # A tab is a state, not a page — and the states are DISCOVERED, not listed.
    #
    # Two rounds of getting this wrong are why it works this way.
    #
    # Round one audited each route as it loads. A deliberate break proved it
    # hollow: the original contrast bug was put back verbatim in the
    # Transactions table's UNMATCHED pill and the check PASSED, because that
    # pill lives behind a tab nobody had clicked.
    #
    # Round two hard-coded two /profit tabs. That is the same hole, smaller: a
    # survey found 17 hidden-state controls across the app — three tabs on
    # /dashboard, four on /profit, three on /action-center, and expandable
    # panels on four more routes. Naming two of them covered 2 of 17, and
    # covered nothing anyone adds tomorrow.
    #
    # So this walks the page and finds them: every [role=tab], every
    # [aria-expanded=false]. A tab added next month is audited the day it
    # ships, without anyone remembering this file exists.
    axe_source = open("node_modules/axe-core/axe.min.js").read()

    # Routes are DISCOVERED, not listed.
    #
    # This was a hand-written tuple, and it went stale the moment a screen
    # shipped: four new settings pages were reachable from the settings rail and
    # audited by nothing, because nobody remembered to add them here. It is the
    # same defect as the hidden-state survey two paragraphs up — an audit whose
    # scope is typed out covers what somebody remembered, not what a seller can
    # reach.
    #
    # Both rails are read: the main sidebar, and the settings rail, which is only
    # rendered on a settings page. The seeds below are unions, not the answer.
    SEEDS = ("/dashboard", "/settings/shops", "/tools")
    # Reachable but not linked from any nav — the OAuth landing and the public
    # calculator. Discovery cannot find these, so they stay named.
    UNLINKED = ("/onboarding", "/tools/etsy-seller-calculator")

    def discover_routes():
        found = set(UNLINKED)
        for seed in SEEDS:
            pg.goto(f"{BASE}{seed}", wait_until="load")
            hrefs = pg.eval_on_selector_all(
                "nav a[href^='/']",
                "els => els.map(e => e.getAttribute('href'))",
            )
            for href in hrefs:
                if not href or href.startswith("/api"):
                    continue
                found.add(href.split("?")[0].split("#")[0].rstrip("/") or "/")
        return tuple(sorted(found))

    AUDIT_ROUTES = discover_routes()
    # A discovery that finds nothing passes everything. Same vacuous-pass shape
    # as D51a and D53b.
    check(len(AUDIT_ROUTES) >= 20,
          f"route discovery found only {len(AUDIT_ROUTES)} routes")
    for must in ("/settings/audit-log", "/settings/costs", "/settings/profile",
                 "/settings/security"):
        check(must in AUDIT_ROUTES, f"route discovery missed {must}")

    def audit_here(where, sink):
        pg.evaluate(axe_source)
        report = pg.evaluate("""async () => await axe.run(document, {
          resultTypes: ['violations'],
          runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa']}
        })""")
        for v in report["violations"]:
            sink.setdefault(v["id"], []).append(f"{where}({len(v['nodes'])})")

    # --- No hover style dims text -------------------------------------------
    #
    # `hover:opacity-80` on the provenance button faded the whole badge,
    # including its label. The Demo chip is 10px muted-1 on canvas-soft: 5.6:1
    # at rest, 3.66:1 once something multiplies it by 0.8. So hovering the
    # control put its own text below AA, in both themes.
    #
    # Every contrast sweep missed it for eleven phases, because a sweep audits
    # a page nobody is touching. It surfaced only when the mouse happened to be
    # resting on one of these after a click on the previous route - found by
    # accident, which is not a strategy.
    #
    # Reading the stylesheets is the deterministic version of that accident.
    # Tailwind emits a rule only for a class something actually uses, so this
    # sees exactly the hover styles that exist, and will see the next one too.
    pg.goto(f"{BASE}/dashboard", wait_until="load")
    hover_rules = pg.evaluate(r"""() => {
      const dimming = [], seen = [];
      const walk = (list) => {
        for (const rule of list) {
          // CSS Nesting gives every CSSStyleRule a cssRules list, empty or
          // not, so `if (rule.cssRules) continue` skipped every style rule in
          // the sheet and the check reported nothing. It reported nothing
          // with the defect still in place, which is the only reason this was
          // caught: the deliberate break did not fail.
          if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules);
          const selector = rule.selectorText;
          if (!selector || !selector.includes(":hover")) continue;
          seen.push(selector);
          const op = rule.style && rule.style.getPropertyValue("opacity");
          if (op && parseFloat(op) < 1) dimming.push(selector + " {opacity:" + op + "}");
        }
      };
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules } catch { continue }
        walk(rules);
      }
      return { dimming, seen: seen.length };
    }""")
    dimming = hover_rules["dimming"]
    # The floor. A walk that finds no hover rules at all cannot find a bad one,
    # and would pass forever.
    check(hover_rules["seen"] >= 5,
          f"The hover sweep found {hover_rules['seen']} hover rules to inspect")
    check(dimming == [],
          "No hover style dims an element, which would dim its text with it"
          + ("" if dimming == [] else f" - {dimming[:3]}"))

    a11y, audited = {}, 0
    # Per (theme, route): how many hidden states the DOM offered, and how many
    # were actually audited. Comparing those two is what makes the sweep
    # self-checking; a fixed expected number would just be another thing to
    # remember to update.
    offered, reached = 0, 0
    routes_with_states = set()
    for theme in ("light", "dark"):
        for route in AUDIT_ROUTES:
            pg.goto(f"{BASE}{route}", wait_until="load")
            # The mouse stays where the last click left it, and a navigation
            # does not move it - so "base state" was whatever the pointer
            # happened to be hovering on the new page. That is how the
            # provenance button's dimmed hover was found, and equally how it
            # could have gone on being missed. Park the pointer so this line
            # audits the state it claims to.
            pg.mouse.move(0, 0)
            pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
            pg.wait_for_timeout(200)
            audit_here(f"{theme}:{route}", a11y); audited += 1

            # Every tab, by name, re-read after each click because the DOM moves.
            names = pg.evaluate(
                "() => [...document.querySelectorAll('[role=tab]')].map(e => e.textContent.trim())")
            offered += len(names)
            if names:
                routes_with_states.add(route)
            for name in names:
                try:
                    pg.get_by_role("tab", name=name, exact=True).first.click(timeout=4000)
                except Exception:
                    # Recorded, never swallowed: a tab that cannot be opened is
                    # a surface that went unaudited, which is the whole failure
                    # this check exists to stop repeating.
                    a11y.setdefault("tab-would-not-open", []).append(f"{theme}:{route}#{name}")
                    continue
                pg.wait_for_timeout(350)
                audit_here(f"{theme}:{route}#{name}", a11y); audited += 1; reached += 1

            # Every collapsed disclosure.
            pg.goto(f"{BASE}{route}", wait_until="load")
            pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
            pg.wait_for_timeout(200)
            # VISIBLE disclosures only.
            #
            # The mobile top bar's hamburger carries aria-expanded and sits in
            # the DOM on every page, hidden by `lg:hidden` at this viewport. The
            # sweep found it on all fifteen routes, could not click it, and
            # correctly refused to call that coverage — 20 of 64 states reached.
            #
            # A control the viewport hides is not a state a user can reach here,
            # so it is not a surface to audit. Auditing what is merely PRESENT
            # rather than what is REACHABLE would have meant clicking a control
            # nobody can see and reporting the result as a checked state.
            count = pg.evaluate("""() => [...document.querySelectorAll('[aria-expanded="false"]')]
              .filter(e => e.offsetWidth || e.offsetHeight || e.getClientRects().length).length""")
            offered += count
            if count:
                routes_with_states.add(route)
            for i in range(count):
                try:
                    pg.locator('[aria-expanded="false"]:visible').first.click(timeout=4000)
                except Exception:
                    # Not swallowed. An unopenable disclosure is an unaudited
                    # surface, and `reached` will not match `offered` below.
                    a11y.setdefault("disclosure-would-not-open", []).append(
                        f"{theme}:{route}#{i}")
                    break
                pg.wait_for_timeout(250)
                audit_here(f"{theme}:{route}#disclosure{i}", a11y); audited += 1; reached += 1
                # Close it before opening the next.
                #
                # The dashboard has four provenance buttons; the panel the first
                # one opens covers the second, so the next click timed out and
                # three of four states went unaudited on that route. The sweep
                # reported 28 of 34 states reached, which is exactly what the
                # offered-vs-reached guard exists to say out loud.
                pg.keyboard.press("Escape")
                pg.wait_for_timeout(150)
                still_open = pg.locator('[aria-expanded="true"]:visible')
                if still_open.count():
                    try:
                        still_open.first.click(timeout=2000)
                        pg.wait_for_timeout(150)
                    except Exception:
                        pass

    check(a11y == {},
          f"No WCAG A/AA violation on any of {audited} audited surfaces, in either theme"
          + ("" if a11y == {} else f" — {dict(list(a11y.items())[:3])}"))

    # --- ...and at the viewports a phone and a tablet actually use ----------
    #
    # The sweep above runs at 1440x1000. That was a blind spot of exactly the
    # same shape as auditing only the tab that opens by default: several WCAG
    # rules are geometric, so they can only fail at a width where the geometry
    # is different. Running the same pages at 390 and 768 found, immediately:
    #
    #   scrollable-region-focusable  Four containers that scroll horizontally
    #                                and could not be reached from a keyboard
    #                                at all. A mouse drags them; a keyboard had
    #                                no way in.
    #   target-size                  A <Link> wrapping a whole card was inline,
    #                                so its hit box was a thin line box rather
    #                                than the card — the clickable area was a
    #                                fraction of what it looked like. Plus jump
    #                                links and nav chips under 24px.
    #
    # State expansion is deliberately NOT repeated here. It would cube the run
    # (surfaces x states x themes x viewports) for rules that are about
    # geometry, and geometry does not change when a tab opens. Saying so
    # matters: tab states at mobile width are not covered by this line.
    VIEWPORTS = (("mobile", 390, 844), ("tablet", 768, 1024))
    responsive = {}
    for label, width, height in VIEWPORTS:
        pg.set_viewport_size({"width": width, "height": height})
        for route in AUDIT_ROUTES:
            pg.goto(f"{BASE}{route}", wait_until="load"); pg.wait_for_timeout(220)
            audit_here(f"{label}:{route}", responsive)
    pg.set_viewport_size({"width": 1440, "height": 1000})
    check(responsive == {},
          "No WCAG A/AA violation at mobile or tablet width"
          + ("" if responsive == {} else f" — {dict(list(responsive.items())[:3])}"))

    # --- WCAG 2.2 target-size, enforced as the criterion, not as the tool ---
    #
    # SC 2.5.8 is met EITHER by a target being at least 24x24 CSS px OR by
    # spacing. axe reports both routes through one `target-size` rule and words
    # the spacing failure as "partially obscured", which reads like something is
    # covering the control. Measured: nothing is. On /action-center the flagged
    # buttons are 86x36 and on /onboarding the flagged link is a 358px card —
    # all well past the 24x24 minimum, so the criterion is met by size and axe
    # is reporting the spacing alternative it did not need.
    #
    # So this asserts the criterion directly: every target axe flags must be at
    # least 24x24 in reality. That keeps the guarantee — a genuinely undersized
    # control still fails — without an allow-list, which would have to be
    # maintained and would hide the next real one.
    undersized = []
    for label, width, height in VIEWPORTS + (("desktop", 1440, 1000),):
        pg.set_viewport_size({"width": width, "height": height})
        for route in AUDIT_ROUTES:
            pg.goto(f"{BASE}{route}", wait_until="load"); pg.wait_for_timeout(200)
            pg.evaluate(axe_source)
            report = pg.evaluate("""async () => {
              const r = await axe.run(document, {resultTypes:['violations'],
                runOnly:{type:'rule', values:['target-size']}});
              const out = [];
              for (const v of r.violations) for (const n of v.nodes) {
                const el = document.querySelector(n.target[0]);
                if (!el) continue;
                const box = el.getBoundingClientRect();
                if (box.width < 24 || box.height < 24) {
                  out.push(`${n.target[0]} ${Math.round(box.width)}x${Math.round(box.height)}`);
                }
              }
              return out;
            }""")
            for item in report:
                undersized.append(f"{label}:{route} {item}")
    pg.set_viewport_size({"width": 1440, "height": 1000})
    check(undersized == [],
          "Every tap target is at least 24x24 (WCAG 2.2 SC 2.5.8)"
          + ("" if undersized == [] else f" — {undersized[:3]}"))

    # --- Performance budget -------------------------------------------------
    #
    # Measured first, then bounded. The numbers this was written against, on a
    # 4-core container:
    #
    #   JS transfer   143 kB compressed per route (472 kB decoded), and the two
    #                 large chunks are Next's own runtime — the app's client
    #                 code is roughly 20 kB.
    #   CSS            28 kB
    #   LCP           132 ms median, 320 ms worst
    #   CLS           0.000 on every route
    #   TTFB           20-34 ms median sequential
    #
    # Bytes and CLS get tight bounds because they are deterministic: the same
    # build produces the same numbers on any machine. Timing gets a loose one
    # because it is not — a shared runner can be several times slower without
    # anything being wrong, and a flaky budget gets raised until it means
    # nothing. The LCP bound is the "good" threshold from Core Web Vitals, so
    # crossing it is a real statement rather than a local hiccup.
    #
    # What this is really guarding: D51 removed a render-blocking third-party
    # font that cost 12.6 SECONDS on every page load and hid behind a note
    # calling it cosmetic. A budget is how that stops being a thing someone has
    # to remember.
    BUDGET_JS_KB = 250        # measured 143
    BUDGET_CSS_KB = 60        # measured 28
    BUDGET_CLS = 0.05         # measured 0.000
    BUDGET_LCP_MS = 2500      # measured 320 worst; this is the Web Vitals bound

    over = []
    for route in ("/dashboard", "/profit", "/listings/audit", "/billing",
                  "/tools/etsy-seller-calculator"):
        pg.goto(f"{BASE}{route}", wait_until="load")
        pg.wait_for_timeout(600)
        m = pg.evaluate("""() => new Promise(done => {
          const out = {lcp: 0, cls: 0, js: 0, css: 0};
          try {
            new PerformanceObserver(l => { for (const e of l.getEntries()) out.lcp = e.startTime; })
              .observe({type: 'largest-contentful-paint', buffered: true});
            new PerformanceObserver(l => {
              for (const e of l.getEntries()) if (!e.hadRecentInput) out.cls += e.value;
            }).observe({type: 'layout-shift', buffered: true});
          } catch (e) {}
          setTimeout(() => {
            for (const r of performance.getEntriesByType('resource')) {
              // encodedBodySize is what crosses the wire. decodedBodySize would
              // measure the file, not the download.
              if (r.name.endsWith('.js')) out.js += r.encodedBodySize;
              if (r.name.endsWith('.css')) out.css += r.encodedBodySize;
            }
            done(out);
          }, 400);
        })""")
        js_kb, css_kb = m["js"] / 1024, m["css"] / 1024
        if js_kb > BUDGET_JS_KB: over.append(f"{route} JS {js_kb:.0f}kB")
        if css_kb > BUDGET_CSS_KB: over.append(f"{route} CSS {css_kb:.0f}kB")
        if m["cls"] > BUDGET_CLS: over.append(f"{route} CLS {m['cls']:.3f}")
        if m["lcp"] > BUDGET_LCP_MS: over.append(f"{route} LCP {m['lcp']:.0f}ms")
    check(over == [],
          f"Every page is inside the performance budget "
          f"(JS<={BUDGET_JS_KB}kB, CSS<={BUDGET_CSS_KB}kB, CLS<={BUDGET_CLS}, LCP<={BUDGET_LCP_MS}ms)"
          + ("" if over == [] else f" — {over}"))


    # The sweep must have opened every state it found.
    #
    # Compared against what the DOM OFFERED, not against a number written here.
    # A hard-coded expectation is one more thing to update, and when it drifts
    # the honest-looking move is to lower it. This cannot drift: if the tab
    # selector stops matching, `offered` falls to zero and the next check below
    # catches that instead.
    check(reached == offered,
          f"Every hidden state the page offered was opened and audited "
          f"({reached}/{offered})")
    # ...and it must have found some. Otherwise a selector that matches nothing
    # satisfies the line above perfectly: 0 == 0.
    #
    # The floor is on BREADTH — how many routes hide something — rather than on
    # a total, because a total moves whenever a card is added, and the
    # honest-looking response to a number that keeps drifting is to lower it.
    # Six routes hide state today; five only trips if discovery genuinely breaks.

    # --- No stack trace and no secret reaches a user ------------------------
    #
    # /api/leakprobe throws a string containing a credential shape AND a source
    # path, on purpose, so this is exercised rather than reasoned about.
    #
    # Two things measured before any of this was written. Next in production
    # already strips error detail, so nothing leaked to the browser — but an
    # unhandled throw in a route handler returned 500 with an EMPTY body and no
    # content-type, so a caller doing `.json()` got a parse error on top of the
    # original failure. The extension is exactly such a caller.
    probe = pg.request.get(f"{BASE}/api/leakprobe")
    body = probe.text()
    check(probe.status == 500, f"An unhandled route error is a 500 (was {probe.status})")
    check("application/json" in (probe.headers.get("content-type") or ""),
          "An unhandled route error still answers in JSON, not an empty body")

    for secret in ("LEAKCANARY", "sk_live", "lib/etsy/tokens", "at Object.", ".ts:42"):
        check(secret not in body, f"No response body carries {secret!r}")

    try:
        payload = json.loads(body).get("error", {})
    except Exception:
        payload = {}
    check(bool(payload.get("message")), "The error body says what happened")
    check(bool(payload.get("recovery")), "The error body says what to do next")
    check(bool(payload.get("reference")), "The error body carries a quotable reference")
    # The envelope may only ever contain the user-facing shape. A `context` or a
    # `stack` here is a leak whether or not this particular error had one in it.
    check(set(payload) <= {"kind", "message", "recovery", "retryable", "reference"},
          f"The error body carries nothing but the user-facing shape (got {sorted(payload)})")

    # --- CSRF and rate limiting --------------------------------------------
    #
    # Both were findings, both verified as real attacks before being fixed.
    #
    # CSRF: a POST to /api/billing/cancel carrying `Origin: https://evil.example`
    # returned 303 — a successful cancellation from any website. It was not
    # exploitable only because demo mode reads no auth cookie, which is not a
    # defence, it is a coincidence of the current auth state.
    origin_attack = pg.request.post(f"{BASE}/api/billing/cancel",
                                    headers={"Origin": "https://evil.example"},
                                    fail_on_status_code=False)
    check(origin_attack.status == 403,
          f"A cross-origin POST is refused (got {origin_attack.status})")

    # The prefix case a startsWith() check would let through: this app's own
    # origin is a prefix of an attacker's subdomain.
    prefix_attack = pg.request.post(f"{BASE}/api/billing/cancel",
                                    headers={"Origin": f"{BASE}.evil.example"},
                                    fail_on_status_code=False)
    check(prefix_attack.status == 403,
          f"An origin that merely STARTS with ours is refused (got {prefix_attack.status})")

    # ...and the fix must not have broken the real thing. Immediately resumed,
    # because these checks share a shop with the billing flow checks above.
    same_origin = pg.request.post(f"{BASE}/api/billing/cancel",
                                  headers={"Origin": BASE}, fail_on_status_code=False)
    check(same_origin.status in (200, 303),
          f"A same-origin POST still works (got {same_origin.status})")
    pg.request.post(f"{BASE}/api/billing/resume", headers={"Origin": BASE},
                    fail_on_status_code=False)

    # Stripe calls the webhook from its own servers with no Origin, and proves
    # itself with an HMAC instead. A 403 here would mean payments stop.
    hook = pg.request.post(f"{BASE}/api/billing/webhook", data="{}", fail_on_status_code=False)
    check(hook.status != 403,
          f"The signature-verified webhook is not blocked by the origin check (got {hook.status})")

    # Rate limiting: /api/export runs the whole profit or audit domain per call,
    # against a server that renders ~33 pages a second.
    codes = []
    for _ in range(13):
        r = pg.request.get(f"{BASE}/api/export/transactions",
                           headers={"X-Forwarded-For": "203.0.113.201"},
                           fail_on_status_code=False)
        codes.append(r.status)
    check(429 in codes, f"A request loop against the expensive route is shed (saw {sorted(set(codes))})")
    check(codes[0] == 200, "...but the first requests are served normally")

    # A limiter that locks a seller out of their own shop has done more harm
    # than the loop it was shedding.
    other = pg.request.get(f"{BASE}/api/export/transactions",
                           headers={"X-Forwarded-For": "203.0.113.202"},
                           fail_on_status_code=False)
    check(other.status == 200, f"One caller's limit does not affect another (got {other.status})")
    page = pg.request.get(f"{BASE}/billing", headers={"X-Forwarded-For": "203.0.113.201"},
                          fail_on_status_code=False)
    check(page.status == 200, f"Pages are never rate limited (got {page.status})")

    # --- The mobile shell ---------------------------------------------------
    #
    # A separate 56px bar below `lg`, per Foundations "Mobile shell · 390 × 844"
    # — hamburger, shop chip, notifications — with the full navigation behind a
    # drawer. The bottom tab bar carries five destinations; the drawer is how
    # the other twenty are reached at all on a phone.
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.goto(f"{BASE}/dashboard", wait_until="load"); pg.wait_for_timeout(400)

    headers = pg.evaluate("""() => [...document.querySelectorAll('header')]
      .map(h => !!(h.offsetWidth || h.offsetHeight || h.getClientRects().length))""")
    # Exactly one. Two visible <header>s would be two banner landmarks, which is
    # its own violation — the fix for a missing landmark must not be another
    # landmark in the wrong place (D53).
    check(headers.count(True) == 1, f"Exactly one top bar is visible on mobile (got {headers})")

    bar = pg.evaluate("""() => {
      const h = [...document.querySelectorAll('header')].find(x => x.offsetHeight);
      const btn = [...document.querySelectorAll('button')]
        .find(b => (b.textContent || '').includes('Open navigation'));
      const r = btn ? btn.getBoundingClientRect() : null;
      return {height: h ? Math.round(h.getBoundingClientRect().height) : 0,
              tap: r ? [Math.round(r.width), Math.round(r.height)] : null};
    }""")
    check(bar["height"] == 56, f"The mobile bar is the designed 56px (got {bar['height']})")
    check(bar["tap"] == [44, 44], f"Its controls are the designed 44x44 (got {bar['tap']})")

    opened = open_tab  # noqa: F841  (kept for symmetry with the tab helper above)
    pg.get_by_role("button", name="Open navigation").click()
    pg.wait_for_timeout(400)
    check(pg.locator("#mobile-nav").count() == 1, "The drawer opens")
    rows = pg.evaluate("() => document.querySelectorAll('#mobile-nav li').length")
    check(rows > 15, f"The drawer carries the whole navigation, not the five tabs (got {rows})")
    short = pg.evaluate("""() => [...document.querySelectorAll('#mobile-nav li > *')]
      .filter(e => e.getBoundingClientRect().height < 44).length""")
    check(short == 0, f"Every drawer row is at least 44px tall (got {short} shorter)")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    # A drawer that only a pointer can dismiss is one a keyboard user is stuck in.
    check(pg.locator("#mobile-nav").count() == 0, "Escape closes the drawer")

    # --- One count, not three -----------------------------------------------
    #
    # navigation.ts used to carry literal badges: Action Center '2', beside a
    # bell reporting the real 5. The same product answering one question two
    # ways, on one screen. Counts are measured now and this asserts they agree.
    pg.goto(f"{BASE}/dashboard", wait_until="load"); pg.wait_for_timeout(400)
    bell_label = pg.evaluate(
        "() => document.querySelector(\"header a[href='/action-center']\")?.innerText || ''")
    pg.get_by_role("button", name="Open navigation").click(); pg.wait_for_timeout(400)
    drawer_row = pg.evaluate("""() => {
      const a = document.querySelector("#mobile-nav a[href='/action-center']");
      return a ? a.innerText.replace(/\s+/g, ' ').trim() : '';
    }""")
    pg.keyboard.press("Escape")
    pg.set_viewport_size({"width": 1440, "height": 1000})
    pg.goto(f"{BASE}/dashboard", wait_until="load"); pg.wait_for_timeout(400)
    sidebar_row = pg.evaluate("""() => {
      const a = document.querySelector("nav[aria-label='Main'] a[href='/action-center']");
      return a ? a.innerText.replace(/\s+/g, ' ').trim() : '';
    }""")
    numbers = {re.sub(r"\D", "", t) for t in (bell_label, drawer_row, sidebar_row) if re.search(r"\d", t)}
    check(len(numbers) == 1,
          f"The bell, the drawer and the sidebar report one count "
          f"(bell={bell_label!r} drawer={drawer_row!r} sidebar={sidebar_row!r})")

    # --- The free tools -----------------------------------------------------
    #
    # Three of the six. Each check asserts the thing the tool exists to correct,
    # not that a page renders.
    pg.goto(f"{BASE}/tools/fee-calculator", wait_until="load"); pg.wait_for_timeout(600)
    fees = pg.locator("main").inner_text()
    # The mistake the tool is for: sellers apply the transaction fee to the item
    # price and come out low, because Etsy charges on price PLUS shipping. The
    # only way to surface that is to print the basis with the real number in it.
    check("6.5% of $29.50" in fees,
          "The fee calculator shows the transaction fee's real basis, not just the rate")
    check("$24.50" not in fees.split("Transaction fee")[1][:60],
          "...which is the price plus shipping, not the price")
    check("not attributed to an Etsy ad" in fees,
          "An uncharged fee is shown at zero WITH its reason, not omitted")
    check("recorded" in fees and "differ by country" in fees,
          "The rate set is dated and says it can be wrong for you")

    pg.goto(f"{BASE}/tools/ads-roi", wait_until="load"); pg.wait_for_timeout(600)
    ads = pg.locator("main").inner_text()
    # The whole point: 4x ROAS reads as a triumph and loses money at a 20%
    # margin. The money figure must lead, and it must be negative here.
    check("4.00×" in ads, "The ads tool reports the ROAS")
    check("−$20.00" in ads, "...and that a 4x ROAS is losing $20 at this margin")
    check(ads.index("Money kept after ad spend") < ads.index("Return on ad spend"),
          "Money kept is shown BEFORE the ratio that flatters")
    check("party selling the advertising" in ads,
          "Attribution is named as Etsy's claim, not a measurement")

    pg.goto(f"{BASE}/tools/profit-calculator", wait_until="load"); pg.wait_for_timeout(600)
    profit = pg.locator("main").inner_text()
    # Labour is a line with a rate in it. Omitting it is how a handmade seller
    # concludes a product is profitable while paying themselves nothing.
    check("25 min at $20.00/hr" in profit, "The profit calculator costs the seller's time as a line")
    check("Break-even price" in profit, "It says the price below which each sale costs money")
    check("charge $5.00" in profit and "pay $6.40" in profit,
          "It distinguishes postage charged from postage paid")

    # The hub says WHY each remaining tool is unbuilt, per tool.
    pg.goto(f"{BASE}/tools", wait_until="load"); pg.wait_for_timeout(400)
    hub = pg.locator("main").inner_text()
    check("Needs a trademark register" in hub,
          "The hub says why trademark screening is not built, rather than 'coming soon'")
    check(hub.count("Open →") >= 4, f"Four tools are open-able from the hub")

    check(len(routes_with_states) >= 5,
          f"The sweep still finds hidden state across the app "
          f"({offered} states on {len(routes_with_states)} routes: "
          f"{sorted(routes_with_states)})")

    # The theme toggle must actually reach the tokens.
    #
    # Asserting on a rendered COLOUR, not on the attribute: setting data-theme
    # and reading it back would pass even if every dark value were missing.
    pg.goto(f"{BASE}/dashboard", wait_until="load")
    shades = {}
    for theme in ("light", "dark"):
        pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
        pg.wait_for_timeout(150)
        shades[theme] = pg.evaluate(
            "() => getComputedStyle(document.body).backgroundColor")
    check(shades["light"] != shades["dark"],
          f"The theme toggle repaints the page ({shades['light']} vs {shades['dark']})")

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

    # --- Phase 11: the connect screen, and every OAuth outcome ---
    pg.goto(f"{BASE}/settings/shops", wait_until="domcontentloaded")
    pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(400)
    shops = pg.locator("main").inner_text()
    check("Connect a shop" in shops, "The connect screen offers a real connection")
    check("etsy.com" in shops, "The screen says the password is typed on Etsy, not here")
    # Scoped to main: the page's own promise never to ask for a password is not
    # evidence that it does not ask for one.
    check(pg.locator("main input[type=password]").count() == 0,
          "There is no password field anywhere on the connect screen")

    # The link must carry the scope keys and nothing else.
    href = pg.get_by_role("link", name="Connect a shop").get_attribute("href")
    check(href.startswith("/api/etsy/connect?scopes="),
          "Connecting starts a server-side flow, not a client-side one")
    check("key" not in href and "token" not in href and "secret" not in href,
          "The connect link carries no credential")
    check("inventory" not in href,
          "The connect link asks for no optional permission nobody chose")

    # Each outcome renders its own copy. A URL a seller could edit by hand is
    # not a way to make the page say something it does not mean.
    for outcome, marker in [
        ("cancelled", "Connection cancelled"),
        ("expired", "expired"),
        ("state_mismatch", "could not be verified"),
        ("exchange_failed", "did not complete"),
        ("no_shop", "has no shop"),
        ("not_configured", "No Etsy app is configured"),
    ]:
        pg.goto(f"{BASE}/settings/shops?connect={outcome}", wait_until="domcontentloaded")
        pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(300)
        body = pg.locator("main").inner_text()
        check(marker in body, f"?connect={outcome} tells the seller what happened")
        if outcome not in ("not_configured",):
            # Case-insensitive: "so nothing was connected" mid-sentence is the
            # same promise as "Nothing was connected." at the start of one, and
            # a check that forces one phrasing makes the copy worse.
            check("nothing was connected" in body.lower(),
                  f"?connect={outcome} says nothing was connected")

    pg.goto(f"{BASE}/settings/shops?connect=made_up", wait_until="domcontentloaded")
    pg.wait_for_selector("main", timeout=15000); pg.wait_for_timeout(300)
    made_up = pg.locator("main").inner_text()
    check("made_up" not in made_up, "An invented outcome in the URL renders nothing")

    # --- Phase 11: the routes refuse cleanly with no Etsy app configured ---
    resp = pg.request.get(f"{BASE}/api/etsy/connect?scopes=read", max_redirects=0)
    check(resp.status in (303, 307),
          "Connecting with no key configured redirects rather than erroring")
    location = resp.headers.get("location", "")
    check("connect=not_configured" in location,
          "It says the server has no Etsy app, not that something broke")
    check("etsy.com" not in location,
          "It does not send the seller to Etsy with a key it does not have")

    cb = pg.request.get(f"{BASE}/api/etsy/callback?code=abc&state=xyz", max_redirects=0)
    check(cb.status in (303, 307), "A callback with no flow cookie redirects")
    check("connect=expired" in cb.headers.get("location", ""),
          "A callback with no verifier is reported as expired, not as a failure")
    body = cb.text()
    check("verifier" not in body and "Error" not in body and "at " not in body,
          "No stack trace or credential reaches the response body")

    b.close()

print("\n".join(notes))
if fails:
    print("\n".join(fails)); sys.exit(1)
print(f"\nALL {len(notes)} CHECKS PASSED")
