# EtsyPilot

**Make smarter Etsy decisions with data you can trust.**

An Etsy Seller Decision & Operations Intelligence platform. Not a keyword
dashboard — the product answers what changed, what the evidence supports, what to
do next, whether it worked, and what it meant for profit.

## Running it

```bash
npm install
cp .env.example .env.local     # no edits needed
npm run dev                    # http://localhost:3000
```

**The app runs completely in demo mode with no credentials of any kind.** No
database, no Etsy app, no API keys. It serves Willow & Fern Studio — a fictional
shop with 412 active listings, 438 orders and a full cost history — so every
screen is explorable before anything is connected.

```bash
npm run typecheck    # tsc --noEmit, strict
npm test             # vitest
npm run build        # production build
```

## The rules this codebase enforces

These are not conventions to remember; they are built into the types.

- **Provenance is part of the return type.** Every metric a domain service
  returns carries a `Provenance` value object, so "an estimate shown as
  verified" is a type error rather than a design slip. See
  `lib/provenance/types.ts`.
- **Estimates are ranges.** `estimated()` will not compile without a confidence
  level and a list of limitations.
- **Unavailable carries no fallback.** Etsy does not expose listing views,
  buyer search terms or Ads performance. The `EtsyService` interface has no
  method that would return them as numbers.
- **Demo mode replaces the provenance badge everywhere.** A dashed `Demo` chip
  overrides whatever the underlying provenance was, so a screenshot taken in
  demo mode can never be mistaken for a real shop's figures.
- **Net profit is computed, never asserted.** A waterfall whose parts do not sum
  to its total is worse than no waterfall.
- **The event log is append-only.** Rollback writes a new event; it never edits
  history.
- **Demo mode cannot write.** `MockEtsyService.applyListingChanges` throws a
  named error rather than faking success.

## Layout

```
app/          routes; (dashboard) carries the shell
components/   ui/ layout/ provenance/
domain/       business logic, framework-free
lib/          etsy/ auth/ permissions/ provenance/ events/ errors/ db/ utils/
db/schema/    Drizzle tables
tests/        vitest
docs/         PHASE-0-AUDIT.md, DECISIONS.md, and the source design canvases
```

`docs/DECISIONS.md` is the binding record of every product decision. Read it
before changing anything visual or commercial.

## Etsy integration

`lib/etsy/interface.ts` is the contract. `MockEtsyService` serves it today;
`LiveEtsyService` is a stub that Phase 11 fills in. `ETSY_MODE` selects between
them and nothing above the domain layer knows which is running.

---

The term "Etsy" is a trademark of Etsy, Inc. This Application uses Etsy's API,
but is not endorsed or certified by Etsy.
