"""
Rendered-output checks for the extension popup.

Kept, and separate from rendered-output.py because it needs a built extension
and a different harness: the popup is a page in a package, not a route in the
app.

It serves the packaged directory over http (ES modules cannot load from file://)
and stubs `chrome.tabs`, the only browser API the popup uses. The checks run on
the artefact the build produced rather than on the source — the same distinction
the packaging audit draws.

The API call is routed through Playwright rather than made directly, because a
browser will not send a cross-origin request from http://localhost to the app
without CORS headers, and the app deliberately grants those only to an
allow-listed chrome-extension:// origin. Faking an http origin into that
allow-list to make a test pass would be weakening the thing under test. The CORS
policy is checked where it belongs — against the route, by origin — in
tests/unit and by the curl checks in the phase report.

Run against a production build of the app:

    npx next build && npx next start -p 3111 &
    EXTENSION_APP_URL=http://localhost:3111 node extension/build.mjs
    python3 tests/browser/extension-popup.py
"""

import functools
import http.server
import os
import pathlib
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
PACKAGE = ROOT / "extension" / "build" / "chrome"
CHROME = os.environ.get("CHROME_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
APP = os.environ.get("BASE_URL", "http://localhost:3111")
OWN_LISTING = os.environ.get("OWN_LISTING", "1400001001")

fails, notes = [], []


def check(cond, msg):
    (notes if cond else fails).append(("PASS " if cond else "FAIL ") + msg)


def stub_tabs(listing_id):
    """Stand in for chrome.tabs. The popup uses nothing else."""
    return (
        "window.chrome = { tabs: {"
        "  query: async () => [{ id: 1, url: 'https://www.etsy.com/listing/%s/x' }],"
        "  sendMessage: async () => ({ listingId: %s }),"
        "  create: async () => {},"
        "} };" % (listing_id or "0", f"'{listing_id}'" if listing_id else "null")
    )


def serve(directory):
    """Serve the built package so ES modules load. file:// blocks them."""
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}"


def open_popup(context, base, listing_id):
    page = context.new_page()
    page.add_init_script(stub_tabs(listing_id))

    def relay(route, request):
        # Playwright makes the request, so the browser's CORS check does not
        # apply to the fetch itself — exactly as it would not for a real
        # extension origin on the app's allow-list.
        #
        # The reply still has to satisfy the CREDENTIALED rules, because the
        # client sends `credentials: 'include'`: a wildcard origin is rejected,
        # so the exact origin and allow-credentials are echoed. That the
        # browser insisted on this is the protection working, not an obstacle.
        response = context.request.get(request.url)
        route.fulfill(
            status=response.status,
            body=response.body(),
            headers={
                "content-type": "application/json",
                "access-control-allow-origin": base,
                "access-control-allow-credentials": "true",
                "vary": "Origin",
            },
        )

    page.route("**/api/extension/listing*", relay)
    page.goto(f"{base}/popup.html")
    page.wait_for_selector("main")
    # The popup fetches on open; wait for the skeleton to be replaced.
    for _ in range(60):
        if "Loading" not in page.locator("main").inner_text():
            break
        page.wait_for_timeout(250)
    return page


def main():
    if not (PACKAGE / "popup.html").exists():
        print("FAIL the extension is not built — run `node extension/build.mjs` first")
        sys.exit(1)

    httpd, base = serve(PACKAGE)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME)
        context = browser.new_context(viewport={"width": 380, "height": 600})

        # --- a listing the seller owns ---
        page = open_popup(context, base, OWN_LISTING)
        own = page.locator("body").inner_text()

        # Labels are uppercased by CSS, so inner_text returns "LISTING HEALTH".
        # Same trap as the billing "YOUR PLAN" chip — compare case-insensitively
        # for anything the stylesheet transforms.
        check("listing health" in own.lower(), "The popup shows listing health for an owned listing")
        check("Verified" in own, "Verified figures carry the Verified badge")
        check("Calculated" in own, "The health score is badged Calculated, not Verified")
        check("Not available" in own, "An unavailable metric says so instead of showing a dash")
        check(
            "Etsy does not expose listing views" in own,
            "The unavailable metric says why, in the popup too",
        )
        check("recommended action" in own.lower(), "A recommendation is drawn from the audit")
        check(
            "cannot edit, publish or deactivate" in own,
            "The popup states its own read-only limit",
        )
        check(
            "No Etsy password, no Etsy API keys" in own,
            "The footer states what the extension does not hold",
        )
        # Nothing on this screen predicts anything.
        check(
            not any(w in own.lower() for w in ["will rank", "expected lift", "predicted", "guarantee"]),
            "The popup never predicts an outcome",
        )
        page.close()

        # --- a page that is not a listing ---
        page = open_popup(context, base, None)
        empty = page.locator("body").inner_text()
        check("No Etsy listing on this page" in empty, "A non-listing page says so plainly")
        check(
            "does nothing on any other site" in empty,
            "The non-listing state states the extension's scope",
        )
        check("Go to Etsy" in empty, "The empty state offers a way forward")
        page.close()

        browser.close()
    httpd.shutdown()

    print("\n".join(notes))
    if fails:
        print("\n".join(fails))
        sys.exit(1)
    print(f"\nALL {len(notes)} POPUP CHECKS PASSED")


main()
