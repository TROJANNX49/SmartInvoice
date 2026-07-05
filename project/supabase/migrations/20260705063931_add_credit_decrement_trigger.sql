/*
# Add Credit Decrement Trigger

## Summary
Automatically decrements a user's credits when they create a new invoice, 
unless they are on the 'pro' subscription tier (unlimited invoices).

## Changes
- New function `decrement_credits_on_invoice_create()` that runs after invoice insert
- New trigger `on_invoice_created` on invoices table

## Security
- Function runs as SECURITY DEFINER to bypass RLS for the profile update
- Only decrements if credits > 0 and user is not on 'pro' tier

## Notes
1. Pro users have unlimited invoice creation (no credit decrement)
2. Free users start with 3 credits and lose 1 per invoice created
3. Credits cannot go below 0
*/

CREATE OR REPLACE FUNCTION public.decrement_credits_on_invoice_create()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET credits = credits - 1,
      updated_at = now()
  WHERE id = NEW.user_id
    AND subscription_tier != 'pro'
    AND credits > 0;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_invoice_created ON invoices;
CREATE TRIGGER on_invoice_created
  AFTER INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION public.decrement_credits_on_invoice_create();
