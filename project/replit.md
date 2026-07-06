# SmartInvoice AI

Turns freeform work notes into structured invoices/estimates. React + Vite frontend (port 5000) with an Express API (port 3001) proxied through Vite. Supabase for auth/data, Stripe for billing, OpenAI (gpt-4o-mini) for note parsing.

## Note parsing behavior (AI vs. offline fallback)

Parsing runs in two tiers:

1. **AI parser** — the server (`/api/parse-invoice` in `server.js`) calls OpenAI `gpt-4o-mini`. On success the response includes `source: 'ai'`.
2. **Offline fallback** — if the AI call fails for any reason (exhausted quota / 429, network error, invalid response), the client (`parseRawNotesWithAI` in `src/lib/aiParser.ts`) runs a local regex heuristic parser and tags the result `source: 'fallback'`.

**Intended behavior when AI is unavailable:** the app does NOT block or error. It transparently falls back to the offline parser so the user can still create an invoice, and it **clearly tells the user** the offline parser was used. On the Review step (`CreateInvoicePage.tsx`), a prominent amber banner appears when `source === 'fallback'`, warning that results are less accurate and every field should be reviewed before saving. This removes the previous silent degradation where users believed they were getting AI parsing.

To restore AI parsing, ensure `OPENAI_API_KEY` has available quota.

## Tests

`npx vitest run` — the suite in `src/lib/aiParser.test.ts` forces the fallback path (by stubbing `fetch` to reject) and also asserts the `source` field for both the AI-success and fallback paths.

## User preferences

(none recorded yet)
