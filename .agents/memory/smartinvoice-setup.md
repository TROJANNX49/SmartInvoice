---
name: SmartInvoice AI setup
description: Key decisions and quirks from the initial project setup — iCloud stub replacement, Supabase config, schema issues.
---

## iCloud bookmark stubs
Files imported from iCloud Drive on iOS arrive as binary NSKeyedArchiver bookmark blobs, not real source. Affected: `src/lib/supabase.ts`, `src/lib/api.ts`, `src/lib/aiParser.ts`, `src/contexts/AuthContext.tsx`, `src/components/Layout.tsx`. All were reconstructed from scratch based on page imports and the SQL migrations.

## Supabase
- URL: stored as `VITE_SUPABASE_URL` (shared env)
- Anon key: stored as `VITE_SUPABASE_ANON_KEY` (shared env) — uses new `sb_publishable_...` format, not the old JWT format
- Schema inconsistency: initial migration creates `profiles` without `email` column, but the second migration's trigger inserts `email`. Column must be added to live DB before signup works.

**Why:** migrations were written iteratively; the fix migration assumed `email` column existed but no ALTER TABLE migration was included.

## AI parser
`src/lib/aiParser.ts` is a regex heuristic (no LLM). Handles common patterns: "Client: Name", "Email:", dollar-amount line items, "Net 30", "due in N days". Falls back to a blank item if nothing is parsed. Real LLM upgrade is a proposed follow-up task.

## Vite config
Must set `server.host: '0.0.0.0'`, `port: 5000`, `allowedHosts: true` for Replit proxy to work.

## Profile upsert
`updateProfile` uses upsert (not plain update) because the Supabase trigger that auto-creates the profile row can fail due to the missing `email` column, leaving some users with no profile row.
