import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { getUncachableStripeClient } from './stripeClient.js';

const app = express();

// ── Supabase admin client (service role, bypasses RLS) ────────────────────────
function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Stripe webhook — MUST be registered BEFORE express.json()
//    Uses express.raw() so Stripe can verify the raw body signature.
// ─────────────────────────────────────────────────────────────────────────────
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      const stripe = await getUncachableStripeClient();
      if (webhookSecret && sig) {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } else {
        // No secret configured — parse without verification (dev only)
        event = JSON.parse(req.body.toString());
        console.warn('[webhook] STRIPE_WEBHOOK_SECRET not set — skipping signature verification');
      }
    } catch (err) {
      console.error('[webhook] Signature error:', err.message);
      return res.status(400).json({ error: err.message });
    }

    try {
      await handleStripeEvent(event);
      res.json({ received: true });
    } catch (err) {
      console.error('[webhook] Handler error:', err.message);
      res.status(500).json({ error: 'Handler failed' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Stripe event handler
// ─────────────────────────────────────────────────────────────────────────────
async function handleStripeEvent(event) {
  const supabase = getSupabaseAdmin();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.client_reference_id;
      if (!userId) {
        console.warn('[webhook] checkout.session.completed: no client_reference_id');
        break;
      }

      if (session.mode === 'subscription') {
        // Pro plan upgrade
        const { error } = await supabase
          .from('profiles')
          .update({
            subscription_tier: 'pro',
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);
        if (error) console.error('[webhook] profile update error:', error.message);
        else console.log(`[webhook] Upgraded user ${userId} → Pro`);
      } else if (session.mode === 'payment') {
        // Credit pack — add 10 credits
        const { data: profile, error: fetchErr } = await supabase
          .from('profiles')
          .select('credits')
          .eq('id', userId)
          .single();
        if (fetchErr) { console.error('[webhook] fetch credits error:', fetchErr.message); break; }

        const newCredits = (profile?.credits ?? 0) + 10;
        const { error } = await supabase
          .from('profiles')
          .update({
            credits: newCredits,
            stripe_customer_id: session.customer,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);
        if (error) console.error('[webhook] credits update error:', error.message);
        else console.log(`[webhook] Added 10 credits to user ${userId} (total: ${newCredits})`);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', subscription.customer)
        .maybeSingle();
      if (error) { console.error('[webhook] lookup error:', error.message); break; }
      if (!profile) { console.warn('[webhook] subscription.deleted: customer not found'); break; }

      await supabase
        .from('profiles')
        .update({
          subscription_tier: 'free',
          stripe_subscription_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);
      console.log(`[webhook] Downgraded user ${profile.id} → Free (subscription deleted)`);
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      if (!['canceled', 'unpaid', 'past_due'].includes(subscription.status)) break;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', subscription.customer)
        .maybeSingle();
      if (error) { console.error('[webhook] lookup error:', error.message); break; }
      if (!profile) break;

      await supabase
        .from('profiles')
        .update({
          subscription_tier: 'free',
          stripe_subscription_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);
      console.log(`[webhook] Downgraded user ${profile.id} → Free (status: ${subscription.status})`);
      break;
    }

    default:
      // Ignore unhandled events
      break;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Middleware (applied AFTER webhook route)
// ─────────────────────────────────────────────────────────────────────────────
const allowedOrigins = new Set([
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  ...(process.env.REPLIT_DOMAINS
    ? process.env.REPLIT_DOMAINS.split(',').map((d) => `https://${d.trim()}`)
    : []),
]);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, process.env.NODE_ENV !== 'production');
      if (allowedOrigins.has(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ['POST', 'GET'],
  })
);
app.use(express.json({ limit: '64kb' }));

// ─────────────────────────────────────────────────────────────────────────────
// 4. AI Parse endpoint
// ─────────────────────────────────────────────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MAX_INPUT_LENGTH = 4_000;

const parseLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please wait a moment.' },
});

const SYSTEM_PROMPT = `You are an expert invoice parser. Extract structured invoice data from raw freeform notes and return ONLY valid JSON — no markdown, no code fences, no explanatory text.

Return exactly this shape:
{
  "client_name": "string",
  "client_email": "string",
  "client_address": "string",
  "items": [
    {
      "description": "string",
      "quantity": number,
      "unit_price": number,
      "total": number
    }
  ],
  "notes": "string",
  "payment_terms": "string",
  "due_days": number | null
}

Rules:
- items[].total must equal quantity × unit_price
- quantity must be a positive number; default to 1 if not specified
- unit_price must be a non-negative number
- payment_terms: use "Net 30" format when mentioned; otherwise ""
- due_days: positive integer days until payment is due, or null
- All monetary values must be numbers, not strings
- client_email must be a valid email or ""
- Never invent data — leave missing fields blank/null`;

function coerceItem(raw) {
  const qty = Math.max(0.001, Math.abs(Number(raw.quantity) || 1));
  const price = Math.max(0, Number(raw.unit_price) || 0);
  const total = Number(raw.total);
  return {
    id: crypto.randomUUID(),
    description: String(raw.description ?? '').trim(),
    quantity: qty,
    unit_price: price,
    total: Number.isFinite(total) && total >= 0 ? total : qty * price,
  };
}

app.post('/api/parse-invoice', parseLimiter, async (req, res) => {
  const { text } = req.body;
  if (typeof text !== 'string' || !text.trim())
    return res.status(400).json({ error: 'text must be a non-empty string' });
  if (text.length > MAX_INPUT_LENGTH)
    return res.status(400).json({ error: `text must be ${MAX_INPUT_LENGTH} characters or fewer` });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0].message.content?.trim() ?? '{}';
    const parsed = JSON.parse(raw);

    const items =
      Array.isArray(parsed.items) && parsed.items.length > 0
        ? parsed.items.map(coerceItem)
        : [];

    res.json({
      client_name: String(parsed.client_name ?? '').trim(),
      client_email: String(parsed.client_email ?? '').trim(),
      client_address: String(parsed.client_address ?? '').trim(),
      items,
      notes: String(parsed.notes ?? '').trim(),
      payment_terms: String(parsed.payment_terms ?? '').trim(),
      due_days:
        Number.isInteger(parsed.due_days) && parsed.due_days > 0 ? parsed.due_days : null,
    });
  } catch (err) {
    console.error('[parse-invoice] error:', err?.message ?? err);
    res.status(500).json({ error: err?.message ?? 'Parse failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Stripe Checkout — create a Checkout Session and return the redirect URL
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/checkout', async (req, res) => {
  const { planId, userId, userEmail } = req.body;
  if (!planId || !userId)
    return res.status(400).json({ error: 'planId and userId are required' });
  if (!['pro', 'credits'].includes(planId))
    return res.status(400).json({ error: 'planId must be "pro" or "credits"' });

  try {
    const stripe = await getUncachableStripeClient();

    // Find active product by plan metadata
    const products = await stripe.products.search({
      query: `metadata['plan']:'${planId}' AND active:'true'`,
    });
    if (!products.data.length)
      return res.status(404).json({
        error: `No Stripe product found for plan "${planId}". Run: node scripts/seed-products.js`,
      });

    const product = products.data[0];
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 1 });
    if (!prices.data.length)
      return res.status(404).json({ error: `No active price for product ${product.id}` });

    const price = prices.data[0];
    const mode = price.recurring ? 'subscription' : 'payment';

    const baseUrl = process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
      : 'http://localhost:5000';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: price.id, quantity: 1 }],
      mode,
      client_reference_id: userId,
      ...(userEmail ? { customer_email: userEmail } : {}),
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&plan=${planId}`,
      cancel_url: `${baseUrl}/pricing`,
      metadata: { userId, planId },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[checkout] error:', err?.message ?? err);
    res.status(500).json({ error: err?.message ?? 'Checkout failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Stripe Customer Portal — manage subscription / cancel
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/portal', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  try {
    const supabase = getSupabaseAdmin();
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (error || !profile?.stripe_customer_id)
      return res.status(404).json({ error: 'No Stripe customer found for this user' });

    const stripe = await getUncachableStripeClient();
    const baseUrl = process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
      : 'http://localhost:5000';

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${baseUrl}/pricing`,
    });

    res.json({ url: portalSession.url });
  } catch (err) {
    console.error('[portal] error:', err?.message ?? err);
    res.status(500).json({ error: err?.message ?? 'Portal session failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Health check
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.API_PORT ?? 3001;
app.listen(PORT, () => console.log(`API server listening on port ${PORT}`));
