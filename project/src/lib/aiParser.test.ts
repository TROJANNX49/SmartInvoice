import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseRawNotesWithAI } from './aiParser';
import type { InvoiceItem } from './api';

// ─────────────────────────────────────────────────────────────────────────────
// These tests exercise the REGEX FALLBACK path of parseRawNotesWithAI.
//
// parseRawNotesWithAI first POSTs to /api/parse-invoice (OpenAI-backed). We stub
// global fetch to always reject, which forces the catch branch and runs the
// local regex heuristic parser — the code path we want a permanent regression
// suite for. Every assertion checks the full shape of each line item
// (description, quantity, unit_price, total) plus the item count, so a dropped,
// merged, or mislabeled item fails loudly instead of silently.
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Parse a note and return just the items (fetch is already stubbed to fail). */
async function parseItems(note: string): Promise<InvoiceItem[]> {
  const result = await parseRawNotesWithAI(note);
  return result.items;
}

/** Parse a note and return the full ParsedInvoice (fetch is already stubbed to fail). */
async function parseFull(note: string) {
  return parseRawNotesWithAI(note);
}

/** Assert a single item matches the given fields (ignoring the random id). */
function expectItem(
  item: InvoiceItem,
  expected: { description: string; quantity: number; unit_price: number; total: number },
) {
  expect(item.description).toBe(expected.description);
  expect(item.quantity).toBe(expected.quantity);
  expect(item.unit_price).toBe(expected.unit_price);
  expect(item.total).toBe(expected.total);
}

describe('parseRawNotesWithAI — regex fallback runs when the API call fails', () => {
  it('actually falls back (does not throw) when fetch rejects', async () => {
    const items = await parseItems('consulting $500');
    expect(items).toHaveLength(1);
    expectItem(items[0], { description: 'consulting', quantity: 1, unit_price: 500, total: 500 });
  });
});

describe('source reporting — signals whether AI or the offline fallback ran', () => {
  it("marks source as 'fallback' when the API call fails", async () => {
    const result = await parseRawNotesWithAI('consulting $500');
    expect(result.source).toBe('fallback');
  });

  it("marks source as 'ai' when the API responds successfully", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          source: 'ai',
          client_name: 'Acme',
          items: [{ id: 'x', description: 'work', quantity: 1, unit_price: 100, total: 100 }],
        }),
      }),
    );
    const result = await parseRawNotesWithAI('some notes');
    expect(result.source).toBe('ai');
  });
});

describe('hourly rates', () => {
  it('parses "N hours of TASK at $RATE/hr"', async () => {
    const items = await parseItems('10 hours of design at $80/hr');
    expect(items).toHaveLength(1);
    expectItem(items[0], { description: 'design', quantity: 10, unit_price: 80, total: 800 });
  });

  it('parses "TASK (N hours) at $RATE/hr"', async () => {
    const items = await parseItems('Website build (20 hours) at $100/hr');
    expect(items).toHaveLength(1);
    expectItem(items[0], { description: 'Website build', quantity: 20, unit_price: 100, total: 2000 });
  });

  it('parses fractional hours', async () => {
    const items = await parseItems('2.5 hours of consulting at $200/hr');
    expect(items).toHaveLength(1);
    expectItem(items[0], { description: 'consulting', quantity: 2.5, unit_price: 200, total: 500 });
  });
});

describe('per-unit "each"', () => {
  it('parses "N ITEM at $PRICE each"', async () => {
    const items = await parseItems('3 t-shirts at $25 each');
    expect(items).toHaveLength(1);
    expectItem(items[0], { description: 't-shirts', quantity: 3, unit_price: 25, total: 75 });
  });

  it('parses "N ITEM ($PRICE each)"', async () => {
    const items = await parseItems('12 mugs ($8 each)');
    expect(items).toHaveLength(1);
    expectItem(items[0], { description: 'mugs', quantity: 12, unit_price: 8, total: 96 });
  });
});

