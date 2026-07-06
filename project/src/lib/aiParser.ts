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
 * Local regex heuristic parser — fallback when the API is unavailable.
 * Handles structured lists AND natural-language prose paragraphs.
 */
function parseRawNotesRegex(rawText: string): ParsedInvoice {
  // Split into clauses: newlines + sentence boundaries + comma-separated phrases
  const clauses = rawText
    .split(/\n|(?<=[.!?])\s+|,\s+/)
    .map((c) => c.trim())
    .filter(Boolean);

  // Work on the full text for broad pattern searches too
  const full = rawText;

  // ── Client info ────────────────────────────────────────────────────────────
  let client_name = '';
  let client_email = '';
  let client_address = '';

  // Email anywhere in text
  const emailMatch = full.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  if (emailMatch) client_email = emailMatch[0];

  for (const clause of clauses) {
    // Structured "Client: Name"
    if (!client_name) {
      const m = clause.match(/^client\s*[:：]\s*(.+)/i);
      if (m) { client_name = m[1].trim(); continue; }
    }
    if (!client_email) {
      const m = clause.match(/^(?:email|e-mail)\s*[:：]\s*(.+)/i);
      if (m) { client_email = m[1].trim(); continue; }
    }
    if (!client_address) {
      const m = clause.match(/^(?:address|addr|location)\s*[:：]\s*(.+)/i);
      if (m) { client_address = m[1].trim(); continue; }
    }

    // Natural language: "for [Name] site/project/job", "billing [Name]", "invoice for [Name]"
    if (!client_name) {
      // Allow initials with dots: J. Smith, A.B. Corp
      const nameRe = /[A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*)*/;
      const patterns = [
        // "for the Henderson job" / "for J. Smith site"
        new RegExp(`\\bfor\\s+(?:the\\s+)?(${nameRe.source})\\s*(?:site|project|job|account|client|company)?\\b`),
        // "billing Acme Corp" / "invoice for Acme"
        new RegExp(`\\b(?:billing|invoicing)\\s+(${nameRe.source})\\b`, 'i'),
        // "the Acme project/job"
        new RegExp(`\\bthe\\s+(${nameRe.source})\\s+(?:site|project|job|account)\\b`, 'i'),
      ];
      for (const pat of patterns) {
        const m = clause.match(pat);
        if (m) {
          const candidate = m[1].trim();
          if (!/^(this|the|a|an|our|your|their|that|which|my|his|her|work)$/i.test(candidate)) {
            client_name = candidate;
            break;
          }
        }
      }
    }
  }

  // ── Address extraction ──────────────────────────────────────────────────────
  // Look for street address patterns in the full text
  if (!client_address) {
    const addrMatch = full.match(
      /\b(\d+\s+[A-Za-z0-9\s,.]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl)\b[A-Za-z0-9\s,.-]*(?:[A-Z]{2}\s+\d{5}(?:-\d{4})?)?)/i
    );
    if (addrMatch) client_address = addrMatch[1].trim();
  }

  // ── Line items ─────────────────────────────────────────────────────────────
  const items: InvoiceItem[] = [];

  const skipPattern = /^(?:client|email|e-mail|address|addr|location|notes?|terms?|payment\s+(?:due|terms?)|due\s+(?:date|in)|work\s+done|services?\s*(?:provided)?)\s*[:：]/i;

  for (const clause of clauses) {
    if (skipPattern.test(clause)) continue;
    // Skip pure-heading lines like "Line Items:"
    if (/^[A-Za-z\s]+:$/.test(clause)) continue;

    // ── Pattern 1: "N hours of TASK at $RATE/hr" (natural language)
    // e.g. "4 hours of structural welding at $85/hr"
    const nlHourMatch = clause.match(
      /(\d+(?:\.\d+)?)\s+hours?\s+(?:of\s+)?(.+?)\s+at\s+\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/\s*hr)?/i
    );
    if (nlHourMatch) {
      const qty = parseFloat(nlHourMatch[1]);
      const desc = nlHourMatch[2].trim();
      const rate = parseFloat(nlHourMatch[3].replace(/,/g, ''));
      if (qty > 0 && rate > 0) {
        items.push({ id: crypto.randomUUID(), description: desc, quantity: qty, unit_price: rate, total: qty * rate });
        continue;
      }
    }

    // ── Pattern 2: "TASK (N hours) at $RATE/hr" (structured)
    const structHourMatch = clause.match(
      /(.+?)\s+\((\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\)\s+(?:at|@)\s+\$\s*([\d,]+(?:\.\d{1,2})?)/i
    );
    if (structHourMatch) {
      const desc = structHourMatch[1].trim();
      const qty = parseFloat(structHourMatch[2]);
      const rate = parseFloat(structHourMatch[3].replace(/,/g, ''));
      if (desc && qty > 0 && rate > 0) {
        items.push({ id: crypto.randomUUID(), description: desc, quantity: qty, unit_price: rate, total: qty * rate });
        continue;
      }
    }

    // ── Pattern 3: "N ITEM ($PRICE each)" or "N ITEM at $PRICE each"
    // e.g. "2 heavy-duty steel beams ($400 each)"
    const eachMatch = clause.match(
      /(\d+(?:\.\d+)?)\s+(.+?)\s+(?:\(\s*)?\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:each|\s*\/\s*(?:unit|ea|pc))[\s)]/i
    );
    if (eachMatch) {
      const qty = parseFloat(eachMatch[1]);
      const desc = eachMatch[2].trim().replace(/[,.]$/, '');
      const rate = parseFloat(eachMatch[3].replace(/,/g, ''));
      if (qty > 0 && rate > 0) {
        items.push({ id: crypto.randomUUID(), description: desc, quantity: qty, unit_price: rate, total: qty * rate });
        continue;
      }
    }

    // ── Pattern 4: discount / credit (negative items)
    // e.g. "giving a $100 discount", "crediting back $30", "$50 credit"
    const discountMatch = clause.match(
      /(?:giving?\s+(?:a\s+)?\$\s*([\d,]+(?:\.\d{1,2})?)\s*discount|discount\s+(?:of\s+)?\$\s*([\d,]+(?:\.\d{1,2})?)|deduct(?:ing)?\s+\$\s*([\d,]+(?:\.\d{1,2})?)|\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:off|discount))/i
    );
    if (discountMatch) {
      const raw = discountMatch[1] || discountMatch[2] || discountMatch[3] || discountMatch[4];
      const amount = parseFloat(raw.replace(/,/g, ''));
      if (amount > 0) {
        // Extract a label from the clause
        const label = clause.replace(/\$[\d,.]+/g, '').replace(/\b(giving?|a|the|for|because|of|due\s+to)\b/gi, '').trim().replace(/[.,!?]+$/, '').trim() || 'Discount';
        items.push({ id: crypto.randomUUID(), description: label, quantity: 1, unit_price: -amount, total: -amount });
        continue;
      }
    }

    const creditMatch = clause.match(
      /(?:credit(?:ing)?\s+(?:back\s+)?\$\s*([\d,]+(?:\.\d{1,2})?)|refund(?:ing)?\s+\$\s*([\d,]+(?:\.\d{1,2})?)|\$\s*([\d,]+(?:\.\d{1,2})?)\s*credit)/i
    );
    if (creditMatch) {
      const raw = creditMatch[1] || creditMatch[2] || creditMatch[3];
      const amount = parseFloat(raw.replace(/,/g, ''));
      if (amount > 0) {
        const label = clause.replace(/\$[\d,.]+/g, '').replace(/\b(we|i|the|a|an|some|old|for|that|recovered|crediting|back)\b/gi, '').trim().replace(/[.,!?]+$/, '').trim() || 'Credit';
        items.push({ id: crypto.randomUUID(), description: label, quantity: 1, unit_price: -amount, total: -amount });
        continue;
      }
    }

    // ── Pattern 5: "N x $price" or "N @ $price"
    const multiplyMatch = clause.match(
      /^[-•*]?\s*(.+?)\s+(\d+(?:\.\d+)?)\s*[x×@]\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i
    );
    if (multiplyMatch) {
      const desc = multiplyMatch[1].trim();
      const qty = parseFloat(multiplyMatch[2]);
      const rate = parseFloat(multiplyMatch[3].replace(/,/g, ''));
      if (desc && qty > 0 && rate > 0) {
        items.push({ id: crypto.randomUUID(), description: desc, quantity: qty, unit_price: rate, total: qty * rate });
        continue;
      }
    }

    // ── Pattern 6: "ITEM which was/cost/priced at $AMOUNT" (prose amount)
    // e.g. "a batch of MIG wire which was $50"
    const proseAmountMatch = clause.match(
      /(.+?)\s+(?:which\s+was|costs?\s*(?:us)?|priced?\s+at|worth|totaling?|came?\s+to)\s+\$\s*([\d,]+(?:\.\d{1,2})?)/i
    );
    if (proseAmountMatch) {
      const desc = proseAmountMatch[1].replace(/^(?:a|an|the|some|that|this)\s+/i, '').trim();
      const amount = parseFloat(proseAmountMatch[2].replace(/,/g, ''));
      if (desc && amount > 0 && !skipPattern.test(desc)) {
        items.push({ id: crypto.randomUUID(), description: desc, quantity: 1, unit_price: amount, total: amount });
        continue;
      }
    }

    // ── Pattern 7: simple "DESCRIPTION: $amount" or "DESCRIPTION — $amount"
    const simpleMatch = clause.match(
      /^[-•*]?\s*(.+?)[\s\-–:]+\$\s*([\d,]+(?:\.\d{1,2})?)\s*$/
    );
    if (simpleMatch) {
      const desc = simpleMatch[1].trim();
      const amount = parseFloat(simpleMatch[2].replace(/,/g, ''));
      if (desc && amount > 0 && !skipPattern.test(desc)) {
        items.push({ id: crypto.randomUUID(), description: desc, quantity: 1, unit_price: amount, total: amount });
      }
    }
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  let notes = '';
  for (const clause of clauses) {
    const m = clause.match(/^notes?\s*[:：]\s*(.+)/i);
    if (m) { notes = m[1].trim(); break; }
  }

  // ── Payment terms / due days ───────────────────────────────────────────────
  let payment_terms = '';
  let due_days: number | null = null;

  const dueDaysMatch = full.match(/(?:payment\s+)?due\s+in\s+(\d+)\s+days?/i);
  if (dueDaysMatch) due_days = parseInt(dueDaysMatch[1], 10);

  const netMatch = full.match(/\bnet[-\s]?(\d+)\b/i);
  if (netMatch) {
    payment_terms = `Net ${netMatch[1]}`;
    if (!due_days) due_days = parseInt(netMatch[1], 10);
  }

  const termsMatch = full.match(/^(?:payment\s+)?terms?\s*[:：]\s*(.+)/im);
  if (termsMatch) payment_terms = termsMatch[1].trim();

  if (items.length === 0) {
    items.push({ id: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0, total: 0 });
  }

  return { client_name, client_email, client_address, items, notes, payment_terms, due_days };
}
