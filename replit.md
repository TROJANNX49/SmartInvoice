# SmartInvoice AI

AI-powered invoice generation app. Paste raw project notes and the app extracts client details, line items, and totals into a professional PDF invoice.

## Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS
- **Backend/Auth/DB:** Supabase (PostgreSQL + Auth)
- **PDF:** jsPDF + html2canvas
- **Routing:** React Router v7

## Project Structure

```
project/
  src/
    lib/
      supabase.ts      # Supabase client (env var driven)
      api.ts           # All CRUD: invoices, profiles, templates
      aiParser.ts      # Regex-based notes → invoice parser
    contexts/
      AuthContext.tsx  # Supabase Auth with Google OAuth support
    components/
      Layout.tsx       # Sidebar nav (desktop + mobile responsive)
    pages/             # Route pages (Dashboard, Create, Invoices, etc.)
  supabase/
    migrations/        # SQL migrations for profiles, invoices, templates
```

## Running

The workflow `Start application` runs: `cd project && npm install && npm run dev`  
App serves on **port 5000**.

## Environment Variables

| Key | Description |
|-----|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable anon key |

Stripe secrets are pre-configured for payment integration.

## Supabase Schema

Three tables (all RLS-protected, scoped to `auth.uid()`):
- **profiles** — extends auth.users with name, company, subscription tier, credits
- **invoices** — invoice/estimate documents with JSONB line items
- **invoice_templates** — custom branding templates

Free plan: 3 invoice credits. Pro plan: unlimited (credits not decremented via DB trigger).

## User Preferences

- Keep existing project structure — no restructuring unless explicitly asked
- Supabase is the data layer; do not introduce a separate backend server
