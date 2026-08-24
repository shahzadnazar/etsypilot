import { Button } from '@/components/ui/button'

/*
 * A control the design calls for that nothing is behind yet.
 *
 * Rendered in place, disabled, with the reason attached to it — not omitted,
 * and above all not rendered as a working button.
 *
 * The precedent is Export & deletion, which carries no delete button because
 * there is no repository behind it: "a button that appears to delete your data
 * while doing nothing is the single worst thing this page could contain". On a
 * security page the same argument is stronger, not weaker. "Sign out everywhere
 * else" that signs nothing out is worse than no button at all, because a person
 * who clicks it stops looking for the real answer.
 *
 * `reason` is required. There is no way to render one of these without saying
 * why it cannot be used, which is the whole point of the component.
 */
export function NotYet({
  label,
  reason,
  variant = 'secondary',
}: {
  label: string
  reason: string
  variant?: 'primary' | 'secondary' | 'destructive'
}) {
  return (
    <span className="flex flex-col items-start gap-1">
      <Button variant={variant} disabled title={reason}>
        {label}
      </Button>
      <span className="max-w-[26ch] text-[10.5px] leading-snug text-muted-1">{reason}</span>
    </span>
  )
}
