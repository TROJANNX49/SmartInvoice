import { Link } from 'react-router-dom';
import {
  FileText,
  Sparkles,
  Zap,
  Shield,
  ArrowRight,
  Check,
  Star,
  Clock,
  Download,
} from 'lucide-react';

const features = [
  {
    icon: Sparkles,
    title: 'AI-Powered Parsing',
    description:
      'Paste your raw notes and our AI instantly extracts client info, line items, and totals into a professional invoice.',
  },
  {
    icon: Zap,
    title: 'Generate in Seconds',
    description:
      'No more manual data entry. Turn messy project notes into clean, ready-to-send invoices faster than ever.',
  },
  {
    icon: Download,
    title: 'PDF Export',
    description:
      'Download beautifully formatted PDF invoices ready to send to clients. Works offline, no print dialog needed.',
  },
  {
    icon: Shield,
    title: 'Secure & Private',
    description:
      'Your data is encrypted at rest and in transit. Only you can access your invoices and client information.',
  },
  {
    icon: Clock,
    title: 'Track Payments',
    description:
      'Mark invoices as sent, paid, or overdue. Keep tabs on pending revenue and outstanding balances at a glance.',
  },
  {
    icon: Star,
    title: 'Custom Templates',
    description:
      'Create branded templates with your colors and company details. Apply them to any invoice with one click.',
  },
];

