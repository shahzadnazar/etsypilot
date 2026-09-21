import type { Metadata } from 'next'
import { AuthForm } from '@/components/auth/auth-form'
import { signUp } from '@/lib/auth/actions'
import { authOutcome } from '@/domain/auth/outcomes'

export const metadata: Metadata = { title: 'Create an account' }

/** Sign up. Same shell and same reasoning as /login — see that file. */
export const dynamic = 'force-dynamic'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string }>
}) {
  const { outcome } = await searchParams
  return <AuthForm mode="signup" action={signUp} outcome={authOutcome(outcome)} />
}
