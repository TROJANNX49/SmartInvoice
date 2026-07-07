---
name: AI parser architecture
description: How the SmartInvoice AI parser is structured — server, proxy, security, fallback, and frontend guard.
---

## Architecture

- `project/server.js` — Express on port 3001; single endpoint `POST /api/parse-invoice`
- `project/vite.config.ts` — proxies `/api/*` → `http://localhost:3001`; browser never talks to port 3001 directly
- `project/src/lib/aiParser.ts` — async `parseRawNotesWithAI(text, signal?)` is a **two-pass** parser: Pass 1 = AI via `/api/parse-invoice`; Pass 2 = regex `parseRawNotesRegex` as last resort. Falls back to regex on ANY error AND when the AI returns no usable item (blank desc + all-zero amounts); on soft-fallback it merges AI-extracted client/meta fields over the regex result. AbortError is re-thrown (never falls back).
- Server uses **Google Gemini** (`gemini-2.0-flash`) via `@google/generative-ai`. Schema enforced via `generationConfig: { responseMimeType: 'application/json', responseSchema: INVOICE_RESPONSE_SCHEMA }`. Gemini schema uses uppercase type strings (`'STRING'`, `'INTEGER'`, etc.) and `nullable: true` as a sibling property (not a type union like OpenAI). System prompt passed via `systemInstruction`. OpenAI (`openai` npm package) has been fully removed.
- `project/src/pages/CreateInvoicePage.tsx` — `parseAbortRef` (useRef<AbortController>) cancels in-flight request before starting a new one; checks `signal.aborted` after await to drop stale results

## Security hardening applied
- CORS restricted to localhost:5000 + `REPLIT_DOMAINS` origins only
- `express-rate-limit`: 30 req/min per IP on the parse endpoint
- Input: enforces `typeof text === 'string'`, max 4000 chars
- Output: all LLM fields coerced/validated before returning (no raw pass-through)

## Workflow
- `npm run dev:all` via `concurrently` starts both servers together
- Workflow command: `cd project && npm install && npm run dev:all`

**Why:** OpenAI key must stay server-side; Vite proxy is the boundary — the Express server on 3001 is the only thing that holds the key.
