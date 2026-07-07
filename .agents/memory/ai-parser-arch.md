---
name: AI parser architecture
description: How the SmartInvoice AI parser is structured — server, proxy, security, fallback, and frontend guard.
---

## Architecture

- `project/server.js` — Express on port 3001; single endpoint `POST /api/parse-invoice`
- `project/vite.config.ts` — proxies `/api/*` → `http://localhost:3001`; browser never talks to port 3001 directly
- `project/src/lib/aiParser.ts` — async `parseRawNotesWithAI(text, signal?)` is a **two-pass** parser: Pass 1 = AI via `/api/parse-invoice`; Pass 2 = regex `parseRawNotesRegex` as last resort. Falls back to regex on ANY error AND when the AI returns no usable item (blank desc + all-zero amounts); on soft-fallback it merges AI-extracted client/meta fields over the regex result. AbortError is re-thrown (never falls back).
- Server uses **Groq** (`llama-3.3-70b-versatile`) via `groq-sdk`. Uses `response_format: { type: 'json_object' }` — schema shape enforced by the system prompt (not a separate schema object). Client factory `getGroqClient()` is created per-request (never cached). OpenAI and Gemini packages fully removed. GROQ_API_KEY secret required. Free tier: 1,000 req/day for 70b-versatile.
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
