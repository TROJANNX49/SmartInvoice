---
name: Parser regex-fallback testing
description: How the aiParser regex fallback is unit-tested, and two non-obvious gotchas that make it work.
---

# Testing the aiParser regex fallback

The regex fallback is only reachable through `parseRawNotesWithAI`, which first
tries a network call. Tests force the fallback by stubbing global `fetch` to
reject (`vi.stubGlobal('fetch', vi.fn().mockRejectedValue(...))`). No dev server
or OpenAI key needed. Runner: **vitest**, `npm test` (`vitest run`), env `node`.

## Two gotchas that are easy to trip over
- **`import type { InvoiceItem }` in aiParser.ts is load-bearing for tests.**
  `./api` transitively imports `./supabase`, which *throws at module load* when
  `VITE_SUPABASE_*` env vars are absent (as in the test env). A value import
  would pull that chain in and crash every test. Keep it a type-only import.
  **Why:** avoids needing Supabase env vars just to unit-test pure parsing.
- **Pin/omit the vitest version carefully.** The package firewall blocked the
  specific pinned tarball (`vitest@^2` → 403 "Blocked by Security Policy");
  `vitest@latest` installed fine. If an install 403s, try latest rather than a
  hard pin.

**Coverage note:** the suite covers line-item extraction only (hourly, per-unit
"each", discounts/credits, all joiner separators, no-over-split). Client
name/email/address, due-date, and payment-terms parsing are NOT yet tested.
