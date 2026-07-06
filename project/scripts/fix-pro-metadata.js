/**
 * One-off: find the SmartInvoice Pro Plan product and ensure it has
 * metadata.plan = 'pro' so the checkout endpoint can locate it.
 */
import { getUncachableStripeClient } from '../stripeClient.js';

const stripe = await getUncachableStripeClient();

// Search by name — works even without metadata
const found = await stripe.products.search({
  query: "name:'SmartInvoice Pro Plan' AND active:'true'",
});

if (!found.data.length) {
  console.error('No active product named "SmartInvoice Pro Plan" found.');
  process.exit(1);
}

const product = found.data[0];
console.log(`Found: ${product.id}  current metadata:`, product.metadata);

if (product.metadata?.plan === 'pro') {
  console.log('metadata.plan already set to "pro" — nothing to do.');
  process.exit(0);
}

const updated = await stripe.products.update(product.id, {
  metadata: { ...product.metadata, plan: 'pro' },
});

console.log(`Updated ${updated.id}  new metadata:`, updated.metadata);
console.log('Done ✓');