describe('discounts (negative items with reason labels)', () => {
  it('labels "giving a $X discount because of the delay"', async () => {
    const items = await parseItems('giving a $100 discount because of the delay');
    expect(items).toHaveLength(1);
    expectItem(items[0], { description: 'Discount – delay', quantity: 1, unit_price: -100, total: -100 });
  });

  it('parses "$X off" as a negative discount', async () => {
    const items = await parseItems('$50 off');
    expect(items).toHaveLength(1);
    expect(items[0].unit_price).toBe(-50);
    expect(items[0].total).toBe(-50);
    expect(items[0].description).toMatch(/discount/i);
  });

  it('parses "discount of $X"', async () => {
    const items = await parseItems('discount of $200');
    expect(items).toHaveLength(1);
    expect(items[0].unit_price).toBe(-200);
    expect(items[0].total).toBe(-200);
  });
});

describe('credits / refunds (negative items with reason labels)', () => {
  it('labels "crediting back $X for a shipping error"', async () => {
    const items = await parseItems('crediting back $30 for a shipping error');
    expect(items).toHaveLength(1);
    expectItem(items[0], { description: 'shipping error credit', quantity: 1, unit_price: -30, total: -30 });
  });

  it('parses "-$X for an overpayment" as a negative credit', async () => {
    const items = await parseItems('-$75 for an overpayment');
    expect(items).toHaveLength(1);
    expect(items[0].unit_price).toBe(-75);
    expect(items[0].total).toBe(-75);
  });
});

describe('joiner separators split into multiple items', () => {
  it('splits on "and" when every part has an amount', async () => {
    const items = await parseItems('10 hours of design at $80/hr and 4 logos at $50 each');
    expect(items).toHaveLength(2);
    expectItem(items[0], { description: 'design', quantity: 10, unit_price: 80, total: 800 });
    expectItem(items[1], { description: 'logos', quantity: 4, unit_price: 50, total: 200 });
  });

  it('splits on "plus"', async () => {
    const items = await parseItems('$100 setup plus $50 delivery');
    expect(items).toHaveLength(2);
    expectItem(items[0], { description: 'setup', quantity: 1, unit_price: 100, total: 100 });
    expectItem(items[1], { description: 'delivery', quantity: 1, unit_price: 50, total: 50 });
  });

  it('splits on "as well as"', async () => {
    const items = await parseItems('logo design $300 as well as brand guide $450');
    expect(items).toHaveLength(2);
    expectItem(items[0], { description: 'logo design', quantity: 1, unit_price: 300, total: 300 });
    expectItem(items[1], { description: 'brand guide', quantity: 1, unit_price: 450, total: 450 });
  });

  it('splits on "then"', async () => {
    const items = await parseItems('phase one $1000 then phase two $2000');
    expect(items).toHaveLength(2);
    expectItem(items[0], { description: 'phase one', quantity: 1, unit_price: 1000, total: 1000 });
    expectItem(items[1], { description: 'phase two', quantity: 1, unit_price: 2000, total: 2000 });
  });

  it('splits on ";"', async () => {
    const items = await parseItems('consulting $500; hosting $120');
    expect(items).toHaveLength(2);
    expectItem(items[0], { description: 'consulting', quantity: 1, unit_price: 500, total: 500 });
    expectItem(items[1], { description: 'hosting', quantity: 1, unit_price: 120, total: 120 });
  });
});

describe('no over-split of natural-language phrases', () => {
  it('keeps "design and development" as ONE item (only one amount present)', async () => {
    const items = await parseItems('design and development at $2000');
    expect(items).toHaveLength(1);
    expect(items[0].unit_price).toBe(2000);
    expect(items[0].total).toBe(2000);
    // The whole phrase stays together — it must NOT split into "design" + "development".
    expect(items[0].description).toMatch(/design and development/i);
  });
});

describe('mixed multi-item notes', () => {
  it('parses a note combining hourly, per-unit, and a discount', async () => {
    const items = await parseItems(
      '10 hours of design at $80/hr and 4 logos at $50 each and giving a $100 discount because of the delay',
    );
    expect(items).toHaveLength(3);
    expectItem(items[0], { description: 'design', quantity: 10, unit_price: 80, total: 800 });
    expectItem(items[1], { description: 'logos', quantity: 4, unit_price: 50, total: 200 });
    expectItem(items[2], { description: 'Discount – delay', quantity: 1, unit_price: -100, total: -100 });
  });

  it('parses newline-separated line items', async () => {
    const items = await parseItems('Consulting: $500\nHosting: $120\nDomain: $15');
    expect(items).toHaveLength(3);
    expectItem(items[0], { description: 'Consulting', quantity: 1, unit_price: 500, total: 500 });
    expectItem(items[1], { description: 'Hosting', quantity: 1, unit_price: 120, total: 120 });
    expectItem(items[2], { description: 'Domain', quantity: 1, unit_price: 15, total: 15 });
  });
});

