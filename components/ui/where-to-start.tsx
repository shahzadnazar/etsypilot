/*
 * A labelled paragraph saying which finding to deal with first.
 *
 * This replaces components/ai/assisted-note.tsx, which had three states —
 * the model's text badged AI draft, the product's own words when the model was
 * unreachable, and the same plus a line saying a version was withheld. With
 * the AI Copilot removed (D95) only the middle state is reachable, and that
 * state was always the domain's own sentence: `${rule.why} ${rule.fix}` on the
 * audit, `action.explanation` on the Action Center.
 *
 * So the component is what is left when the decoration goes: a label and a
 * paragraph. Both callers pass text they already had, which is why nothing a
 * seller reads changed — the badge went, the words did not.
 */

export function WhereToStart({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-label text-muted-1">{label}</span>
      <p className="text-small leading-relaxed text-ink-2">{text}</p>
    </div>
  )
}