const steps = [
  {
    number: '01',
    title: 'Paste your notes',
    description: 'Drop in your raw project notes, time logs, or work descriptions.',
  },
  {
    number: '02',
    title: 'AI extracts details',
    description: 'Client name, line items, rates, and totals are parsed automatically.',
  },
  {
    number: '03',
    title: 'Review & send',
    description: 'Edit anything, download as PDF, and send to your client.',
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-900">
      {/* Navigation */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white">SmartInvoice</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/auth"
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/auth"
              className="px-5 py-2 text-sm font-semibold bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-lg hover:from-emerald-600 hover:to-cyan-600 transition-all shadow-md shadow-emerald-500/20"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-sm text-emerald-400 font-medium mb-8">
            <Sparkles className="w-4 h-4" />
            AI-powered invoice generation
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-tight tracking-tight mb-6">
            Turn raw notes into{' '}
            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              professional invoices
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Stop wrestling with spreadsheets. Paste your project notes and let AI
            extract client details, line items, and totals into a polished invoice in
            seconds.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-cyan-600 transition-all shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5"
            >
              Start Creating Invoices
              <ArrowRight className="w-5 h-5" />
            </Link>
            <span className="text-sm text-slate-500">
              Free plan includes 3 invoices
            </span>
          </div>
        </div>
      </section>

      {/* Invoice Preview Mockup */}
      <section className="px-6 pb-24">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-3xl blur-3xl" />
            <div className="relative bg-slate-800/80 backdrop-blur-xl rounded-2xl border border-slate-700/60 p-2 shadow-2xl">
              <div className="bg-white rounded-xl overflow-hidden">
                {/* Mock invoice header */}
                <div className="bg-gradient-to-r from-emerald-500 to-cyan-500 p-6 text-white">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-lg font-bold">Acme Design Co.</p>
                      <p className="text-emerald-100 text-sm">hello@acmedesign.co</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">INVOICE</p>
                      <p className="text-emerald-100 text-sm">#INV-2026-0042</p>
                    </div>
                  </div>
                </div>
                {/* Mock invoice body */}
                <div className="p-6">
                  <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                      <p className="text-gray-400 text-xs mb-1">Bill To</p>
                      <p className="text-gray-800 font-medium text-sm">John Smith</p>
                      <p className="text-gray-500 text-xs">john@startup.io</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-400 text-xs mb-1">Due Date</p>
                      <p className="text-gray-800 text-sm">August 4, 2026</p>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 text-gray-500 font-medium text-xs">Description</th>
                        <th className="text-center py-2 text-gray-500 font-medium text-xs">Qty</th>
                        <th className="text-right py-2 text-gray-500 font-medium text-xs">Rate</th>
                        <th className="text-right py-2 text-gray-500 font-medium text-xs">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-700">
                      <tr className="border-b border-gray-100">
                        <td className="py-2">Website Redesign</td>
                        <td className="text-center py-2">1</td>
                        <td className="text-right py-2">$3,200.00</td>
                        <td className="text-right py-2 font-medium">$3,200.00</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-2">SEO Optimization</td>
                        <td className="text-center py-2">8</td>
                        <td className="text-right py-2">$125.00</td>
                        <td className="text-right py-2 font-medium">$1,000.00</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-2">Logo Design</td>
                        <td className="text-center py-2">1</td>
                        <td className="text-right py-2">$800.00</td>
                        <td className="text-right py-2 font-medium">$800.00</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="flex justify-end mt-4">
                    <div className="w-48">
                      <div className="flex justify-between py-1 text-sm text-gray-500">
                        <span>Subtotal</span>
                        <span>$5,000.00</span>
                      </div>
                      <div className="flex justify-between py-2 text-base font-bold text-gray-900 border-t border-gray-200 mt-1">
                        <span>Total</span>
                        <span>$5,000.00</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="px-6 py-24 border-t border-slate-800">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Three steps. Done.
            </h2>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">
              From messy notes to professional invoice in under a minute.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step) => (
              <div key={step.number} className="relative">
                <div className="text-5xl font-bold text-emerald-500/20 mb-4">
                  {step.number}
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  {step.title}
                </h3>
                <p className="text-slate-400 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="px-6 py-24 border-t border-slate-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Everything you need to get paid
            </h2>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">
              Professional invoicing tools built for freelancers, consultants, and small teams.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="p-6 rounded-2xl border border-slate-800 bg-slate-800/30 hover:border-slate-700 transition-all group"
                >
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Icon className="w-5 h-5 text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing Teaser */}
      <section className="px-6 py-24 border-t border-slate-800">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Simple pricing, no surprises
            </h2>
            <p className="text-slate-400 text-lg">
              Start free. Upgrade when you need more.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Free */}
            <div className="p-6 rounded-2xl border border-slate-700/80 bg-slate-800/40">
              <h3 className="text-xl font-bold text-white mb-1">Free</h3>
              <p className="text-slate-400 text-sm mb-4">Perfect to get started</p>
              <p className="text-3xl font-bold text-white mb-6">
                $0<span className="text-base font-normal text-slate-500">/mo</span>
              </p>
              <ul className="space-y-3 mb-6">
                {['3 invoices per month', 'AI parsing', 'PDF export', 'Basic templates'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-300">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/auth"
                className="block w-full py-3 text-center font-semibold text-white bg-slate-700 rounded-xl hover:bg-slate-600 transition-colors"
              >
                Get Started
              </Link>
            </div>

            {/* Pro */}
            <div className="p-6 rounded-2xl border border-emerald-500/50 bg-slate-800/40 ring-1 ring-emerald-500/20 relative">
              <div className="absolute -top-3 left-6 px-3 py-0.5 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-xs font-bold rounded-full">
                POPULAR
              </div>
              <h3 className="text-xl font-bold text-white mb-1">Pro</h3>
              <p className="text-slate-400 text-sm mb-4">For active freelancers</p>
              <p className="text-3xl font-bold text-white mb-6">
                $7<span className="text-base font-normal text-slate-500">/mo</span>
              </p>
              <ul className="space-y-3 mb-6">
                {['Unlimited invoices', 'Custom branding', 'All templates', 'Priority support'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-300">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/auth"
                className="block w-full py-3 text-center font-semibold text-white bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl hover:from-emerald-600 hover:to-cyan-600 transition-all shadow-lg shadow-emerald-500/20"
              >
                Start Pro Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24 border-t border-slate-800">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to get paid faster?
          </h2>
          <p className="text-slate-400 text-lg mb-8">
            Join thousands of freelancers who save hours every week on invoicing.
          </p>
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-cyan-600 transition-all shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 text-lg"
          >
            Create Your First Invoice
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-slate-800">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white">SmartInvoice</span>
          </div>
          <p className="text-slate-500 text-sm">
            Built for freelancers who value their time.
          </p>
        </div>
      </footer>
    </div>
  );
}
