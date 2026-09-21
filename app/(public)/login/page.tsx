import type { Metadata } from 'next'
import { AuthForm } from '@/components/auth/auth-form'
import { signIn } from '@/lib/auth/actions'
import { authOutcome } from '@/domain/auth/outcomes'

export const metadata: Metadata = { title: 'Sign in' }

/*
 * Sign in.
 *
 * Under (public), which reads no session — so this page cannot be caught by the
 * `if (!session) redirect('/login')` that the dashboard layout and about twenty
 * pages run. Putting it under (dashboard) would have made signing in require
 * being signed in, and the symptom would have been an infinite redirect rather
 * than an error anyone could read.
 *
 * Dynamic, because it renders from a query parameter. Prerendered, the first
 * visitor's outcome banner would be baked in and served to everyone after them.
 */
export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string }>
}) {
  const { outcome } = await searchParams
  // Narrowed against the closed map. An invented value renders no banner
  // rather than being echoed onto a signed-out page.
  return <AuthForm mode="signin" action={signIn} outcome={authOutcome(outcome)} />
}
