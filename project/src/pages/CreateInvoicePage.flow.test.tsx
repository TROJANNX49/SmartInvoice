// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';

// ─────────────────────────────────────────────────────────────────────────────
// These tests exercise the full invoice creation happy path in CreateInvoicePage:
//
//   1. User enters notes on the Input step.
//   2. "Parse with AI" fires; fetch resolves with a successful AI response.
//   3. The Review step renders with the parsed client fields and line items.
//   4. User edits a line item (quantity change) — item total and subtotal
//      recalculate immediately.
//   5. User clicks "Preview & Save" → reaches the Finalize step.
//   6. User clicks "Save Invoice" → api.createInvoice is called with the
//      correct payload and navigate fires with the new invoice URL.
//
// AuthContext and api are mocked (same pattern as CreateInvoicePage.retry.test.tsx).
// useNavigate is also mocked so we can assert the post-save redirect without
// needing a full router history. The aiParser itself is REAL; only global fetch
// is stubbed to control the network boundary.
// ─────────────────────────────────────────────────────────────────────────────

// vi.hoisted ensures these variables exist when the vi.mock factories run
// (vi.mock calls are hoisted to the top of the compiled output).
const { mockNavigate, mockRefreshUser } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockRefreshUser: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      email: 'owner@example.com',
      company_name: 'Test Co',
      subscription_tier: 'pro',
      credits: 999,
    },
    refreshUser: mockRefreshUser,
  }),
}));

vi.mock('../lib/api', () => ({
  api: { createInvoice: vi.fn() },
}));

// Import after mocks are registered
import { api, type Invoice } from '../lib/api';
import { CreateInvoicePage } from './CreateInvoicePage';

// ── Fetch helpers ─────────────────────────────────────────────────────────────

/** Builds a fetch stub that returns an AI-parsed response payload. */
const makeAiFetch =
  (payload: Record<string, unknown>) =>
  () =>
    Promise.resolve({
      ok: true,
      json: async () => ({ source: 'ai', ...payload }),
    });

/** A standard parsed response used across tests. */
const PARSED_AI_PAYLOAD = {
  client_name: 'Acme Corp',
  client_email: 'billing@acme.com',
  client_address: '42 Business Ave, New York, NY',
  items: [
    {
      id: 'item-1',
      description: 'Website redesign',
      quantity: 2,
      unit_price: 1000,
      total: 2000,
    },
    {
      id: 'item-2',
      description: 'Logo design',
      quantity: 1,
      unit_price: 400,
      total: 400,
    },
  ],
  notes: 'Rush delivery requested',
  payment_terms: 'Net 30',
  due_date: null,
  due_days: 30,
};

