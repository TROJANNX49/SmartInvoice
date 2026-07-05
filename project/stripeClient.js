/**
 * Stripe client — uses STRIPE_SECRET_KEY environment variable (Replit Secret).
 * Called as a function so each call gets a fresh instance (mirrors the old
 * connector pattern so all callers stay unchanged).
 */
export async function getUncachableStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Add it as a Replit Secret in the Secrets tab.'
    );
  }
  const { default: Stripe } = await import('stripe');
  return new Stripe(key, { apiVersion: '2025-05-28.basil' });
}
