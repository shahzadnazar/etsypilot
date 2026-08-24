"""What the development server shows that the production build does not.

Run against `next dev`, deliberately:

    npx next dev -p 3000 &
    python3 tests/browser/dev-server.py

D63 is why this file exists. Every other browser check in this project runs
against a production build, and the CSP once broke `next dev` completely —
34 violations, an unstyled page — with every one of those checks green.

This one covers the second dev-only defect: Next's own overlay, which renders
only under `next dev`, defaults to the top-left, and sat directly over the demo
banner, the logo and the first sidebar group.

Is anything from Next's dev overlay actually PAINTED?

The first version of this check asked two questions that cannot answer that:

  - "is there a <nextjs-portal>?"  It is always mounted; it hosts the error
    overlay too. Its presence says nothing about the indicator.
  - "does any shadow root's textContent mention Turbopack?"  textContent
    includes hidden and inert nodes, and the devtools bundle carries the string
    whether or not it renders.

Both reported a failure against a screenshot that plainly showed the overlay
gone. A check that fires when the thing it measures is absent is as broken as
one that passes when it is present.

So this asks the only question that matters: does any element inside the portal
have a visible box in the viewport?
"""
import os, sys
from playwright.sync_api import sync_playwright

CHROME = os.environ.get("CHROME_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
BASE = os.environ.get("DEV_BASE_URL", "http://localhost:3000")
fails = []

PAINTED = """() => {
  const portal = document.querySelector('nextjs-portal')
  if (!portal || !portal.shadowRoot) return []
  const out = []
  for (const el of portal.shadowRoot.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.height < 8) continue
    const s = getComputedStyle(el)
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) continue
    out.push(`${el.tagName.toLowerCase()} ${Math.round(r.width)}x${Math.round(r.height)} at ${Math.round(r.x)},${Math.round(r.y)}`)
  }
  return out.slice(0, 5)
}"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    for route in ("/settings/shops", "/dashboard", "/billing", "/listings"):
        pg.goto(f"{BASE}{route}", wait_until="load")
        pg.wait_for_timeout(2500)
        painted = pg.evaluate(PAINTED)
        print(f"{route}: painted overlay elements = {painted or 'none'}")
        if painted:
            fails.append(f"{route}: {painted}")
    b.close()

print()
if fails:
    for f in fails: print("FAIL", f)
    sys.exit(1)
print("PASS Next's dev overlay paints nothing on any route checked")