describe('empty / non-item input', () => {
  it('returns a single blank placeholder item when nothing parses', async () => {
    const items = await parseItems('thanks for your business!');
    expect(items).toHaveLength(1);
    expectItem(items[0], { description: '', quantity: 1, unit_price: 0, total: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Client / date / payment-term extraction. These fields ride alongside the line
// items on every parsed invoice; a regression here silently puts the wrong
// client or due date on an invoice, so each case asserts the exact field value.
// ─────────────────────────────────────────────────────────────────────────────

describe('client details — structured "Field: value" phrasing', () => {
  it('extracts client_name, client_email, and client_address from labelled lines', async () => {
    const r = await parseFull(
      'Client: Acme Corp\nEmail: john@acme.com\nAddress: 123 Main Street, Springfield IL 62704',
    );
    expect(r.client_name).toBe('Acme Corp');
    expect(r.client_email).toBe('john@acme.com');
    // Address is captured up to the comma clause boundary.
    expect(r.client_address).toBe('123 Main Street');
  });

  it('extracts a non-standard address via the "address:" label', async () => {
    const r = await parseFull('address: 1213 ga3 jrad w9 phone 555');
    // The whole single-clause line after the label is captured verbatim.
    expect(r.client_address).toBe('1213 ga3 jrad w9 phone 555');
  });
});

describe('client details — natural-language phrasing', () => {
  it('extracts the name from "billing NAME"', async () => {
    const r = await parseFull('billing Acme Corp for the new website');
    expect(r.client_name).toBe('Acme Corp');
  });

  it('extracts a single-token name from "the NAME site"', async () => {
    const r = await parseFull('the Globex site redesign');
    expect(r.client_name).toBe('Globex');
  });

  it('extracts the name from "for the NAME site"', async () => {
    const r = await parseFull('for the layzX site we did some work');
    expect(r.client_name).toBe('layzX');
  });

  it('finds an email anywhere in the prose', async () => {
    const r = await parseFull('work for Wayne Enterprises, email bruce@wayne.com');
    expect(r.client_email).toBe('bruce@wayne.com');
  });
});

describe('due dates — specific calendar dates', () => {
  const thisYear = new Date().getFullYear();

  it('parses day-month "30 july" to an ISO date in the current year', async () => {
    const r = await parseFull('design work due 30 july');
    expect(r.due_date).toBe(`${thisYear}-07-30`);
    expect(r.due_days).toBeNull();
  });

  it('parses month-day "july 30" to an ISO date in the current year', async () => {
    const r = await parseFull('july 30 payment expected');
    expect(r.due_date).toBe(`${thisYear}-07-30`);
  });

  it('honours an explicit year "15 august 2027"', async () => {
    const r = await parseFull('payment due 15 august 2027');
    expect(r.due_date).toBe('2027-08-15');
  });
});

describe('due dates — relative terms', () => {
  it('parses "due in N days" into due_days', async () => {
    const r = await parseFull('invoice due in 14 days');
    expect(r.due_days).toBe(14);
    expect(r.due_date).toBeUndefined();
  });

  it('parses "Net 30" into both payment_terms and due_days', async () => {
    const r = await parseFull('Net 30');
    expect(r.payment_terms).toBe('Net 30');
    expect(r.due_days).toBe(30);
  });

  it('parses "net-45" (hyphenated) into "Net 45" and due_days 45', async () => {
    const r = await parseFull('net-45 terms');
    expect(r.payment_terms).toBe('Net 45');
    expect(r.due_days).toBe(45);
  });
});

describe('payment terms — explicit "Terms:" label', () => {
  it('captures free-text terms after the label', async () => {
    const r = await parseFull('Terms: 50% upfront, 50% on delivery');
    expect(r.payment_terms).toBe('50% upfront, 50% on delivery');
  });

  it('extracts terms and due days together from a mixed note', async () => {
    const r = await parseFull('consulting done, payment due in 30 days, net 30');
    expect(r.due_days).toBe(30);
    expect(r.payment_terms).toBe('Net 30');
  });
});
