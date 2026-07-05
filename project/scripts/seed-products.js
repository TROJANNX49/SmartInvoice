/**
 * Seed Stripe products and prices for SmartInvoice AI.
 * Run once: node scripts/seed-products.js
 *
 * Products created:
 *   - Pro Plan  → $7/month subscription
 *   - Credit Pack → $5 one-time, 10 invoice credits
 */
import { getUncachableStripeClient } from '../stripeClient.js';

async function seed() {
  const stripe = await getUncachableStripeClient();
  console.log('Connected to Stripe ✓\n');

  // ── Pro Plan (subscription) ──────────────────────────────────────────────
  const existingPro = await stripe.products.search({
    query: "name:'SmartInvoice Pro Plan' AND active:'true'",
  });

  if (existingPro.data.length > 0) {
    const p = existingPro.data[0];
    console.log(`Pro Plan already exists → ${p.id}`);
    const prices = await stripe.prices.list({ product: p.id, active: true });
    prices.data.forEach((pr) =>
      console.log(`  price ${pr.id}  $${pr.unit_amount / 100}/${pr.recurring?.interval}`)
    );
  } else {
    const pro = await stripe.products.create({
      name: 'SmartInvoice Pro Plan',
      description: 'Unlimited invoices, custom branding, and priority support.',
      metadata: { plan: 'pro' },
    });
    const proPrice = await stripe.prices.create({
      product: pro.id,
      unit_amount: 700, // $7.00
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { plan: 'pro' },
    });
    console.log(`Created Pro Plan       → product ${pro.id}`);
    console.log(`Created Pro price      → ${proPrice.id}  ($7/month)`);
  }

  // ── Credit Pack (one-time) ───────────────────────────────────────────────
  const existingCredits = await stripe.products.search({
    query: "name:'SmartInvoice Credit Pack' AND active:'true'",
  });

  if (existingCredits.data.length > 0) {
    const p = existingCredits.data[0];
    console.log(`Credit Pack already exists → ${p.id}`);
    const prices = await stripe.prices.list({ product: p.id, active: true });
    prices.data.forEach((pr) =>
      console.log(`  price ${pr.id}  $${pr.unit_amount / 100} one-time`)
    );
  } else {
    const credits = await stripe.products.create({
      name: 'SmartInvoice Credit Pack',
      description: '10 invoice credits — no subscription, credits never expire.',
      metadata: { plan: 'credits', credits: '10' },
    });
    const creditsPrice = await stripe.prices.create({
      product: credits.id,
      unit_amount: 500, // $5.00
      currency: 'usd',
      metadata: { plan: 'credits', credits: '10' },
    });
    console.log(`Created Credit Pack    → product ${credits.id}`);
    console.log(`Created Credits price  → ${creditsPrice.id}  ($5 one-time)`);
  }

  console.log('\nDone ✓');
}

seed().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
