import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { getUncachableStripeClient } from './stripeClient.js';
import ws from 'ws';
import { fileURLToPath } from 'url';
import { dirname as pathDirname, join as pathJoin } from 'path';
import fs from 'fs';

const app = express();

// ── Supabase clients ──────────────────────────────────────────────────────────

// Options shared by all server-side Supabase clients.
// Node.js 20 has no native WebSocket — supply the 'ws' package so the
// Supabase SDK doesn't throw when initialising the Realtime transport.
const SUPABASE_SERVER_OPTS = {
  auth: { persistSession: false },
  realtime: { transport: ws },
};

/** Service-role client — bypasses RLS. Only used in webhook handler. */
function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  return createClient(url, key, SUPABASE_SERVER_OPTS);
}

/** Anon client — used only to verify user JWTs. */
function getSupabaseAnon() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key)
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required');
  return createClient(url, key, SUPABASE_SERVER_OPTS);
}

/**
 * Verify the Supabase JWT from `Authorization: Bearer <token>`.
 * Returns the authenticated Supabase user or throws a 401 error.
 */
async function verifyAuth(req) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) {
    const err = new Error('Missing or invalid Authorization header');
    err.status = 401;
    throw err;
  }
  const token = header.slice(7);
  const supabase = getSupabaseAnon();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    const err = new Error('Invalid or expired session');
    err.status = 401;
    throw err;
  }
  return user;
}

// ── Idempotency helper ────────────────────────────────────────────────────────

/**
 * Atomically claim a Stripe event AND increment credits in one DB transaction.
 *
 * Uses the `process_credit_event` Postgres function (see migration) so that:
 *   - Claim + increment are a single atomic unit — if the UPDATE fails, the
 *     INSERT rolls back too, and Stripe can retry cleanly.
 *   - Returns 'duplicate' when the event ID was already processed (idempotent).
 *   - Throws on any other DB error so the webhook handler returns 500 and
 *     Stripe retries instead of silently dropping the credit.
 *
 * Requires the stripe_processed_events migration to be applied first.
 */
