import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, InvoiceItem } from '../lib/api';
import { parseRawNotesWithAI, generateInvoiceNumber } from '../lib/aiParser';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  Sparkles,
  FileText,
  User,
  Mail,
  MapPin,
  Plus,
  Trash2,
  Save,
  Eye,
  ArrowRight,
  ArrowLeft,
  Calendar,
  AlertCircle,
  CheckCircle,
  Loader2,
  Download,
} from 'lucide-react';

type Step = 'input' | 'review' | 'finalize';

export function CreateInvoicePage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('input');
  const [rawNotes, setRawNotes] = useState('');
  const [invoiceType, setInvoiceType] = useState<'invoice' | 'estimate'>('invoice');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [total, setTotal] = useState(0);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    const defaultDueDate = new Date();
    defaultDueDate.setDate(defaultDueDate.getDate() + 30);
    setDueDate(defaultDueDate.toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    const newSubtotal = items.reduce((sum, item) => sum + item.total, 0);
    const newTaxAmount = newSubtotal * (taxRate / 100);
    const newTotal = newSubtotal + newTaxAmount;
    setSubtotal(newSubtotal);
    setTaxAmount(newTaxAmount);
    setTotal(newTotal);
  }, [items, taxRate]);

  const previewRef = useRef<HTMLDivElement>(null);
  const parseAbortRef = useRef<AbortController | null>(null);

  const handleDownloadPDF = async () => {
    if (!previewRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(previewRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      const filename = `${invoiceType}-${clientName.replace(/\s+/g, '_') || 'draft'}.pdf`;
      pdf.save(filename);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setDownloading(false);
    }
  };

  const handleAIParse = async () => {
    if (!rawNotes.trim()) {
      setError('Please enter some notes to parse');
      return;
    }

    // Cancel any in-flight parse request before starting a new one
    parseAbortRef.current?.abort();
    const controller = new AbortController();
    parseAbortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const parsed = await parseRawNotesWithAI(rawNotes, controller.signal);
      // Ignore result if this request was superseded
      if (controller.signal.aborted) return;
      setClientName(parsed.client_name || '');
      setClientEmail(parsed.client_email || '');
      setClientAddress(parsed.client_address || '');
      setItems(parsed.items.length > 0 ? parsed.items : [
        { id: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0, total: 0 },
      ]);
      setNotes(parsed.notes);
      if (parsed.payment_terms) setTerms(parsed.payment_terms);
      if (parsed.due_date) {
        // Specific calendar date returned (e.g. "30 july" → "2026-07-30")
        setDueDate(parsed.due_date);
      } else if (parsed.due_days) {
        const d = new Date();
        d.setDate(d.getDate() + parsed.due_days);
        setDueDate(d.toISOString().split('T')[0]);
      }
      setTaxRate(0);
      setStep('review');
    } catch {
      setError('Failed to parse notes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = () => {
    setItems([
      ...items,
      { id: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0, total: 0 },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length === 1) return;
    setItems(items.filter((item) => item.id !== id));
  };

  const handleItemChange = (
    id: string,
    field: keyof InvoiceItem,
    value: string | number
  ) => {
    setItems(
      items.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unit_price') {
          updated.total = Number(updated.quantity) * Number(updated.unit_price);
        }
        return updated;
      })
    );
  };

  const handleSaveInvoice = async () => {
    if (!user) return;

    setSaving(true);
    setError(null);

    try {
      if (user.subscription_tier !== 'pro' && user.credits <= 0) {
        setError('You have no credits remaining. Upgrade to Pro for unlimited invoices.');
        setSaving(false);
        return;
      }

      const invoiceData = {
        type: invoiceType,
        client_name: clientName || 'Client',
        client_email: clientEmail || undefined,
        client_address: clientAddress || undefined,
        items: items.filter((i) => i.description),
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        notes: notes || undefined,
        terms: terms || undefined,
        due_date: dueDate || undefined,
        raw_notes: rawNotes,
      };

      const savedInvoice = await api.createInvoice(invoiceData);
      // Refresh so the credit count in the header reflects the DB decrement
      await refreshUser();
      navigate(`/invoices/${savedInvoice.id}`);
    } catch {
      setError('Failed to save invoice. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const canProceed = rawNotes.trim().length > 0;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-4 mb-8">
        {(['input', 'review', 'finalize'] as Step[]).map((s, index) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-medium transition-all ${
                step === s
                  ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white'
                  : index < ['input', 'review', 'finalize'].indexOf(step)
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-700 text-slate-400'
              }`}
            >
              {index < ['input', 'review', 'finalize'].indexOf(step) ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                index + 1
              )}
            </div>
            <span
              className={`hidden sm:block text-sm font-medium ${
                step === s ? 'text-white' : 'text-slate-400'
              }`}
            >
              {s === 'input' ? 'Input Notes' : s === 'review' ? 'Review' : 'Finalize'}
            </span>
            {index < 2 && (
              <div
                className={`w-12 sm:w-20 h-0.5 ${
                  index < ['input', 'review', 'finalize'].indexOf(step)
                    ? 'bg-emerald-500'
                    : 'bg-slate-700'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Step 1: Input */}
      {step === 'input' && (
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
          <div className="p-6 border-b border-slate-700/50">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30">
                <Sparkles className="w-5 h-5 text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">Paste Your Notes</h2>
            </div>
            <p className="text-slate-400">
              Paste your raw notes about the work done, and AI will extract the details.
            </p>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Document Type
              </label>
              <div className="flex gap-4">
                <button
                  onClick={() => setInvoiceType('invoice')}
                  className={`flex-1 py-3 px-4 rounded-xl border transition-all ${
                    invoiceType === 'invoice'
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-white'
                      : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <FileText className="w-5 h-5 mx-auto mb-2" />
                  Invoice
                </button>
                <button
                  onClick={() => setInvoiceType('estimate')}
                  className={`flex-1 py-3 px-4 rounded-xl border transition-all ${
                    invoiceType === 'estimate'
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-white'
                      : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <FileText className="w-5 h-5 mx-auto mb-2" />
                  Estimate
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="rawNotes"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Your Notes
              </label>
              <textarea
                id="rawNotes"
                value={rawNotes}
                onChange={(e) => setRawNotes(e.target.value)}
                rows={10}
                placeholder={`Example:
Client: John Smith
Email: john@example.com
Address: 123 Main St, New York, NY

Work done this week:
- Website redesign: $1200
- Logo design: $400
- SEO optimization (5 hours) at $100/hr: $500

Notes: Rush delivery requested
Payment due in 30 days`}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all resize-none"
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleAIParse}
                disabled={!canProceed || loading}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Parse with AI
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Review */}
      {step === 'review' && (
        <div className="space-y-6">
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="p-6 border-b border-slate-700/50">
              <h2 className="text-xl font-semibold text-white">Client Information</h2>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  <User className="w-4 h-4 inline mr-2" />
                  Client Name
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  <Mail className="w-4 h-4 inline mr-2" />
                  Client Email
                </label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  <MapPin className="w-4 h-4 inline mr-2" />
                  Client Address
                </label>
                <input
                  type="text"
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  <Calendar className="w-4 h-4 inline mr-2" />
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Line Items</h2>
              <button
                onClick={handleAddItem}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-all"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </button>
            </div>
            <div className="p-6 space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-12 gap-4 items-end"
                >
                  <div className="col-span-12 md:col-span-5">
                    <label className="block text-xs font-medium text-slate-400 mb-2">
                      Description
                    </label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) =>
                        handleItemChange(item.id, 'description', e.target.value)
                      }
                      placeholder="Item description"
                      className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <label className="block text-xs font-medium text-slate-400 mb-2">
                      Qty
                    </label>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) =>
                        handleItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)
                      }
                      min="0"
                      className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <label className="block text-xs font-medium text-slate-400 mb-2">
                      Rate
                    </label>
                    <input
                      type="number"
                      value={item.unit_price}
                      onChange={(e) =>
                        handleItemChange(item.id, 'unit_price', parseFloat(e.target.value) || 0)
                      }
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="col-span-3 md:col-span-2">
                    <label className="block text-xs font-medium text-slate-400 mb-2">
                      Total
                    </label>
                    <p className="px-3 py-2 text-white text-sm font-medium">
                      ${item.total.toFixed(2)}
                    </p>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      disabled={items.length === 1}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              <div className="border-t border-slate-700 pt-4 mt-4 space-y-3">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <div className="flex items-center gap-2">
                    <span>Tax</span>
                    <input
                      type="number"
                      value={taxRate}
                      onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                      min="0"
                      max="100"
                      step="0.1"
                      className="w-20 px-2 py-1 bg-slate-700/50 border border-slate-600 rounded text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span>%</span>
                  </div>
                  <span>${taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-semibold text-white border-t border-slate-600 pt-3">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="p-6 border-b border-slate-700/50">
              <h2 className="text-xl font-semibold text-white">Additional Details</h2>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Additional notes for your client..."
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Terms & Conditions
                </label>
                <textarea
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  rows={3}
                  placeholder="Payment terms, conditions, etc..."
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all resize-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep('input')}
              className="inline-flex items-center gap-2 px-6 py-3 text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </button>
            <button
              onClick={() => setStep('finalize')}
              disabled={items.filter((i) => i.description).length === 0}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Eye className="w-5 h-5" />
              Preview & Save
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Finalize */}
      {step === 'finalize' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl overflow-hidden shadow-2xl" ref={previewRef}>
            <div className="bg-gradient-to-r from-emerald-500 to-cyan-500 p-8 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold mb-1">{user?.company_name || 'Your Company'}</h2>
                  <p className="text-emerald-100">{user?.email}</p>
                </div>
                <div className="text-right">
                  <h3 className="text-3xl font-bold uppercase tracking-wide mb-2">
                    {invoiceType}
                  </h3>
                  <p className="text-emerald-100">#{generateInvoiceNumber()}</p>
                </div>
              </div>
            </div>

            <div className="p-8">
              <div className="grid grid-cols-2 gap-8 mb-8">
                <div>
                  <p className="text-gray-500 text-sm mb-1">Bill To</p>
                  <p className="text-gray-900 font-medium">{clientName || 'Client Name'}</p>
                  <p className="text-gray-600">{clientEmail}</p>
                  <p className="text-gray-600">{clientAddress}</p>
                </div>
                <div className="text-right">
                  <div className="mb-2">
                    <p className="text-gray-500 text-sm">Date</p>
                    <p className="text-gray-900">{new Date().toLocaleDateString()}</p>
                  </div>
                  {dueDate && (
                    <div>
                      <p className="text-gray-500 text-sm">Due Date</p>
                      <p className="text-gray-900">{new Date(dueDate).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
              </div>

              <table className="w-full mb-8">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-3 text-gray-700 font-medium">Description</th>
                    <th className="text-center py-3 text-gray-700 font-medium">Qty</th>
                    <th className="text-right py-3 text-gray-700 font-medium">Rate</th>
                    <th className="text-right py-3 text-gray-700 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items
                    .filter((i) => i.description)
                    .map((item) => (
                      <tr key={item.id} className="border-b border-gray-100">
                        <td className="py-3 text-gray-900">{item.description}</td>
                        <td className="text-center py-3 text-gray-600">{item.quantity}</td>
                        <td className="text-right py-3 text-gray-600">${item.unit_price.toFixed(2)}</td>
                        <td className="text-right py-3 text-gray-900 font-medium">${item.total.toFixed(2)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>

              <div className="flex justify-end">
                <div className="w-64">
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="text-gray-900">${subtotal.toFixed(2)}</span>
                  </div>
                  {taxRate > 0 && (
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-600">Tax ({taxRate}%)</span>
                      <span className="text-gray-900">${taxAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-3 text-lg font-bold">
                    <span className="text-gray-900">Total</span>
                    <span className="text-gray-900">${total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {notes && (
                <div className="mt-8 p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-500 text-sm mb-1">Notes</p>
                  <p className="text-gray-700">{notes}</p>
                </div>
              )}

              {terms && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-500 text-sm mb-1">Terms & Conditions</p>
                  <p className="text-gray-700 text-sm">{terms}</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep('review')}
              className="inline-flex items-center gap-2 px-6 py-3 text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Edit
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={handleDownloadPDF}
                disabled={downloading}
                className="inline-flex items-center gap-2 px-6 py-3 bg-slate-700 text-white font-medium rounded-xl hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {downloading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
                {downloading ? 'Generating...' : 'Download PDF'}
              </button>
              <button
                onClick={handleSaveInvoice}
                disabled={saving}
                className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/20"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Save {invoiceType === 'invoice' ? 'Invoice' : 'Estimate'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
