---
name: Invoice note parser — multi-item extraction
description: How the regex fallback parser splits and extracts multiple line items; the invariants that must hold when adding/reordering patterns.
---

# Invoice note parser — multi-item extraction

The regex fallback in `project/src/lib/aiParser.ts` (`parseRawNotesRegex`, reached
whenever the OpenAI call fails — which is nearly always in this project) must
capture EVERY priced entry in a freeform note, not stop after the first.

## Two-stage design (keep this shape)
1. **Clause pre-expansion** — `ITEM_SEPARATOR` splits a clause on ` and `, ` plus `,
   ` as well as `, ` then `, and `;`. Guarded: only split when **every** resulting
   part contains a `$`. This is what prevents over-splitting natural phrases like
   "design and development".
2. **Per-clause multi-match loop** — `extractOneItem(seg)` returns `{ item, end }`;
   the caller slices `seg.slice(end)`, strips leading `^[\s;,]+`, and re-runs so one
   clause can yield several items. Bounded by a 30-iteration guard + a
   forward-progress check (`next.length >= seg.length` breaks).

## Non-obvious invariants (violating these caused review failures)
- **Extraction selects the EARLIEST match position, not the first pattern that
  matches**, with pattern priority only as the tie-break on equal start index.
  **Why:** most patterns are unanchored; a first-match-wins cascade matches a later
  item, and consuming up to that match discards the still-parseable earlier text
  before it (a dropped item).
- **Any bare amount-first pattern must be start-anchored and non-greedy** (lazy
  description that stops before the next amount/separator).
  **Why:** unanchored/greedy versions fire mid-prose ("...that cost us $500 on
  site") and merge two run-together priced fragments into one item.
- **Collect candidates into an array and reduce to the earliest** rather than
  mutating a `let best` inside a closure — TS can't narrow closure-mutated locals
  and `tsc --noEmit` (via `npm run typecheck`) fails even though vite/esbuild build
  passes. Always run `npm run typecheck`, not just the build.

**How to apply:** when adding or reordering patterns, preserve earliest-match
selection and keep any new amount-first pattern anchored + non-greedy. Verify
against the regression cases below.

## Regression cases that must stay green
Original 5-item note; `plus`/`as well as`/`;`/`then` joiners; `and`+`each` compound;
discount+credit with reason labels (e.g. "shipping error credit", "Discount – contract
renewal"); single hourly item; "design and development" NOT over-split; trailing
separator; mixed-order simple+hourly; run-together multi-amount; generator-prose
(no false positive). No committed test suite yet — see the "Automatically test
invoice note parsing" follow-up.
