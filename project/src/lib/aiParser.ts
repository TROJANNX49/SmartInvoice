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
  due_date?: string; // ISO YYYY-MM-DD, takes priority over due_days when set
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
      due_date: typeof data.due_date === 'string' ? data.due_date : undefined,
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

    // Natural language name extraction — require the site/project/job keyword so we
    // don't accidentally swallow surrounding words into the name.
    if (!client_name) {
      const SKIP_NAMES = /^(this|the|a|an|our|your|their|that|which|my|his|her|work|project|invoice|estimate)$/i;
      // Token: alphanumeric + underscores/dashes/dots (handles layzX, J., A.B.C)
      const tok = '[A-Za-z0-9][A-Za-z0-9_.\\-]*';
      const nameCapture = `(${tok}(?:\\s+${tok})?)`;  // 1–2 tokens only
      const siteKw = '(?:site|project|job|account|client|company)';
      const namePatterns = [
        // "for the layzX site" / "for J. Smith project" (site keyword REQUIRED)
        new RegExp(`\\bfor\\s+(?:the\\s+)?${nameCapture}\\s+${siteKw}\\b`, 'i'),
        // "the layzX site" (1 token, site keyword REQUIRED)
        new RegExp(`\\bthe\\s+(${tok})\\s+${siteKw}\\b`, 'i'),
        // "billing Acme Corp" / "invoicing layzX"
        new RegExp(`\\b(?:billing|invoicing)\\s+${nameCapture}\\b`, 'i'),
      ];
      for (const pat of namePatterns) {
        const m = clause.match(pat);
        if (m) {
          const candidate = m[1].trim();
          if (!SKIP_NAMES.test(candidate)) {
            client_name = candidate;
            break;
          }
        }
      }
    }
  }

  // ── Address extraction ──────────────────────────────────────────────────────
  // 1. Explicit "address" keyword — handles non-standard addresses like "1213 ga3 jrad w9"
  if (!client_address) {
    const kwAddr = full.match(
      /\baddress[:\s]+(.+?)(?=\s*(?:\bphone\b|\bemail\b|\bdue\b|\blast\b|\bpayment\b|\bwe\b|\bI\b)|[.\n]|$)/i
    );
    if (kwAddr) client_address = kwAddr[1].trim();
  }
  // 2. Standard street address format as fallback
  if (!client_address) {
    const addrMatch = full.match(
      /\b(\d+\s+[A-Za-z0-9\s,.]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl)\b[A-Za-z0-9\s,.-]*(?:[A-Z]{2}\s+\d{5}(?:-\d{4})?)?)/i
    );
    if (addrMatch) client_address = addrMatch[1].trim();
  }

  // ── Line items ─────────────────────────────────────────────────────────────
  const items: InvoiceItem[] = [];

  const skipPattern = /^(?:client|email|e-mail|address|addr|location|notes?|terms?|payment\s+(?:due|terms?)|due\s+(?:date|in)|work\s+done|services?\s*(?:provided)?)\s*[:：]/i;

  // Pre-expand compound clauses: split on common item separators (" and ",
  // " plus ", " as well as ", ";") only when EVERY resulting part contains a
  // dollar amount — this catches "10 hrs of X at $Y and 4 Z at $W" or
  // "$100 setup plus $50 delivery" without over-splitting natural phrases like
  // "design and development".
  const ITEM_SEPARATOR = /\s+and\s+|\s+plus\s+|\s+as\s+well\s+as\s+|\s+then\s+|\s*;\s*/i;
  const expandedClauses: string[] = [];
  for (const clause of clauses) {
    const parts = clause.split(ITEM_SEPARATOR);
    if (parts.length > 1 && parts.every((p) => /\$/.test(p))) {
      expandedClauses.push(...parts.map((p) => p.trim()).filter(Boolean));
    } else {
      expandedClauses.push(clause);
    }
  }

  // Helper: extract the amount from patterns that allow an explicit leading "-"
  // e.g. "-$200" or "$200" both yield 200
  const parseAmt = (s: string) => Math.abs(parseFloat(s.replace(/,/g, '')));

  // Extract ONE line item from `seg`, returning the item plus the index just past
  // the matched text so the caller can keep scanning the remainder. Patterns are
  // tried in priority order (same as before); returning `end` is what lets a single
  // clause yield multiple items instead of stopping after the first match.
  const endOf = (m: RegExpMatchArray) => (m.index ?? 0) + m[0].length;

  const extractOneItem = (seg: string): { item: InvoiceItem; end: number } | null => {
    // Collect every pattern's candidate item, then pick the one whose match begins
    // EARLIEST in `seg`. Patterns are pushed in priority order, so on an equal start
    // index the earlier (higher-priority) pattern wins the tie-break. This ensures an
    // earlier-in-the-text item is never lost just because a later item happened to
    // match a higher-priority pattern.
    const candidates: { item: InvoiceItem; end: number; index: number }[] = [];
    const consider = (m: RegExpMatchArray, item: InvoiceItem) => {
      candidates.push({ item, end: endOf(m), index: m.index ?? 0 });
    };

    // ── Pattern 1: "N hours of TASK at $RATE/hr"
    const nlHourMatch = seg.match(
      /(\d+(?:\.\d+)?)\s+hours?\s+(?:of\s+)?(.+?)\s+at\s+\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/\s*hr)?/i
    );
    if (nlHourMatch) {
      const qty = parseFloat(nlHourMatch[1]);
      const desc = nlHourMatch[2].trim();
      const rate = parseFloat(nlHourMatch[3].replace(/,/g, ''));
      if (qty > 0 && rate > 0) {
        consider(nlHourMatch, { id: crypto.randomUUID(), description: desc, quantity: qty, unit_price: rate, total: qty * rate });
      }
    }

    // ── Pattern 2: "TASK (N hours) at $RATE/hr"
    const structHourMatch = seg.match(
      /(.+?)\s+\((\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\)\s+(?:at|@)\s+\$\s*([\d,]+(?:\.\d{1,2})?)/i
    );
    if (structHourMatch) {
      const desc = structHourMatch[1].trim();
      const qty = parseFloat(structHourMatch[2]);
      const rate = parseFloat(structHourMatch[3].replace(/,/g, ''));
      if (desc && qty > 0 && rate > 0) {
        consider(structHourMatch, { id: crypto.randomUUID(), description: desc, quantity: qty, unit_price: rate, total: qty * rate });
      }
    }

    // ── Pattern 3: "N ITEM ($PRICE each)" or "N ITEM at $PRICE each"
    // Use \b instead of [\s)] so "each." (end of sentence) still matches.
    const eachMatch = seg.match(
      /(\d+(?:\.\d+)?)\s+(.+?)\s+(?:at\s+)?(?:\(\s*)?\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:each|\/\s*(?:unit|ea|pc))\b/i
    );
    if (eachMatch) {
      const qty = parseFloat(eachMatch[1]);
      const desc = eachMatch[2].trim().replace(/[,.]$/, '');
      const rate = parseFloat(eachMatch[3].replace(/,/g, ''));
      if (qty > 0 && rate > 0) {
        consider(eachMatch, { id: crypto.randomUUID(), description: desc, quantity: qty, unit_price: rate, total: qty * rate });
      }
    }

    // ── Pattern 4a: discount
    // Handles: "giving a $100 discount", "$200 discount", "-$200 discount",
    //          "discount of $200", "deducting $X"
    const discountMatch = seg.match(
      /(?:giving?\s+(?:a\s+)?-?\$\s*([\d,]+(?:\.\d{1,2})?)\s*discount|discount\s+(?:of\s+)?-?\$\s*([\d,]+(?:\.\d{1,2})?)|deduct(?:ing)?\s+-?\$\s*([\d,]+(?:\.\d{1,2})?)|-?\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:off|discount))/i
    );
    if (discountMatch) {
      const raw = discountMatch[1] || discountMatch[2] || discountMatch[3] || discountMatch[4];
      const amount = parseAmt(raw);
      if (amount > 0) {
        // Reason: "because of the delay", "due to X", or "for being a long-term partner"
        const reasonMatch = seg.match(
          /(?:because\s+of|due\s+to|for\s+(?:being\s+(?:a\s+)?)?)\s*(?:the\s+)?([a-z][a-z\s\-]+?)(?:\s+(?:and|on|in|of|that|which)\b|\.|,|$)/i
        );
        const label = reasonMatch ? `Discount – ${reasonMatch[1].trim()}` : 'Discount';
        consider(discountMatch, { id: crypto.randomUUID(), description: label, quantity: 1, unit_price: -amount, total: -amount });
      }
    }

    // ── Pattern 4b: credit / overpayment / refund (negative items)
    // Handles: "crediting back $30", "crediting them -$75", "-$75 for an overpayment",
    //          "credit of $X", "$X credit", "refunding $X"
    const creditMatch = seg.match(
      /(?:credit(?:ing)?\s+(?:\w+\s+){0,3}(?:back\s+)?-?\$\s*([\d,]+(?:\.\d{1,2})?)|refund(?:ing)?\s+(?:\w+\s+){0,2}-?\$\s*([\d,]+(?:\.\d{1,2})?)|-\$\s*([\d,]+(?:\.\d{1,2})?)\s+for\s+(?:an?\s+)?(?:overpayment|credit|refund|adjustment)|\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:credit|overpayment\s+credit))/i
    );
    if (creditMatch) {
      const raw = creditMatch[1] || creditMatch[2] || creditMatch[3] || creditMatch[4];
      const amount = parseAmt(raw);
      if (amount > 0) {
        // Label: prefer the stated reason after "for a/an/the [reason]",
        // e.g. "for a shipping error" -> "shipping error credit", "overpayment".
        const reasonMatch =
          seg.match(/\bfor\s+(?:an?\s+|the\s+)?([a-z][a-z\s\-]+?)(?:\s+(?:that|which|on|from|of|last|this|happened|occurred)\b|[.,]|$)/i) ||
          seg.match(/(?:recovered|sold|returned)\s+(?:some\s+)?(?:old\s+)?([a-z]+(?:\s+[a-z]+)?)\s+(?:that|which|for)/i);
        const label = reasonMatch ? `${reasonMatch[1].trim()} credit` : 'Credit';
        consider(creditMatch, { id: crypto.randomUUID(), description: label, quantity: 1, unit_price: -amount, total: -amount });
      }
    }

    // ── Pattern 5: "N x $price" or "N @ $price"
    const multiplyMatch = seg.match(
      /^[-•*]?\s*(.+?)\s+(\d+(?:\.\d+)?)\s*[x×@]\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i
    );
    if (multiplyMatch) {
      const desc = multiplyMatch[1].trim();
      const qty = parseFloat(multiplyMatch[2]);
      const rate = parseFloat(multiplyMatch[3].replace(/,/g, ''));
      if (desc && qty > 0 && rate > 0) {
        consider(multiplyMatch, { id: crypto.randomUUID(), description: desc, quantity: qty, unit_price: rate, total: qty * rate });
      }
    }

    // ── Pattern 6: "ITEM which was/cost/priced at $AMOUNT"
    const proseAmountMatch = seg.match(
      /(.+?)\s+(?:which\s+was|costs?\s*(?:us)?|priced?\s+at|worth|totaling?|came?\s+to)\s+\$\s*([\d,]+(?:\.\d{1,2})?)/i
    );
    if (proseAmountMatch) {
      const raw = proseAmountMatch[1];
      const desc = raw
        .replace(/^(?:we\s+)?(?:also\s+)?(?:used|picked\s+up|got|purchased|bought|need|needed|have|had|installed)\s+/i, '')
        .replace(/^(?:a\s+)?(?:batch\s+of\s+)?/i, '')
        .replace(/^(?:a|an|the|some|that|this|also)\s+/i, '')
        .trim();
      const amount = parseFloat(proseAmountMatch[2].replace(/,/g, ''));
      if (desc && amount > 0 && !skipPattern.test(desc)) {
        consider(proseAmountMatch, { id: crypto.randomUUID(), description: desc, quantity: 1, unit_price: amount, total: amount });
      }
    }

    // ── Pattern 7: "add/include/apply/charge $X [description]"  (amount-first)
    // e.g. "add a $100 rush fee", "include $50 delivery charge"
    const addItemMatch = seg.match(
      /(?:add(?:ing)?|include|apply(?:ing)?|charge|please\s+add)\s+(?:a\s+)?\$\s*([\d,]+(?:\.\d{1,2})?)\s+(.+)/i
    );
    if (addItemMatch) {
      const amount = parseFloat(addItemMatch[1].replace(/,/g, ''));
      const desc = addItemMatch[2].trim().replace(/[.,!?]+$/, '');
      if (amount > 0 && desc && !skipPattern.test(desc)) {
        consider(addItemMatch, { id: crypto.randomUUID(), description: desc, quantity: 1, unit_price: amount, total: amount });
      }
    }

    // ── Pattern 8: simple "DESCRIPTION: $amount" or "DESCRIPTION — $amount"
    const simpleMatch = seg.match(
      /^[-•*]?\s*(.+?)[\s\-–:]+\$\s*([\d,]+(?:\.\d{1,2})?)\s*$/
    );
    if (simpleMatch) {
      const desc = simpleMatch[1].trim();
      const amount = parseFloat(simpleMatch[2].replace(/,/g, ''));
      if (desc && amount > 0 && !skipPattern.test(desc)) {
        consider(simpleMatch, { id: crypto.randomUUID(), description: desc, quantity: 1, unit_price: amount, total: amount });
      }
    }

    // ── Pattern 9: bare amount-first fragment "$X [for] DESCRIPTION"
    // Anchored at the segment start (lowest priority) so it only fires on leftovers
    // like "$50 for delivery" or "a $75 rush charge" produced by clause splitting —
    // never mid-sentence prose (those begin with words, not the amount). The
    // description stops before a following amount/separator so two run-together
    // priced fragments aren't merged into one item.
    const bareAmountMatch = seg.match(
      /^(?:a\s+|an\s+)?\$\s*([\d,]+(?:\.\d{1,2})?)\s+(?:for\s+)?(.+?)(?=\s+\$|\s*[;,]|$)/i
    );
    if (bareAmountMatch) {
      const amount = parseFloat(bareAmountMatch[1].replace(/,/g, ''));
      const desc = bareAmountMatch[2].trim().replace(/[.,!?]+$/, '');
      if (amount > 0 && desc && !skipPattern.test(desc)) {
        consider(bareAmountMatch, { id: crypto.randomUUID(), description: desc, quantity: 1, unit_price: amount, total: amount });
      }
    }

    if (candidates.length === 0) return null;
    const best = candidates.reduce((a, b) => (b.index < a.index ? b : a));
    return { item: best.item, end: best.end };
  };

  for (const clause of expandedClauses) {
    if (skipPattern.test(clause)) continue;
    // Skip pure-heading lines like "Line Items:"
    if (/^[A-Za-z\s]+:$/.test(clause)) continue;

    // Scan the whole clause, consuming each matched entry and continuing on the
    // remainder, so a single clause with several priced entries produces one line
    // item per entry rather than stopping after the first match.
    let seg = clause;
    let guard = 0;
    while (seg.trim().length > 0 && guard++ < 30) {
      // Drop leading separators/punctuation left over from a previous match so the
      // next fragment (e.g. "; $50 delivery") can be recognised.
      seg = seg.replace(/^[\s;,]+/, '');
      if (!seg) break;
      const res = extractOneItem(seg);
      if (!res) break;
      items.push(res.item);
      const next = seg.slice(res.end);
      if (next.length >= seg.length) break; // safety: guarantee forward progress
      seg = next;
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
  let due_date_override: string | null = null; // ISO date string YYYY-MM-DD

  // Specific calendar date: "30 july", "july 30", "30th july 2026", "july 30, 2026"
  const MONTH_MAP: Record<string, number> = {
    january:1, february:2, march:3, april:4, may:5, june:6,
    july:7, august:8, september:9, october:10, november:11, december:12,
  };
  const dayMonthMatch = full.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/i
  );
  const monthDayMatch = full.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?\b/i
  );
  const dateMatch = dayMonthMatch || monthDayMatch;
  if (dateMatch) {
    const isDayFirst = !!dayMonthMatch;
    const day    = parseInt(isDayFirst ? dateMatch[1] : dateMatch[2], 10);
    const month  = MONTH_MAP[(isDayFirst ? dateMatch[2] : dateMatch[1]).toLowerCase()];
    const year   = dateMatch[3] ? parseInt(dateMatch[3], 10) : new Date().getFullYear();
    if (day >= 1 && day <= 31 && month) {
      due_date_override = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }
  }

  // Relative "due in N days" / "Net 30"
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

  return { client_name, client_email, client_address, items, notes, payment_terms, due_days, due_date: due_date_override ?? undefined };
}
