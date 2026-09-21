import { signOut } from '@/lib/auth/actions'

/*
 * Sign out.
 *
 * POST only, and there is no GET. A GET sign-out is triggered by anything that
 * fetches a URL — a link prefetch, a chat client unfurling a preview, an image
 * tag on a hostile page — and each of those would silently end a seller's
 * session. It is also why this is a route rather than a bare link: a
 * <form method="post"> can reach it from any page, and middleware's CSRF check
 * covers it exactly like every other mutation.
 *
 * The work lives in the server action so sign-in, sign-up and sign-out share
 * one cookie contract rather than three.
 */
export async function POST(): Promise<Response> {
  // signOut() ends in redirect(), which works by throwing — so this never
  // returns normally, and the type is satisfied by the throw.
  await signOut()
  return new Response(null, { status: 303, headers: { Location: '/login' } })
}
