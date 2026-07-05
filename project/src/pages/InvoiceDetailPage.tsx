import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, Invoice } from '../lib/api';
import {
  ArrowLeft,
  Download,
  Trash2,
  Loader2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export function InvoiceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const invoiceRef = useRef<HTMLDivElement>(null);

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchInvoice();
  }, [id]);

  const fetchInvoice = async () => {
    if (!id) return;

    try {
      const data = await api.getInvoice(id);
      setInvoice(data);
    } catch (error) {
      console.error('Error fetching invoice:', error);
      navigate('/invoices');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: Invoice['status']) => {
    if (!invoice) return;

    try {
      await api.updateInvoice(invoice.id, { status: newStatus });
      setInvoice({ ...invoice, status: newStatus });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleDelete = async () => {
    if (!invoice || !confirm('Are you sure you want to delete this invoice?')) return;

    try {
      await api.deleteInvoice(invoice.id);
      navigate('/invoices');
    } catch (error) {
      console.error('Error deleting invoice:', error);
    }
  };

  const handleDownloadPDF = async () => {
    if (!invoiceRef.current || !invoice) return;

    setDownloading(true);
    try {
      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
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

      pdf.save(`${invoice.invoice_number}-${invoice.client_name.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setDownloading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'sent':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'overdue':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'cancelled':
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      default:
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">Invoice not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to="/invoices"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">#{invoice.invoice_number}</h1>
            <p className="text-slate-400 capitalize">{invoice.type}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={invoice.status}
            onChange={(e) => handleStatusChange(e.target.value as Invoice['status'])}
            className={`px-4 py-2 rounded-xl text-sm font-medium border appearance-none cursor-pointer ${getStatusColor(
              invoice.status
            )}`}
          >
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            onClick={handleDownloadPDF}
            disabled={downloading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white font-medium rounded-xl hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {downloading ? 'Generating...' : 'Download PDF'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden shadow-2xl" ref={invoiceRef}>
        <div className="bg-gradient-to-r from-emerald-500 to-cyan-500 p-8 text-white">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold mb-1">{user?.company_name || 'Your Company'}</h2>
              <p className="text-emerald-100">{user?.email}</p>
            </div>
            <div className="text-right">
              <h3 className="text-3xl font-bold uppercase tracking-wide mb-2">
                {invoice.type}
              </h3>
              <p className="text-emerald-100">#{invoice.invoice_number}</p>
            </div>
          </div>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <p className="text-gray-500 text-sm mb-1">Bill To</p>
              <p className="text-gray-900 font-medium">{invoice.client_name}</p>
              <p className="text-gray-600">{invoice.client_email}</p>
              <p className="text-gray-600">{invoice.client_address}</p>
            </div>
            <div className="text-right">
              <div className="mb-2">
                <p className="text-gray-500 text-sm">Date</p>
                <p className="text-gray-900">{format(parseISO(invoice.issued_date), 'MMMM d, yyyy')}</p>
              </div>
              {invoice.due_date && (
                <div>
                  <p className="text-gray-500 text-sm">Due Date</p>
                  <p className="text-gray-900">{format(parseISO(invoice.due_date), 'MMMM d, yyyy')}</p>
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
              {(invoice.items as any[]).map((item: any) => (
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
                <span className="text-gray-900">${Number(invoice.subtotal).toFixed(2)}</span>
              </div>
              {Number(invoice.tax_rate) > 0 && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">Tax ({invoice.tax_rate}%)</span>
                  <span className="text-gray-900">${Number(invoice.tax_amount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between py-3 text-lg font-bold">
                <span className="text-gray-900">Total</span>
                <span className="text-gray-900">${Number(invoice.total).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {invoice.notes && (
            <div className="mt-8 p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm mb-1">Notes</p>
              <p className="text-gray-700">{invoice.notes}</p>
            </div>
          )}

          {invoice.terms && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm mb-1">Terms & Conditions</p>
              <p className="text-gray-700 text-sm">{invoice.terms}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={handleDelete}
          className="inline-flex items-center gap-2 px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>
    </div>
  );
}
