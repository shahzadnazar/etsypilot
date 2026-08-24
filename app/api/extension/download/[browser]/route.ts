/*
 * Downloading the packaged extension.
 *
 * Neither store listing is live, and a page whose only two buttons say "Coming
 * soon" is a dead end for something that is actually finished and installable
 * today. This route serves the built package so a seller can load it unpacked.
 *
 * Three things are deliberate:
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
 *   3. A missing build is reported as a missing build, with the one command
 *      that produces it. Not a 500, and not an empty zip.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getSession } from '@/lib/auth'
import { errorResponse } from '@/lib/errors/api'
import { AppError, Errors } from '@/lib/errors/types'

export const runtime = 'nodejs'

const BROWSERS = ['chrome', 'firefox'] as const
type Browser = (typeof BROWSERS)[number]

function isBrowser(value: string): value is Browser {
  return (BROWSERS as readonly string[]).includes(value)
}

export async function GET(
  _request: Request,
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

    /*
     * Into the OS temp directory, named for the request, and removed straight
     * after reading. Writing into the project would put a build artefact where
     * a served file could later be picked up by a static handler.
     */
    const zipPath = join(tmpdir(), `etsypilot-${browser}-${Date.now()}.zip`)
    try {
      execFileSync('zip', ['-qr', zipPath, '.'], { cwd: source })
      const body = readFileSync(zipPath)
      return new Response(new Uint8Array(body), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="etsypilot-${browser}.zip"`,
          'Cache-Control': 'private, no-store',
        },
      })
    } finally {
      rmSync(zipPath, { force: true })
    }
  } catch (error) {
    return errorResponse(error, { path: `/api/extension/download/${browser}` })
  }
}
