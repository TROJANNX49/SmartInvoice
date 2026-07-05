---
name: Stripe integration architecture
description: How Stripe checkout, webhooks, and billing portal are wired up in SmartInvoice AI with security hardening details.
---

## Key decisions

**No Replit connector** — user supplies STRIPE_SECRET_KEY as a Replit Secret; stripeClient.js reads process.env.STRIPE_SECRET_KEY directly.

**IDOR prevention** — /api/checkout and /api/portal call verifyAuth(req) which reads Authorization: Bearer <token>, calls supabase.auth.getUser(token) with the anon client, and derives userId from the verified JWT. The request body userId is ignored entirely.

**Webhook security** — STRIPE_WEBHOOK_SECRET required in production (NODE_ENV=production); dev-only bypass logs a loud warning. Without the secret in prod, webhook returns 400.

**Atomic idempotent credit processing** — process_credit_event() Postgres function (SECURITY DEFINER, plpgsql) does claim + increment in one transaction:
  1. INSERT into stripe_processed_events (p_event_id) — unique PK, raises unique_violation if duplicate
  2. UPDATE profiles SET credits = credits + p_amount WHERE id = p_user_id
  3. GET DIAGNOSTICS checks ROW_COUNT; RAISE EXCEPTION if 0 rows (user not found rolls back the INSERT too)
  4. EXCEPTION WHEN unique_violation -> return 'duplicate'
  No orphaned claims, no read-modify-write race, no double-crediting on retry.

**Webhook DB errors return 500** — all DB mutations throw on error; outer handler catches and returns 500 so Stripe retries.

**CheckoutSuccessPage** — status: 'polling' | 'confirmed' | 'pending'. isUpgradeApplied() compares against baselineRef snapshot taken on mount. Timeout -> 'pending' (not 'confirmed'). Auto-redirect only on 'confirmed'.

**Migration file** — project/migrations/20260705120000_stripe_processed_events.sql — must be run in Supabase before live webhooks are enabled. Contains both the stripe_processed_events table and the process_credit_event() function.

**Why:** Stripe retries webhooks multiple times; without atomicity and fail-closed behavior, transient DB errors lead to either orphaned event claims (user never gets credits) or duplicate credit grants.
