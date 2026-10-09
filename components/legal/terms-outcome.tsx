import { Card } from '@/components/ui/card'

/*
 * What `?terms=` from /api/legal/accept means, in words.
 *
 * Four outcomes, each with its own copy, because they are four different
 * situations and a single "something went wrong" would hide the only one the
 * seller can act on. Same arrangement as CONNECT_OUTCOMES: the route sets a
 * code, the copy lives next to the screen that renders it, and an unknown code
 * renders nothing rather than inventing a message.
 */
const OUTCOMES: Record<string, { title: string; detail: string }> = {
  yes: {
    title: 'Agreement accepted',
    detail:
      'Recorded against this shop with the date and the version you accepted. You can connect your Etsy shop now.',
  },
  unchecked: {
    title: 'The box was not ticked',
    detail:
      'Nothing was recorded. Accepting an agreement has to be deliberate, so an unticked box is taken at face value rather than forgiven.',
  },
  not_published: {
    title: 'There is nothing to accept yet',
    detail:
      'EtsyPilot’s Terms and Privacy Policy are still drafts — they name no legal entity, so nobody can accept them and nothing was recorded. Connecting a shop is blocked until they are finished.',
  },
  failed: {
    title: 'That could not be recorded',
    detail:
      'Nothing was recorded and nothing on Etsy was read or changed. Please try again; if it keeps happening, tell us before connecting anything.',
  },
}

export function TermsOutcome({ outcome }: { outcome: string }) {
  const copy = OUTCOMES[outcome]
  if (!copy) return null

  return (
    <Card className="mb-4 p-4">
      <h2 className="text-section text-ink-1">{copy.title}</h2>
      <p className="mt-1 max-w-[75ch] text-small leading-relaxed text-ink-2">{copy.detail}</p>
    </Card>
  )
}
