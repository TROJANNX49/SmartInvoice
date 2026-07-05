-- ─────────────────────────────────────────────────────────────────────────────
-- Stripe webhook idempotency + atomic credit processing
-- Run in the Supabase SQL editor or via the CLI before enabling live webhooks.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Idempotency table: one row per successfully processed Stripe event ID.
CREATE TABLE IF NOT EXISTS stripe_processed_events (
  id         TEXT        PRIMARY KEY,          -- Stripe event ID (evt_...)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stripe_processed_events_created_at_idx
  ON stripe_processed_events (created_at);

-- 2. Atomic credit-event processing function.
--
--    Claim + increment happen inside ONE transaction:
--      • If another handler already claimed this event → unique_violation caught
--        inside the function → returns 'duplicate' with no side effects.
--      • If the UPDATE fails for any reason → the INSERT is also rolled back,
--        so Stripe can retry and the next attempt will claim the event fresh.
--
--    This eliminates the claim-before-increment race where a transient DB error
--    after INSERT would permanently block retries.
--
CREATE OR REPLACE FUNCTION process_credit_event(
  p_event_id           TEXT,
  p_user_id            UUID,
  p_amount             INT,
  p_stripe_customer_id TEXT DEFAULT NULL
)
RETURNS TEXT            -- 'ok' | 'duplicate'
LANGUAGE plpgsql
SECURITY DEFINER        -- runs as function owner, bypasses RLS on both tables
AS $
DECLARE
  v_rowcount INT;
BEGIN
  -- Attempt to claim the event.  Raises unique_violation if already processed,
  -- which is caught below and returned as 'duplicate' with no side effects.
  INSERT INTO stripe_processed_events (id) VALUES (p_event_id);

  -- Atomic increment — no read-modify-write race possible.
  UPDATE profiles
  SET
    credits            = credits + p_amount,
    stripe_customer_id = COALESCE(p_stripe_customer_id, stripe_customer_id),
    updated_at         = NOW()
  WHERE id = p_user_id;

  -- Verify the UPDATE actually hit a row.  If the user doesn't exist the
  -- INSERT above is rolled back automatically (we're in a transaction) and
  -- Stripe can retry safely — no orphaned claim.
  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount <> 1 THEN
    RAISE EXCEPTION 'User % not found — credits not applied', p_user_id;
  END IF;

  RETURN 'ok';

EXCEPTION
  WHEN unique_violation THEN
    -- Event already successfully processed; idempotent no-op.
    RETURN 'duplicate';
  -- All other exceptions propagate, rolling back the INSERT too.
END;
$;

-- Restrict execute to service_role only (webhook server uses service-role key)
REVOKE EXECUTE ON FUNCTION process_credit_event(TEXT, UUID, INT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION process_credit_event(TEXT, UUID, INT, TEXT) TO service_role;
