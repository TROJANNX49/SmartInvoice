import { InvoiceItem } from './api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedInvoice {
  client_name: string;
  client_email: string;
  client_address: string;
  items: InvoiceItem[];
  notes: string;
  payment_terms: string;
  due_days: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function generateInvoiceNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `${year}${month}-${random}`;
}

// ─── LLM Parser (calls server-side API) ──────────────────────────────────────

/**
 * Parses raw freeform notes into structured invoice data via the
 * server-side /api/parse-invoice endpoint (backed by OpenAI gpt-4o-mini).
 * Falls back to the regex heuristic parser if the API call fails.
 */
export async function parseRawNotesWithAI(
  rawText: string,
  signal?: AbortSignal,
): Promise<ParsedInvoice> {
  try {
    const res = await fetch('/api/parse-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: rawText }),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? `API error ${res.status}`);
    }

    const data = await res.json();

    // Ensure items array is populated even if LLM returned nothing
    const items: InvoiceItem[] =
      Array.isArray(data.items) && data.items.length > 0
        ? data.items
        : [{ id: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0, total: 0 }];

    return {
      client_name: data.client_name ?? '',
      client_email: data.client_email ?? '',
      client_address: data.client_address ?? '',
      items,
      notes: data.notes ?? '',
      payment_terms: data.payment_terms ?? '',
      due_days: typeof data.due_days === 'number' ? data.due_days : null,
    };
  } catch (err) {
    // Don't fall back on user-initiated cancellation
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    console.warn('[aiParser] API call failed, falling back to regex:', err);
    return parseRawNotesRegex(rawText);
  }
}

// ─── Regex Fallback Parser ────────────────────────────────────────────────────

/**
 * Local regex heuristic parser used as a fallback when the API is unavailable.
 */
function parseRawNotesRegex(rawText: string): ParsedInvoice {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);

  // ── Client info ────────────────────────────────────────────────────────────
  let client_name = '';
  let client_email = '';
  let client_address = '';

  for (const line of lines) {
    if (!client_name && /^client\s*[:：]\s*/i.test(line)) {
      client_name = line.replace(/^client\s*[:：]\s*/i, '').trim();
      continue;
    }
    if (!client_email && /^(?:email|e-mail)\s*[:：]\s*/i.test(line)) {
      client_email = line.replace(/^(?:email|e-mail)\s*[:：]\s*/i, '').trim();
      continue;
    }
    if (!client_address && /^(?:address|addr|location)\s*[:：]\s*/i.test(line)) {
      client_address = line.replace(/^(?:address|addr|location)\s*[:：]\s*/i, '').trim();
      continue;
    }
    if (!client_email) {
      const emailMatch = line.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
      if (emailMatch) client_email = emailMatch[0];
    }
  }

  // ── Line items ─────────────────────────────────────────────────────────────
  const items: InvoiceItem[] = [];

  const skipPrefixes = [
    /^client\s*[:：]/i,
    /^email\s*[:：]/i,
    /^address\s*[:：]/i,
    /^notes?\s*[:：]/i,
    /^terms?\s*[:：]/i,
    /^payment\s*(?:due|terms?)\s*[:：]/i,
    /^(?:due\s*(?:date|in)|payment due)\s*/i,
    /^work\s*done/i,
    /^services?\s*(?:provided)?[:：]/i,
  ];

  for (const line of lines) {
    if (skipPrefixes.some((p) => p.test(line))) continue;
    if (/^[A-Za-z\s]+:$/.test(line)) continue;

    // "Task (5 hours) at $100/hr: $500"
    const hourMatch = line.match(
      /^[-•*]?\s*(.+?)\s+\((\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\)\s+(?:at|@)\s+\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/hr)?\s*[:–-]?\s*\$\s*([\d,]+(?:\.\d{1,2})?)?/i
    );
    if (hourMatch) {
      const desc = hourMatch[1].trim();
      const qty = parseFloat(hourMatch[2]);
      const rate = parseFloat(hourMatch[3].replace(/,/g, ''));
      const total = hourMatch[4] ? parseFloat(hourMatch[4].replace(/,/g, '')) : qty * rate;
      if (desc && qty > 0 && rate > 0) {
        items.push({ id: crypto.randomUUID(), description: desc, quantity: qty, unit_price: rate, total });
        continue;
      }
    }

    // "Description: $amount"
    const simpleMatch = line.match(/^[-•*]?\s*(.+?)[\s\-–:]+\$\s*([\d,]+(?:\.\d{1,2})?)\s*$/);
    if (simpleMatch) {
      const desc = simpleMatch[1].trim();
      const amount = parseFloat(simpleMatch[2].replace(/,/g, ''));
      if (desc && amount > 0 && !skipPrefixes.some((p) => p.test(desc))) {
        items.push({ id: crypto.randomUUID(), description: desc, quantity: 1, unit_price: amount, total: amount });
        continue;
      }
    }

    // "N x $price" or "N @ $price"
    const multiplyMatch = line.match(/^[-•*]?\s*(.+?)\s+(\d+(?:\.\d+)?)\s*[x×@]\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (multiplyMatch) {
      const desc = multiplyMatch[1].trim();
      const qty = parseFloat(multiplyMatch[2]);
      const rate = parseFloat(multiplyMatch[3].replace(/,/g, ''));
      if (desc && qty > 0 && rate > 0) {
        items.push({ id: crypto.randomUUID(), description: desc, quantity: qty, unit_price: rate, total: qty * rate });
      }
    }
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  let notes = '';
  for (const line of lines) {
    if (/^notes?\s*[:：]/i.test(line)) {
      notes = line.replace(/^notes?\s*[:：]\s*/i, '').trim();
    }
  }

  // ── Payment terms / due days ───────────────────────────────────────────────
  let payment_terms = '';
  let due_days: number | null = null;

  for (const line of lines) {
    const dueDaysMatch = line.match(/(?:payment\s+)?due\s+in\s+(\d+)\s+days?/i);
    if (dueDaysMatch) due_days = parseInt(dueDaysMatch[1], 10);

    const netMatch = line.match(/\bnet[-\s]?(\d+)\b/i);
    if (netMatch) {
      payment_terms = `Net ${netMatch[1]}`;
      if (!due_days) due_days = parseInt(netMatch[1], 10);
    }

    if (/^(?:payment\s+)?terms?\s*[:：]/i.test(line)) {
      payment_terms = line.replace(/^(?:payment\s+)?terms?\s*[:：]\s*/i, '').trim();
    }
  }

  if (items.length === 0) {
    items.push({ id: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0, total: 0 });
  }

  return { client_name, client_email, client_address, items, notes, payment_terms, due_days };
}
