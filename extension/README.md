# EtsyPilot browser extension

A read-only companion popup for Chrome and Firefox. It shows EtsyPilot listing
health, keyword opportunity and your own verified figures while you are looking
at an Etsy listing.

## What it can never do

The acceptance criterion for this part of the product is that the extension
**never contains privileged Etsy credentials**, so it is enforced by the build
rather than by review. `extension/build.mjs` refuses to produce a package that:

- requests any permission beyond `activeTab`, or any host beyond `etsy.com`
- contains `chrome.cookies`, `chrome.webRequest`, `chrome.debugger` or
  `declarativeNetRequest`
- contains anything shaped like a key, token or secret
- points at any host except `etsy.com` and the configured app origin

A failing audit exits non-zero and writes nothing. The same checks run in
`tests/unit/extension.test.ts` against the built package, so they are part of
`npm test` and not only of the packaging step.

There is also no *shape* for a credential: `lib/extension/contract.ts` has no
token field on any request or response, and no message that writes. The
extension authenticates with your existing EtsyPilot session cookie, which the
browser sends and the extension never reads.

## Build

```bash
# Point the popup at your app, then build both packages.
EXTENSION_APP_URL=https://app.example.com npm run extension:build

# Same, plus a zip per store.
EXTENSION_APP_URL=https://app.example.com npm run extension:package
```

Output lands in `extension/build/chrome` and `extension/build/firefox`. Both are
git-ignored; the package is always rebuilt, never committed.

To let a built extension call the app, set `EXTENSION_IDS` on the **server** to
the extension ids you want to allow, comma separated. Any other origin gets no
CORS headers and cannot read a response, even with a valid session cookie.

## Load it unpacked

- **Chrome** — `chrome://extensions` → Developer mode → Load unpacked →
  `extension/build/chrome`
- **Firefox** — `about:debugging` → This Firefox → Load Temporary Add-on →
  `extension/build/firefox/manifest.json`

## Layout

| Path | What it is |
|---|---|
| `src/client.ts` | The only networking. One host: the app. |
| `src/content.ts` | Reads the URL of the Etsy tab. Does not scrape the page. |
| `src/popup.ts` | The popup UI. Same provenance badges as the app. |
| `src/background.ts` | Deliberately almost empty. Holds nothing. |
| `../lib/extension/contract.ts` | Types shared with the app. One source. |
| `../lib/extension/policy.ts` | What the extension may be. **Not** shipped. |

`policy.ts` is excluded from the extension's `tsconfig.json` include list on
purpose: it holds the list of forbidden API names, and a list of the exact
strings a reviewer greps for has no business being inside the artefact under
review. The packaging audit found that itself, on its first run.
