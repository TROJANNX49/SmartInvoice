/*
# Fix handle_new_user trigger

## Summary
Updates the `handle_new_user()` trigger function to include the `email` field
when auto-creating a profile on signup. The `profiles.email` column is NOT NULL,
so omitting it caused the trigger to fail.

## Changes
- Updated `handle_new_user()` to insert `email` from `NEW.email`
- Set `credits` to 3 for new users (matching original app behavior)

## Security
- No policy changes. Function remains SECURITY DEFINER.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, credits)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL),
    3
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;