/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE PRODUCT'S NAME AND ITS CONTACT ADDRESSES, IN ONE PLACE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * This file exists because renaming the product the first time touched 138
 * files. It cannot make the second rename free — see the boundary below — but
 * it makes the part that is pure duplication free, and it makes one class of
 * claim impossible to fake.
 *
 * ── WHAT IS IN HERE, AND WHY EACH ONE ─────────────────────────────────────
 *
 *   PRODUCT_NAME   The display name, in the casing it is shown in. Every
 *                  surface that prints the name AS THE BRAND reads this: the
 *                  wordmark in the sidebar and the public header, the browser
 *                  tab's title template and its fallback, the icon's
 *                  accessible name, the operator console's banner, the
 *                  extension's name in the browser's add-on list.
 *
 *   PRODUCT_SLUG   The machine form. A filename, a package name, a storage
 *                  key and an add-on id are not copy — they are identifiers,
 *                  lowercase by convention, and they break differently when
 *                  they change (an exported CSV's name, a seller's remembered
 *                  theme). Kept separate so the casing of one cannot leak
 *                  into the other.
 *
 *   CONTACT        The privacy and support addresses, and both are `null`.
 *                  This is the part that is not about renaming at all.
 *
 * ── WHY THE ADDRESSES ARE NULL AND TYPED THAT WAY ─────────────────────────
 *
 * Until this change the product printed `privacy@<domain>` on the landing
 * page, in the FAQ and on Settings → Export & deletion. No domain has been
 * bought. The Privacy Policy's §6 tells a seller that emailing that address is
 * the ONLY way to exercise a deletion right, so an address that does not
 * route is not a typo — it is the same defect as the nine false claims the
 * verification pass found in the legal drafts, and worse, because this one is
 * the remedy for a right.
 *
 * The documents already handle this honestly: they carry `[[PRIVACY_EMAIL]]`
 * and the page renders it as a marked blank. The application should not be
 * less honest than the document that describes it.
 *
 * So the type is `string | null` rather than `string`. That is deliberate: a
 * call site cannot print the address without deciding what to do when there
 * is none, because the compiler will not let it. The rule every surface
 * follows is the product's own — WHERE AN ADDRESS IS UNSET, THE LINE IS
 * OMITTED, NOT FAKED — and tests/unit/brand.test.ts fails if an address-shaped
 * literal reappears in rendered copy.
 *
 * ── WHAT IS DELIBERATELY NOT IN HERE ──────────────────────────────────────
 *
 *   The legal entity. `[[LEGAL_ENTITY]]` is a different fact from the product
 *   name — a company that does not exist yet — and it lives in the legal
 *   documents where its absence is already marked and counted.
 *
 *   The colours and the monogram. Those are in styles/globals.css and in the
 *   markup; a token set is not a string.
 *
 *   An environment variable. `.env.example` carried NEXT_PUBLIC_APP_NAME and
 *   nothing ever read it. Reading the name from the environment would make it
 *   a per-deployment setting, and the reason for this rename is a trademark
 *   argument about what the product is CALLED — not something a deployment
 *   gets to differ on. The dead variable is removed rather than wired up.
 *
 * ── THE BOUNDARY, STATED HONESTLY ─────────────────────────────────────────
 *
 * 376 occurrences of the old name were in prose: sentences in components,
 * methodology copy, error messages. Those are NOT interpolated from here, and
 * that is a decision rather than an omission.
 *
 * A sentence that names the product cannot be renamed mechanically. This very
 * rename proves it: the old name opened with a vowel sound and the new one
 * does not, so every article in front of it had to change too — in eight
 * sentences, including one in the Terms. The previous rename left the mirror
 * image of that same defect standing for two months.
 *
 * (The broken spellings are deliberately not quoted here. A guard that
 * matches its own documentation gets switched off.)
 * Interpolating `${PRODUCT_NAME}` into those sentences would hide that
 * problem rather than solve it — the article would still be wrong, and now it
 * would be wrong in a string that looks parameterised and safe.
 *
 * What makes the next rename small is not interpolation. It is that the
 * identity surfaces read from here, and that two guards exist:
 * tests/unit/brand.test.ts fails on the old name anywhere in the product, and
 * on the broken article. The next rename is a sed, a grep and a read-through
 * of what the grep finds — which is the honest shape of the job.
 */

/** The display name, in the casing it is shown in. */
export const PRODUCT_NAME = 'CobaltRank'

/**
 * The two-letter mark in the sidebar, the public header, the tab icon and the
 * extension popup.
 *
 * It read "EP" until this rename, and nothing in a grep for the old name
 * finds it — two letters that are not the word. D3 locked "the EP monogram
 * lockup exactly as designed", and that decision was about a name that no
 * longer exists: a mark reading EP beside the word CobaltRank is not the
 * designed lockup, it is a leftover.
 *
 * Derived here rather than typed into five files, because five is how many
 * surfaces drew it and four of them are easy to miss. The two static ones —
 * app/icon.svg and extension/popup.html — cannot import anything, so
 * tests/unit/brand.test.ts holds them to this value instead.
 */
export const PRODUCT_MONOGRAM = 'CR'

/**
 * The indefinite article the name takes: "a CobaltRank figure".
 *
 * A constant and not a computed thing, because the rule is about SOUND and
 * not spelling — "an hour", "a one-word name", "an SQL query" — and a vowel
 * heuristic would get those wrong while looking authoritative. Two lines of
 * judgement, recorded once.
 *
 * It is here because the article has now broken twice. The first rename left
 * "a <vowel-sound name>" standing in the Terms for two months; this one
 * recreated the mirror image of it in eight places, including the guard that
 * was supposed to catch it — a find-and-replace rewrote that guard's own
 * expectation into nonsense. tests/unit/brand.test.ts reads this constant, so
 * the next rename changes one line here and the sweep tells you where to look.
 */
export const PRODUCT_NAME_ARTICLE = 'a'

/** The machine form: package name, filenames, storage keys, add-on id. */
export const PRODUCT_SLUG = 'cobaltrank'

/**
 * Who a seller writes to, when there is anybody to write to.
 *
 * `null` means no address is published. It does NOT mean "use a default" and
 * it must never be rendered as an empty string: a line that reads "email
 * from the address on your account" with a gap where the address was is worse
 * than no line at all.
 */
export const CONTACT: Readonly<Record<ContactKind, string | null>> = {
  /* Deletion, access, correction — everything in Privacy §6. */
  privacy: null,
  /* General support and the landing page's Contact link. */
  support: null,
}

export type ContactKind = 'privacy' | 'support'

/** The address, or null. Call sites must handle the null. */
export function contactAddress(kind: ContactKind): string | null {
  return CONTACT[kind]
}

/** Is there an address to print at all? */
export function hasContactAddress(kind: ContactKind): boolean {
  return contactAddress(kind) !== null
}
