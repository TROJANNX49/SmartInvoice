---
name: AI parse source signal
description: How the app tells AI parsing apart from the offline regex fallback, and the intended UX when AI is down.
---

# AI parse source signal

`parseRawNotesWithAI` (`src/lib/aiParser.ts`) returns a `source: 'ai' | 'fallback'` field on `ParsedInvoice`. The server (`/api/parse-invoice` in `server.js`) stamps `source: 'ai'` on success; the client's regex fallback stamps `source: 'fallback'`.

**Intended behavior when AI is unavailable:** never block/error. Fall back to the regex parser AND show the user an amber banner on the Review step (`CreateInvoicePage.tsx`, gated on `parseSource === 'fallback'`) warning results are less accurate. This replaced silent degradation.

**Why:** OpenAI quota is exhausted (429 on nearly every call), so the fallback runs in practice almost always. Users were getting regex-quality output while believing it was AI. The signal makes the degradation visible.

**How to apply:** if you add another parse consumer or change the response shape, keep `source` flowing through end-to-end, and keep the client defaulting unknown/missing `source` to `'fallback'` (safer — assume non-AI unless the server explicitly confirms `'ai'`).
