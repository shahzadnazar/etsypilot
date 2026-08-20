/*
 * Extension packaging for Chrome and Firefox.
 *
 * One UI, one client, one auth flow; only the manifest differs. The script
 * compiles the TypeScript, copies the static files, substitutes the app origin,
 * and then — before writing anything to a package directory — runs the audit.
 *
 * The audit is the point. Phase 9's acceptance criterion is "the extension
 * never contains privileged Etsy credentials", and a criterion that is only
 * checked by reading the diff is a criterion that survives exactly as long as
 * the reader's attention. This one fails the build:
 *
 *   - no permission beyond activeTab, and no host beyond etsy.com
 *   - no forbidden API (cookies, webRequest, debugger, declarativeNetRequest)
 *   - nothing that looks like a key or a secret in any shipped file
 *   - no request to any host except the app origin
 *
 * Run: node extension/build.mjs [--zip]
 */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

/** Where the popup is allowed to talk. Everything else is a build failure. */
const APP_ORIGIN = process.env.EXTENSION_APP_URL ?? 'http://localhost:3000'

const BROWSERS = [
  { name: 'chrome', manifest: 'manifest.chrome.json' },
  { name: 'firefox', manifest: 'manifest.firefox.json' },
]

const STATIC_FILES = ['popup.html', 'popup.css']

/* ------------------------------------------------------------------ audit */

const FORBIDDEN_APIS = [
  'chrome.cookies',
  'browser.cookies',
  'chrome.webRequest',
  'browser.webRequest',
  'chrome.debugger',
  'declarativeNetRequest',
]

const ALLOWED_PERMISSIONS = ['activeTab']
const ALLOWED_HOSTS = ['https://www.etsy.com/*', 'https://etsy.com/*']

/**
 * Anything shaped like a credential.
 *
 * Deliberately broad: a false positive costs a rename, a false negative ships a
 * secret to every seller's browser and to both extension stores, where it
 * cannot be recalled.
 */
const SECRET_PATTERNS = [
  /\bsk_(live|test)_[A-Za-z0-9]/,
  /\bwhsec_[A-Za-z0-9]/,
  /\bsk-ant-[A-Za-z0-9]/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
  /(api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|private[_-]?key)\s*[:=]\s*['"][^'"]{8,}/i,
  /ETSY_API_(KEY|SECRET)\s*[:=]\s*['"][^'"]+/,
]

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

function audit(packageDir, manifest) {
  const failures = []

  const permissions = manifest.permissions ?? []
  for (const permission of permissions) {
    if (!ALLOWED_PERMISSIONS.includes(permission)) {
      failures.push(`manifest requests "${permission}" — only ${ALLOWED_PERMISSIONS.join(', ')} is allowed`)
    }
  }

  for (const host of manifest.host_permissions ?? []) {
    if (!ALLOWED_HOSTS.includes(host)) {
      failures.push(`manifest requests host "${host}" — only etsy.com is allowed`)
    }
  }
  for (const script of manifest.content_scripts ?? []) {
    for (const match of script.matches ?? []) {
      if (!ALLOWED_HOSTS.includes(match)) failures.push(`content script matches "${match}"`)
    }
  }

  for (const file of walk(packageDir)) {
    const text = fs.readFileSync(file, 'utf8')
    const relative = path.relative(packageDir, file)

    for (const api of FORBIDDEN_APIS) {
      if (text.includes(api)) failures.push(`${relative} uses ${api}`)
    }
    for (const pattern of SECRET_PATTERNS) {
      const hit = text.match(pattern)
      if (hit) failures.push(`${relative} contains something shaped like a credential: ${hit[0].slice(0, 24)}…`)
    }

    // Every absolute URL in shipped code must be etsy.com or the app origin.
    for (const url of text.match(/https?:\/\/[^"'`\s)]+/g) ?? []) {
      const host = new URL(url.replace(/[*].*$/, '')).origin
      const allowed = [new URL(APP_ORIGIN).origin, 'https://www.etsy.com', 'https://etsy.com']
      if (!allowed.includes(host)) failures.push(`${relative} points at ${host}`)
    }
  }

  return failures
}

/* ------------------------------------------------------------------ build */

function build() {
  const dist = path.join(here, 'dist')
  fs.rmSync(dist, { recursive: true, force: true })
  execFileSync('npx', ['tsc', '-p', path.join(here, 'tsconfig.json')], { cwd: root, stdio: 'inherit' })

  const results = []

  for (const browser of BROWSERS) {
    const out = path.join(here, 'build', browser.name)
    fs.rmSync(out, { recursive: true, force: true })
    fs.mkdirSync(out, { recursive: true })

    // Compiled JS, with the origin substituted. tsbuildinfo is a compiler
    // artefact — shipping it puts local paths into every seller's browser.
    for (const file of walk(dist).filter((f) => !f.endsWith('.tsbuildinfo'))) {
      const target = path.join(out, path.relative(here, file))
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, fs.readFileSync(file, 'utf8').replaceAll('__APP_ORIGIN__', APP_ORIGIN))
    }

    for (const file of STATIC_FILES) {
      fs.copyFileSync(path.join(here, file), path.join(out, file))
    }

    const manifest = JSON.parse(fs.readFileSync(path.join(here, browser.manifest), 'utf8'))
    fs.writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

    const failures = audit(out, manifest)
    if (failures.length > 0) {
      console.error(`\n✗ ${browser.name}: the extension audit failed\n`)
      for (const failure of failures) console.error(`  - ${failure}`)
      console.error(
        '\nThis extension ships to every seller who installs it, and to two stores.\n' +
          'Nothing here is worth shipping a credential for.\n',
      )
      process.exit(1)
    }

    const files = walk(out)
    const digest = createHash('sha256')
    for (const file of files.sort()) digest.update(fs.readFileSync(file))

    results.push({ browser: browser.name, out, files: files.length, sha256: digest.digest('hex').slice(0, 12) })

    if (process.argv.includes('--zip')) {
      const zip = path.join(here, 'build', `etsypilot-${browser.name}-${manifest.version}.zip`)
      fs.rmSync(zip, { force: true })
      execFileSync('zip', ['-qr', zip, '.'], { cwd: out })
      console.log(`  packaged ${path.relative(root, zip)}`)
    }
  }

  console.log(`\n✓ extension audit passed · app origin ${APP_ORIGIN}`)
  for (const r of results) {
    console.log(`  ${r.browser}: ${r.files} files · sha256 ${r.sha256} · ${path.relative(root, r.out)}`)
  }
}

build()
