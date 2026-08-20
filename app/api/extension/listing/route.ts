/*
 * The extension's only endpoint.
 *
 * GET, by listing id, session-scoped. There is no POST here and no plan to add
 * one: the extension reads, and everything that writes goes through the app,
 * where the bulk editor's confirmation gate applies.
 *
 * Authentication is the seller's existing EtsyPilot session cookie, sent by the
 * browser because the popup fetches with `credentials: 'include'`. The
 * extension never receives a token, so it cannot leak one — and this route
 * never issues one.
 *
 * CORS is deliberately narrow. A chrome-extension:// origin is allow-listed by
 * id at build time; anything else gets no CORS headers at all, so a page a
 * seller happens to be visiting cannot read their shop data through their own
 * cookie. `Vary: Origin` keeps a cached permissive response from being served
 * to the wrong origin.
 */

import { NextResponse } from 'next/server'
import { getListingIntelligence } from '@/domain/extension/service'
import { getSession } from '@/lib/auth'
import { AppError } from '@/lib/errors/types'
import { getEtsyService } from '@/lib/etsy'
import { shopContext } from '@/lib/permissions'
import type { ExtensionResponse } from '@/lib/extension/contract'

/** Extension ids allowed to call this route, from the environment. */
function allowedOrigins(): string[] {
  const ids = (process.env.EXTENSION_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  return ids.flatMap((id) => [`chrome-extension://${id}`, `moz-extension://${id}`])
}

function corsHeaders(origin: string | null): Record<string, string> {
  // Vary regardless of the outcome: a response cached for one origin must not
  // be replayed to another.
  const base = { Vary: 'Origin' }
  if (!origin || !allowedOrigins().includes(origin)) return base
  return {
    ...base,
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }
}

function json(body: ExtensionResponse, status: number, origin: string | null): Response {
  return NextResponse.json(body, {
    status,
    headers: {
      ...corsHeaders(origin),
      // A seller's own shop figures. Never cached by a shared proxy.
      'Cache-Control': 'private, no-store',
    },
  })
}

function appUrl(path: string): string {
  return new URL(path, process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').toString()
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) })
}

export async function GET(request: Request) {
  const origin = request.headers.get('origin')
  const listingId = new URL(request.url).searchParams.get('listingId')

  try {
    if (!listingId || !/^\d+$/.test(listingId)) {
      return json(
        {
          state: 'NOT_A_LISTING',
          message: 'Open an Etsy listing and this panel fills in.',
          etsyUrl: 'https://www.etsy.com',
        },
        200,
        origin,
      )
    }

    const session = await getSession()
    if (!session) {
      return json(
        {
          state: 'SIGNED_OUT',
          message:
            'Sign in once — the extension shares your existing EtsyPilot session, never a separate Etsy login.',
          signInUrl: appUrl('/login'),
        },
        200,
        origin,
      )
    }

    const ctx = shopContext(session, session.shopId)
    const shop = await getEtsyService().getShop(ctx.shopId)
    if (shop.connectionStatus === 'DISCONNECTED' || shop.connectionStatus === 'REVOKED') {
      return json(
        {
          state: 'NO_SHOP',
          message:
            'Connect a shop in EtsyPilot to unlock listing health and your own verified figures here.',
          connectUrl: appUrl('/settings/shops'),
        },
        200,
        origin,
      )
    }

    const listing = await getListingIntelligence(ctx, listingId)
    if (!listing) {
      return json(
        {
          state: 'NOT_A_LISTING',
          message: 'This page is not an Etsy listing.',
          etsyUrl: 'https://www.etsy.com',
        },
        200,
        origin,
      )
    }

    return json({ state: 'OK', listing }, 200, origin)
  } catch (error) {
    // The popup gets our wording, never a stack trace or an internal id.
    const app = error instanceof AppError ? error : null
    return json(
      {
        state: 'ERROR',
        message: app?.message ?? 'We couldn’t load EtsyPilot intelligence for this listing.',
        recovery: app?.recovery ?? 'Nothing on your shop was changed. Try again in a moment.',
      },
      app ? 400 : 500,
      origin,
    )
  }
}