async function processCreditEvent(supabase, { eventId, userId, amount, stripeCustomerId }) {
  const { data, error } = await supabase.rpc('process_credit_event', {
    p_event_id:           eventId,
    p_user_id:            userId,
    p_amount:             amount,
    p_stripe_customer_id: stripeCustomerId ?? null,
  });

  if (error) {
    // Fail closed — throw so Stripe retries. Common cause: migration not applied.
    throw new Error(
      `process_credit_event RPC failed (ensure the stripe_processed_events migration has been run): ${error.message}`
    );
  }

  return data; // 'ok' | 'duplicate'
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
    const isProd = process.env.NODE_ENV === 'production';

    let event;
    try {
      const stripe = await getUncachableStripeClient();

      if (webhookSecret && sig) {
        // Normal path: verify signature
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } else if (isProd) {
        // Production with no secret = reject. Never allow unverified events in prod.
        console.error('[webhook] STRIPE_WEBHOOK_SECRET is required in production');
        return res.status(400).json({ error: 'Webhook secret not configured' });
      } else {
        // Dev only: parse without verification and warn loudly
        event = JSON.parse(req.body.toString());
        console.warn(
          '[webhook] ⚠️  STRIPE_WEBHOOK_SECRET not set — skipping signature verification (dev only)'
        );
      }
    } catch (err) {
      console.error('[webhook] Signature/parse error:', err.message);
      return res.status(400).json({ error: err.message });
    }

    try {
      await handleStripeEvent(event);
      res.json({ received: true });
    } catch (err) {
      // Return 500 so Stripe will retry delivery
      console.error('[webhook] Handler error:', err.message);
      res.status(500).json({ error: 'Handler failed — will retry' });
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
        console.warn('[webhook] checkout.session.completed: no client_reference_id — skipping');
        break;
      }

      if (session.mode === 'subscription') {
        // Pro plan upgrade — subscriptions are naturally idempotent (same values)
        const { error } = await supabase
          .from('profiles')
          .update({
            subscription_tier: 'pro',
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);

        if (error) throw new Error(`Profile update failed: ${error.message}`);
        console.log(`[webhook] Upgraded user ${userId} → Pro`);

      } else if (session.mode === 'payment') {
        // Credit pack — atomically claim the event AND increment credits in one
        // DB transaction via process_credit_event(). If the increment fails, the
        // claim is also rolled back so Stripe can retry cleanly.
        const result = await processCreditEvent(supabase, {
          eventId:          event.id,
          userId,
          amount:           10,
          stripeCustomerId: session.customer,
        });

        if (result === 'duplicate') {
          console.log(`[webhook] Duplicate payment event ${event.id} — skipping`);
          break;
        }
        console.log(`[webhook] Added 10 credits to user ${userId}`);
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

      if (error) throw new Error(`Profile lookup failed: ${error.message}`);
      if (!profile) {
        console.warn('[webhook] subscription.deleted: customer not found — skipping');
        break;
      }

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({
          subscription_tier: 'free',
          stripe_subscription_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (updateErr) throw new Error(`Downgrade failed: ${updateErr.message}`);
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

      if (error) throw new Error(`Profile lookup failed: ${error.message}`);
      if (!profile) break;

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({
          subscription_tier: 'free',
          stripe_subscription_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (updateErr) throw new Error(`Downgrade failed: ${updateErr.message}`);
      console.log(`[webhook] Downgraded user ${profile.id} → Free (status: ${subscription.status})`);
      break;
    }

    default:
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
  "due_days": number | null,
  "due_date": "YYYY-MM-DD" | null
}

Rules:

ITEM EXTRACTION — this is the most important rule. You MUST create a separate line item for EVERY distinct billable entry mentioned in the notes. Never merge, skip, or omit any item. This includes:
  • All services performed (e.g. "custom reports", "consulting", "installation")
  • All physical goods or materials supplied
  • All fees and surcharges (e.g. "rush fee", "call-out fee", "delivery charge")
  • All discounts, credits, adjustments, and overpayments (as negative amounts)
  • All retainers, deposits, or advance payments applied
  Read the entire input carefully before writing the items array. If in doubt whether something is a line item, include it — do not leave it out.

- items[].total must equal quantity × unit_price (quantity × unit_price for negative items too)
- quantity must be a positive number; default to 1 if not specified
- unit_price CAN be negative for discounts, credits, overpayments, or refunds — NEVER return 0 for a mentioned amount
- For discounts/credits/deductions/overpayments: use a negative unit_price (e.g. "overpayment credit" → unit_price: -50, total: -50)
- If only a grand total is mentioned with no per-item breakdown, create ONE item: description = best guess at the work done, quantity = 1, unit_price = that total, total = that total
- payment_terms: use "Net 30" format when mentioned; otherwise ""
- due_date: if a SPECIFIC calendar date is mentioned (e.g. "30 july", "July 30", "30/07/2026"), return it as "YYYY-MM-DD". Assume the current year if no year is stated. Set due_days to null when due_date is set.
- due_days: use ONLY when no specific date is given — positive integer days until payment is due (e.g. "Net 30" → 30), or null
- All monetary values must be numbers, not strings
- client_email must be a valid email or ""
- client_name rules:
    • Use the COMPANY or JOB CLIENT name, NOT the greeting/recipient name
    • "Hi Sarah, invoice for the Henderson job" → client_name: "Henderson" (not "Sarah")
    • "Hey Mike, billing Acme Corp for this work" → client_name: "Acme Corp" (not "Mike")
    • If only a person's name appears as the client (no company), use that name
    • Extract from phrases like "for [Name]", "the [Name] project/job/site", "billing [Name]"
- client_address: extract any full or partial address (street, city, state, zip, or any location identifier) mentioned anywhere in the text; combine into one string; leave "" if none
- If a phone number is mentioned, include it in the notes field
- Leave truly unknown fields as "" or null — do not fabricate emails or addresses`;

function coerceItem(raw) {
  const qty = Math.max(0.001, Math.abs(Number(raw.quantity) || 1));
  const price = Number(raw.unit_price) || 0; // allow negative for discounts/credits
  const rawTotal = Number(raw.total);
  // Prefer AI-supplied total; fall back to qty × price (preserves sign for discounts)
  const total = Number.isFinite(rawTotal) ? rawTotal : qty * price;
  return {
    id: crypto.randomUUID(),
    description: String(raw.description ?? '').trim(),
    quantity: qty,
    unit_price: price,
    total,
  };
}

app.post('/api/parse-invoice', parseLimiter, async (req, res) => {
  const { text } = req.body;
  if (typeof text !== 'string' || !text.trim())
    return res.status(400).json({ error: 'text must be a non-empty string' });
  if (text.length > MAX_INPUT_LENGTH)
    return res.status(400).json({ error: `text must be ${MAX_INPUT_LENGTH} characters or fewer` });

  try {
    // Retry once on 429 (rate-limit) with a short back-off
    let completion;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: text },
          ],
          temperature: 0.1,
          max_tokens: 1000,
          response_format: { type: 'json_object' },
        });
        break; // success
      } catch (apiErr) {
        if (apiErr?.status === 429 && attempt < 2) {
          console.warn('[parse-invoice] 429 rate-limit — retrying in 3s');
          await new Promise((r) => setTimeout(r, 3000));
        } else {
          throw apiErr;
        }
      }
    }

    const rawContent = completion.choices[0].message.content?.trim() ?? '{}';
    console.log(`[parse-invoice] AI response received (${rawContent.length} chars)`);

    // Try direct parse first (normal path with response_format: json_object).
    // If the model wraps output in markdown fences, extract the first {...} block.
    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    }

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
      // Prefer a specific calendar date; fall back to relative days; never both.
      due_date: typeof parsed.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.due_date)
        ? parsed.due_date
        : null,
      due_days: (typeof parsed.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.due_date))
        ? null
        : (Number.isInteger(parsed.due_days) && parsed.due_days > 0 ? parsed.due_days : null),
    });
  } catch (err) {
    console.error('[parse-invoice] error:', err?.message ?? err);
    res.status(500).json({ error: err?.message ?? 'Parse failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Stripe Checkout — identity verified server-side via JWT
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/checkout', async (req, res) => {
  let authUser;
  try {
    authUser = await verifyAuth(req);
  } catch (err) {
    return res.status(err.status ?? 401).json({ error: err.message });
  }

  const { planId } = req.body;
  if (!planId)
    return res.status(400).json({ error: 'planId is required' });
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
      // Identity comes from the verified JWT, not the request body
      client_reference_id: authUser.id,
      customer_email: authUser.email ?? undefined,
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&plan=${planId}`,
      cancel_url: `${baseUrl}/pricing`,
      metadata: { userId: authUser.id, planId },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[checkout] error:', err?.message ?? err);
    res.status(500).json({ error: err?.message ?? 'Checkout failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Stripe Customer Portal — identity verified server-side via JWT
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/portal', async (req, res) => {
  let authUser;
  try {
    authUser = await verifyAuth(req);
  } catch (err) {
    return res.status(err.status ?? 401).json({ error: err.message });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', authUser.id)
      .single();

    if (error || !profile?.stripe_customer_id)
      return res.status(404).json({ error: 'No Stripe customer found for this account' });

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

// ─────────────────────────────────────────────────────────────────────────────
// 8. Static file serving
//    Serve the Vite build from dist/ whenever it exists.
//    In dev, requests arrive via the Vite proxy on port 5000 so the Express
//    server on port 3001 is API-only — static serving here is harmless.
//    In production, this is the only server so it must serve the frontend too.
// ─────────────────────────────────────────────────────────────────────────────
{
  const __dirname = pathDirname(fileURLToPath(import.meta.url));
  const distPath = pathJoin(__dirname, 'dist');

  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    // SPA fallback — let React Router handle client-side routes
    app.get('/{*path}', (_req, res) => res.sendFile(pathJoin(distPath, 'index.html')));
    console.log(`Serving static build from ${distPath}`);
  } else {
    console.log(`No dist/ build found — API-only mode (run "npm run build" to enable frontend)`);
  }
}

// In dev the API runs on 3001 (Vite proxies /api → here).
// In production Replit sets PORT for the autoscale runtime.
const PORT = process.env.PORT ?? process.env.API_PORT ?? 3001;
app.listen(PORT, () => console.log(`API server listening on port ${PORT}`));
