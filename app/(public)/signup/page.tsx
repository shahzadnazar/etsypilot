import type { Metadata } from 'next'
import { AuthForm } from '@/components/auth/auth-form'
import { LegalLinks } from '@/components/legal/legal-links'
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
  return (
    <>
      <AuthForm mode="signup" action={signUp} outcome={authOutcome(outcome)} />
      {/*
        * Under the form, not inside it. AuthForm is shared with /login, and
        * what a visitor is agreeing to by CREATING an account is not what they
        * agree to by signing in to one they already have.
        *
        * While the documents are drafts this renders a sentence and no link —
        * see components/legal/legal-links.tsx for why that is not silence and
        * not a link either.
        */}
      <LegalLinks
        variant="signup"
        className="mx-auto mt-4 max-w-[420px] text-caption leading-relaxed text-muted-1"
      />
    </>
  )
}
