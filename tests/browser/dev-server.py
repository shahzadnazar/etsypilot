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

THE SECOND THING THIS FILE COVERS is the dev console itself. A red line on
every page load is how a real error comes to be missed — it trains whoever is
looking at it to stop looking. This was reported for the theme bootstrap:

  Encountered a script tag while rendering React component.

and could not be reproduced (the investigation is written down in
components/layout/theme-script.tsx). So instead of changing code that could not
be shown to be faulty, the observation became a check: any console error or
warning on a dev page load fails, here, where a dev-only defect belongs.

It is checked together with the two properties the theme script would silently
lose if anyone "fixed" the warning by changing it. Without the NONCE the CSP
refuses the script and the theme flashes with no error anywhere; without the
BEFORE-PAINT timing the flash returns on its own. Both are measured in light
and in dark, because a theme bug that only shows in one is the usual kind.
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


# ───────────────────── a clean console, a nonce, and no flash ──────────────

SAMPLE_THEME = """
  window.__themeAtPaint = [];
  const push = () => window.__themeAtPaint.push(document.documentElement.getAttribute('data-theme'));
  document.addEventListener('readystatechange', push);
  requestAnimationFrame(push);
"""

THEME_SCRIPT_NONCE = """() => {
  const tag = [...document.head.querySelectorAll('script')]
    .find(s => !s.src && s.textContent.includes('etsypilot-theme'))
  if (!tag) return 'ABSENT'
  return tag.getAttribute('nonce') || tag.nonce || 'UNNONCED'
}"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    for theme in ("light", "dark"):
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        ctx.add_init_script(f"try {{ localStorage.setItem('etsypilot-theme', '{theme}') }} catch (e) {{}}")
        ctx.add_init_script(SAMPLE_THEME)
        pg = ctx.new_page()
        noise = []
        pg.on("console", lambda m: noise.append(f"{m.type}: {m.text[:160]}")
              if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: noise.append(f"pageerror: {str(e)[:160]}"))

        for route in ("/login", "/dashboard", "/tools/profit-calculator"):
            noise.clear()
            pg.goto(f"{BASE}{route}", wait_until="load")
            pg.wait_for_timeout(2000)

            print(f"{theme} {route}: console = {noise or 'clean'}")
            if noise:
                fails.append(f"{theme} {route}: console {noise}")

            # The nonce. Without it the CSP refuses the script and the theme
            # flashes with no error anywhere — a silent failure of the one
            # thing the script exists for.
            nonce = pg.evaluate(THEME_SCRIPT_NONCE)
            print(f"{theme} {route}: theme script nonce = {nonce[:12]}")
            if nonce in ("ABSENT", "UNNONCED"):
                fails.append(f"{theme} {route}: theme script nonce {nonce}")

            # Before paint. Every sample taken from the first readystatechange
            # onwards must ALREADY read the stored theme; a single sample
            # reading something else is the flash.
            samples = pg.evaluate("() => window.__themeAtPaint")
            print(f"{theme} {route}: data-theme at paint = {samples}")
            if not samples or any(s != theme for s in samples):
                fails.append(f"{theme} {route}: theme samples {samples}, wanted all {theme!r}")
        ctx.close()
    b.close()

print()
if fails:
    for f in fails: print("FAIL", f)
    sys.exit(1)
print("PASS Next's dev overlay paints nothing on any route checked")
print("PASS the dev console is clean, the theme script is nonced, and neither theme flashes")
