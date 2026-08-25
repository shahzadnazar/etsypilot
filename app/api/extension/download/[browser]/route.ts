/*
 * Downloading the packaged extension.
 *
 * Neither store listing is live, and a page whose only two buttons say "Coming
 * soon" is a dead end for something that is actually finished and installable
 * today. This route serves the built package so a seller can load it unpacked.
 *
 * Four things are deliberate:
 *
 *   1. The browser name is checked against a closed set before it touches a
 *      path. It arrives from the URL, and a path segment that reaches the
 *      filesystem unvalidated is a directory traversal.
 *
 *   2. The zip is made from the BUILD output, never from source. The build is
 *      what runs the packaging audit — no permission beyond activeTab, no
 *      forbidden API, nothing shaped like a key — and shipping the source
 *      directory would hand over a package that audit never saw.
 *
 *   3. The archive is written in-process (lib/extension/zip.ts), not by
 *      shelling out to `zip`. The old version assumed that binary exists; it
 *      does not on Windows, in slim images, or in any serverless runtime, and
 *      when it is missing execFileSync throws ENOENT and the seller gets a 500
 *      that names nothing. No temp file either — the archive never touches disk.
 *
 *   4. A FAILURE IS ANSWERED IN THE FORMAT THE CALLER ASKED FOR.
 *      This route has two audiences. The extension and any script want JSON.
 *      A seller who clicked "Download for Chrome" is doing a top-level browser
 *      navigation, and answering that with `{"error":{"kind":"NOT_FOUND"…}}`
 *      dumps a raw envelope into their window — which is exactly what happened.
 *      Browser navigations are redirected back to the page they came from,
 *      carrying the reason, so the seller stays inside the product.
 */

import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { errorResponse, logFailure } from '@/lib/errors/api'
import { AppError, Errors } from '@/lib/errors/types'
import { zipSync, type ZipEntry } from '@/lib/extension/zip'

export const runtime = 'nodejs'

const BROWSERS = ['chrome', 'firefox'] as const
type Browser = (typeof BROWSERS)[number]

function isBrowser(value: string): value is Browser {
  return (BROWSERS as readonly string[]).includes(value)
}

/** Every file under `dir`, as ZIP entries with forward-slash relative names. */
function collect(dir: string): ZipEntry[] {
  const out: ZipEntry[] = []
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      const full = join(current, name)
      if (statSync(full).isDirectory()) walk(full)
      else {
        out.push({
          // ZIP names are always forward-slash separated, on every platform.
          name: relative(dir, full).split(sep).join('/'),
          data: new Uint8Array(readFileSync(full)),
        })
      }
    }
  }
  walk(dir)
  return out
}

/**
 * Does this look like a person in a browser rather than a script?
 *
 * `Sec-Fetch-Mode: navigate` is the reliable signal — it is set by the browser
 * itself and cannot be forged by a fetch() caller. The Accept check is the
 * fallback for older clients. The extension sends neither.
 */
function isBrowserNavigation(request: Request): boolean {
  if (request.headers.get('sec-fetch-mode') === 'navigate') return true
  return (request.headers.get('accept') ?? '').includes('text/html')
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ browser: string }> },
) {
  const { browser } = await params
  try {
    const session = await getSession()
    if (!session) throw Errors.notAuthenticated()
    if (!isBrowser(browser)) {
      /*
       * Not Errors.notFound, whose recovery says "it may have been deleted on
       * Etsy" — true of a listing and nonsense about a browser package. A
       * shared error is only shared where the recovery is also shared.
       */
      throw new AppError({
        kind: 'NOT_FOUND',
        code: 'EXTENSION_UNKNOWN_BROWSER',
        message: 'There is no EtsyPilot package for that browser.',
        recovery: `The extension is packaged for ${BROWSERS.join(' and ')}. Both are on the Browser Extension page.`,
      })
    }

    const source = join(process.cwd(), 'extension', 'build', browser)
    if (!existsSync(join(source, 'manifest.json'))) {
      throw new AppError({
        kind: 'NOT_FOUND',
        code: 'EXTENSION_NOT_BUILT',
        message: 'The extension has not been packaged yet.',
        recovery:
          'Run `npm run extension:build` once, then download again. The build runs the packaging audit, and a package that has not been through it is not one we will hand out.',
      })
    }

    const archive = zipSync(collect(source))
    return new Response(archive, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="etsypilot-${browser}.zip"`,
        'Content-Length': String(archive.length),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    /*
     * A person gets the page back with the reason on it; a script gets the
     * envelope. Both carry the same reference, so a seller reading it off the
     * screen and a log line are talking about the same failure.
     */
    const path = `/api/extension/download/${browser}`
    if (isBrowserNavigation(request)) {
      const app = logFailure(error, { path })
      const url = new URL('/settings/extension', request.url)
      url.searchParams.set('download', app.code || 'EXTENSION_DOWNLOAD_FAILED')
      url.searchParams.set('ref', app.reference)
      return NextResponse.redirect(url, 303)
    }
    return errorResponse(error, { path })
  }
}
