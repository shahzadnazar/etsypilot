import { NotFoundFrame } from '@/components/layout/not-found-frame'

/*
 * The seller app's 404.
 *
 * The operator console has its own, next to its own layout, because these
 * words are false there. The two share NotFoundFrame, so they still look like
 * one page.
 */
export default function NotFound() {
  return (
    <NotFoundFrame
      body="The link may be outdated, or the listing was deleted on Etsy. Nothing is broken with your account."
      links={[
        { href: '/dashboard', label: 'Back to overview' },
        { href: '/listings/audit', label: 'Listing audit' },
      ]}
    />
  )
}
