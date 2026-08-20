import { redirect } from 'next/navigation'

export default function RootPage() {
  // The marketing site lands in Phase 10 alongside the public tool hub.
  redirect('/dashboard')
}