beforeEach(() => {
  mockNavigate.mockReset();
  mockRefreshUser.mockResolvedValue(undefined);
  vi.mocked(api.createInvoice).mockReset();
  vi.mocked(api.createInvoice).mockResolvedValue({ id: 'inv-999' } as unknown as Invoice);
  vi.stubGlobal('fetch', vi.fn(makeAiFetch(PARSED_AI_PAYLOAD)));
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage() {
  render(
    <MemoryRouter>
      <CreateInvoicePage />
    </MemoryRouter>,
  );
}

/** Render the page, type notes, click Parse with AI, and wait for the Review step. */
async function renderAtReviewStep(notes = 'Design work for Acme Corp') {
  renderPage();
  const textarea = screen.getByPlaceholderText(/Example:/i);
  fireEvent.change(textarea, { target: { value: notes } });
  fireEvent.click(screen.getByRole('button', { name: /Parse with AI/i }));
  // Wait until the Review step's "Client Information" heading is visible
  await screen.findByText('Client Information');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Full invoice creation happy path', () => {
  it('displays parsed client fields and line items on the Review step', async () => {
    await renderAtReviewStep();

    // Client fields populated from the AI response
    expect(screen.getByDisplayValue('Acme Corp')).toBeInTheDocument();
    expect(screen.getByDisplayValue('billing@acme.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('42 Business Ave, New York, NY')).toBeInTheDocument();

    // Both line items are rendered
    expect(screen.getByDisplayValue('Website redesign')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Logo design')).toBeInTheDocument();

    // No fallback amber banner — this was a real AI parse
    expect(screen.queryByText(/AI parsing was unavailable/i)).not.toBeInTheDocument();
  });

  it('recalculates item total and subtotal when quantity is changed', async () => {
    await renderAtReviewStep();

    // Initially: Website redesign = qty 2 × $1000 = $2000; Logo = $400 → subtotal $2400.
    // Both Subtotal and Total rows show $2400.00 when tax=0, so use getAllByText.
    expect(screen.getAllByText('$2400.00').length).toBeGreaterThanOrEqual(1);

    // The "Website redesign" row has qty=2; find that quantity input by its current value
    const qtyInput = screen.getAllByDisplayValue('2')[0];

    // Change quantity from 2 → 3
    fireEvent.change(qtyInput, { target: { value: '3' } });

    // Website redesign item total is now 3 × $1000 = 3000.00 (no $ in the item row)
    // Subtotal and Total rows both show $3400.00
    await waitFor(() => {
      expect(screen.getByText('3000.00')).toBeInTheDocument();
      expect(screen.getAllByText('$3400.00').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('advances to the Finalize step when "Preview & Save" is clicked', async () => {
    await renderAtReviewStep();

    fireEvent.click(screen.getByRole('button', { name: /Preview & Save/i }));

    // The Finalize step renders the Save button
    await screen.findByRole('button', { name: /Save Invoice/i });
    // Client name appears in the invoice preview
    expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0);
  });

  it('calls createInvoice with correct payload and navigates to the new invoice on save', async () => {
    await renderAtReviewStep();

    // Proceed to Finalize
    fireEvent.click(screen.getByRole('button', { name: /Preview & Save/i }));
    await screen.findByRole('button', { name: /Save Invoice/i });

    // Save
    fireEvent.click(screen.getByRole('button', { name: /Save Invoice/i }));

    await waitFor(() => {
      expect(api.createInvoice).toHaveBeenCalledTimes(1);
    });

    const callArg = vi.mocked(api.createInvoice).mock.calls[0][0];

    // Core fields
    expect(callArg.client_name).toBe('Acme Corp');
    expect(callArg.client_email).toBe('billing@acme.com');
    expect(callArg.type).toBe('invoice');

    // Items have descriptions and correct totals
    expect(callArg.items).toHaveLength(2);
    expect(callArg.items[0]).toMatchObject({
      description: 'Website redesign',
      quantity: 2,
      unit_price: 1000,
      total: 2000,
    });
    expect(callArg.items[1]).toMatchObject({
      description: 'Logo design',
      quantity: 1,
      unit_price: 400,
      total: 400,
    });

    // Totals
    expect(callArg.subtotal).toBe(2400);
    expect(callArg.total).toBe(2400);

    // refreshUser is called after save so credit count updates
    expect(mockRefreshUser).toHaveBeenCalled();

    // Navigate to the new invoice
    expect(mockNavigate).toHaveBeenCalledWith('/invoices/inv-999');
  });

  it('creates invoice with updated totals after a line item edit', async () => {
    await renderAtReviewStep();

    // Change Website redesign qty: 2 → 5 (total $5000); Logo stays $400 → subtotal $5400
    const qtyInput = screen.getAllByDisplayValue('2')[0];
    fireEvent.change(qtyInput, { target: { value: '5' } });

    await waitFor(() => {
      expect(screen.getAllByText('$5400.00').length).toBeGreaterThanOrEqual(1);
    });

    // Proceed to Finalize and save
    fireEvent.click(screen.getByRole('button', { name: /Preview & Save/i }));
    await screen.findByRole('button', { name: /Save Invoice/i });
    fireEvent.click(screen.getByRole('button', { name: /Save Invoice/i }));

    await waitFor(() => {
      expect(api.createInvoice).toHaveBeenCalledTimes(1);
    });

    const callArg = vi.mocked(api.createInvoice).mock.calls[0][0];
    expect(callArg.items[0]).toMatchObject({ quantity: 5, total: 5000 });
    expect(callArg.subtotal).toBe(5400);
    expect(callArg.total).toBe(5400);
  });
});

// ── Edge-input guard tests ────────────────────────────────────────────────────
//
// These tests verify that handleItemChange prevents invalid quantity/unit_price
// values from producing NaN or nonsensical totals on the Review step.
//
// Baseline (PARSED_AI_PAYLOAD):
//   Website redesign: qty=2, unit_price=1000, total=2000
//   Logo design:      qty=1, unit_price=400,  total=400
//   Subtotal: $2400, Total: $2400 (tax=0)
//
// The qty input fires onChange with parseFloat(value)||0, then handleItemChange
// clamps via Math.abs(qty)||1, so 0 and blank both fall back to qty=1.
// ─────────────────────────────────────────────────────────────────────────────

describe('Line-item edge-input guard', () => {
  it('qty=0 clamps to 1 — item total and subtotal are not NaN and are ≥ 0', async () => {
    await renderAtReviewStep();

    // qty input for Website redesign currently shows '2'
    const qtyInput = screen.getAllByDisplayValue('2')[0];
    // onChange passes parseFloat('0')||0 = 0 to handleItemChange
    fireEvent.change(qtyInput, { target: { value: '0' } });

    await waitFor(() => {
      // qty clamped to 1 → item total = 1 × 1000 = 1000.00
      expect(screen.getByText('1000.00')).toBeInTheDocument();
      // subtotal = 1000 + 400 = $1400.00; total same (tax=0)
      expect(screen.getAllByText('$1400.00').length).toBeGreaterThanOrEqual(1);
    });

    // Sanity: no NaN anywhere in the document
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it('qty=-5 is treated as abs(5) — item total and subtotal stay positive', async () => {
    await renderAtReviewStep();

    const qtyInput = screen.getAllByDisplayValue('2')[0];
    // parseFloat('-5') = -5; -5||0 = -5 → handleItemChange receives -5
    fireEvent.change(qtyInput, { target: { value: '-5' } });

    await waitFor(() => {
      // Math.abs(-5)=5 → item total = 5 × 1000 = 5000.00
      expect(screen.getByText('5000.00')).toBeInTheDocument();
      // subtotal = 5000 + 400 = $5400.00
      expect(screen.getAllByText('$5400.00').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it('blank qty clamps to 1 — item total and subtotal are not NaN and are ≥ 0', async () => {
    await renderAtReviewStep();

    const qtyInput = screen.getAllByDisplayValue('2')[0];
    // parseFloat('') = NaN; NaN||0 = 0 → handleItemChange receives 0
    fireEvent.change(qtyInput, { target: { value: '' } });

    await waitFor(() => {
      // qty 0 → clamped to 1 → item total = 1 × 1000 = 1000.00
      expect(screen.getByText('1000.00')).toBeInTheDocument();
      // subtotal = 1000 + 400 = $1400.00
      expect(screen.getAllByText('$1400.00').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it('negative unit_price (discount row) — item total is negative, subtotal is correct', async () => {
    await renderAtReviewStep();

    // Logo design has unit_price=400; change it to -200 to simulate a discount
    const rateInput = screen.getAllByDisplayValue('400')[0];
    fireEvent.change(rateInput, { target: { value: '-200' } });

    await waitFor(() => {
      // Logo total = 1 × -200 = -200, displayed as "-200.00"
      expect(screen.getByText('-200.00')).toBeInTheDocument();
      // subtotal = 2000 + (-200) = $1800.00; total same (tax=0)
      expect(screen.getAllByText('$1800.00').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.queryByText(/NaN/)).toBeNull();
  });
});
