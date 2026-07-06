// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';

// ─────────────────────────────────────────────────────────────────────────────
// These tests exercise the "Try AI parsing again" retry button on the Review
// step (the amber offline-fallback banner in CreateInvoicePage).
//
// The flow under test:
//   1. Initial "Parse with AI" hits /api/parse-invoice. We stub fetch to reject,
//      so the real aiParser falls back to its regex parser and returns
//      source: 'fallback' → the amber banner renders.
//   2. Clicking "Try AI parsing again" re-runs parseRawNotesWithAI. We swap the
//      fetch stub between the two calls to drive each scenario:
//        • a genuine AI success replaces the fields and hides the banner
//        • another fallback keeps the banner and shows the brief retry message
//
// AuthContext and the api module are mocked so the component never pulls in the
// Supabase client (which throws without env vars). The aiParser itself is REAL —
// only the network boundary (global fetch) is stubbed, matching aiParser.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 't@example.com', subscription_tier: 'pro', credits: 999 },
    refreshUser: vi.fn(),
  }),
}));

vi.mock('../lib/api', () => ({
  api: { createInvoice: vi.fn() },
}));

import { CreateInvoicePage } from './CreateInvoicePage';

// Swappable fetch behaviour: each test points this at the response it wants for
// the NEXT parse call, then swaps it before triggering the retry.
let fetchImpl: (...args: unknown[]) => Promise<unknown>;

const rejectingFetch = () => Promise.reject(new Error('network down'));

const aiFetch = (payload: Record<string, unknown>) => () =>
  Promise.resolve({
    ok: true,
    json: async () => ({ source: 'ai', ...payload }),
  });

beforeEach(() => {
  fetchImpl = rejectingFetch;
  vi.stubGlobal('fetch', vi.fn((...args: unknown[]) => fetchImpl(...args)));
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const BANNER = /AI parsing was unavailable/i;
const STILL_UNAVAILABLE = /AI parsing is still unavailable/i;

/**
 * Render the page, run the initial parse with fetch rejecting so the regex
 * fallback fires, and wait for the amber banner to appear on the Review step.
 */
async function renderAtFallbackReview(notes = 'consulting $500') {
  render(
    <MemoryRouter>
      <CreateInvoicePage />
    </MemoryRouter>,
  );
  const textarea = screen.getByPlaceholderText(/Example:/i);
  fireEvent.change(textarea, { target: { value: notes } });
  fireEvent.click(screen.getByRole('button', { name: /Parse with AI/i }));
  // Banner only shows once we're on Review with source === 'fallback'
  await screen.findByText(BANNER);
}

describe("Review-step 'Try AI parsing again' retry", () => {
  it('a successful AI retry replaces the fields and hides the fallback banner', async () => {
    await renderAtFallbackReview();

    // Sanity: the offline banner is showing and AI-provided data is not yet present
    expect(screen.getByText(BANNER)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Acme Corp')).not.toBeInTheDocument();

    // Next parse call should succeed via AI with fresh fields
    fetchImpl = aiFetch({
      client_name: 'Acme Corp',
      client_email: 'billing@acme.com',
      items: [{ id: 'x', description: 'Website build', quantity: 1, unit_price: 4200, total: 4200 }],
    });

    fireEvent.click(screen.getByRole('button', { name: /Try AI parsing again/i }));

    // Fields update to the AI result...
    expect(await screen.findByDisplayValue('Acme Corp')).toBeInTheDocument();
    expect(screen.getByDisplayValue('billing@acme.com')).toBeInTheDocument();
    // ...and the amber fallback banner is gone.
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
    expect(screen.queryByText(STILL_UNAVAILABLE)).not.toBeInTheDocument();
  });

  it('when the retry falls back again the banner stays and shows the "still unavailable" message', async () => {
    await renderAtFallbackReview();

    // Keep fetch rejecting so the retry falls back a second time
    fetchImpl = rejectingFetch;

    fireEvent.click(screen.getByRole('button', { name: /Try AI parsing again/i }));

    // The brief retry message appears...
    expect(await screen.findByText(STILL_UNAVAILABLE)).toBeInTheDocument();
    // ...and the amber fallback banner is still present.
    expect(screen.getByText(BANNER)).toBeInTheDocument();
  });
});
