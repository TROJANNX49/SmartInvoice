import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';

const app = express();

// ── CORS: only allow same-host Vite proxy requests ───────────────────────────
// In dev the Vite proxy forwards from localhost; in production restrict to the
// actual deployed domain via the REPLIT_DOMAINS env var.
const allowedOrigins = new Set([
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  ...(process.env.REPLIT_DOMAINS ? process.env.REPLIT_DOMAINS.split(',').map(d => `https://${d.trim()}`) : []),
]);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (server-to-server, curl) only in dev
    if (!origin) return cb(null, process.env.NODE_ENV !== 'production');
    if (allowedOrigins.has(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['POST', 'GET'],
}));

app.use(express.json({ limit: '64kb' }));

// ── Rate limiting: 30 parse requests per minute per IP ───────────────────────
const parseLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please wait a moment and try again.' },
});

// ── OpenAI client ─────────────────────────────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MAX_INPUT_LENGTH = 4_000; // characters

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
- items[].total must equal quantity × unit_price (compute it yourself if not stated)
- quantity must be a positive number; default to 1 if not specified
- unit_price must be a non-negative number
- payment_terms: use "Net 30" format when mentioned; otherwise empty string ""
- due_days: positive integer days until payment is due, or null if not specified
- All monetary values must be numbers, not strings
- client_email must be a valid email or empty string ""
- notes: any extra context that doesn't fit elsewhere; often ""
- Never invent data — if something is absent leave it blank / null`;

// ── Helper: coerce and validate a single item from the LLM ───────────────────
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

// ── POST /api/parse-invoice ───────────────────────────────────────────────────
app.post('/api/parse-invoice', parseLimiter, async (req, res) => {
  const { text } = req.body;

  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text must be a non-empty string' });
  }
  if (text.length > MAX_INPUT_LENGTH) {
    return res.status(400).json({ error: `text must be ${MAX_INPUT_LENGTH} characters or fewer` });
  }

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

    const items = Array.isArray(parsed.items) && parsed.items.length > 0
      ? parsed.items.map(coerceItem)
      : [];

    res.json({
      client_name: String(parsed.client_name ?? '').trim(),
      client_email: String(parsed.client_email ?? '').trim(),
      client_address: String(parsed.client_address ?? '').trim(),
      items,
      notes: String(parsed.notes ?? '').trim(),
      payment_terms: String(parsed.payment_terms ?? '').trim(),
      due_days: Number.isInteger(parsed.due_days) && parsed.due_days > 0
        ? parsed.due_days
        : null,
    });
  } catch (err) {
    console.error('[parse-invoice] error:', err?.message ?? err);
    res.status(500).json({ error: err?.message ?? 'Parse failed' });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.API_PORT ?? 3001;
app.listen(PORT, () => console.log(`API server listening on port ${PORT}`));
