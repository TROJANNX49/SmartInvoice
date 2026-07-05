import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, Invoice } from '../lib/api';
import {
  FileText,
  Plus,
  Search,
  Eye,
  Download,
  Trash2,
  FileStack,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

type FilterStatus = 'all' | 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
type FilterType = 'all' | 'invoice' | 'estimate';

export function InvoicesPage() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');

  useEffect(() => {
    fetchInvoices();
  }, [statusFilter, typeFilter]);

  const fetchInvoices = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const data = await api.getInvoices({
        status: statusFilter,
        type: typeFilter,
      });
      setInvoices(data || []);
    } catch (error) {
      console.error('Error fetching invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;

    try {
      await api.deleteInvoice(id);
      setInvoices(invoices.filter((inv) => inv.id !== id));
    } catch (error) {
      console.error('Error deleting invoice:', error);
    }
  };

  const handleStatusChange = async (id: string, newStatus: Invoice['status']) => {
    try {
      await api.updateInvoice(id, { status: newStatus });
      setInvoices(
        invoices.map((inv) => (inv.id === id ? { ...inv, status: newStatus } : inv))
      );
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const filteredInvoices = invoices.filter(
    (inv) =>
      inv.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.client_email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Invoices</h1>
          <p className="text-slate-400 mt-1">Manage your invoices and estimates</p>
        </div>
        <Link
          to="/create"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-cyan-600 transition-all shadow-lg shadow-emerald-500/20"
        >
          <Plus className="w-5 h-5" />
          Create New
        </Link>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="p-4 border-b border-slate-700/50 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search invoices..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
              className="px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as FilterType)}
              className="px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Types</option>
              <option value="invoice">Invoices</option>
              <option value="estimate">Estimates</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-12 text-center">
            <FileStack className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No invoices found</h3>
            <p className="text-slate-400 mb-6">
              {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first invoice to get started'}
            </p>
            <Link
              to="/create"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white font-medium rounded-lg hover:bg-emerald-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Invoice
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-slate-400 border-b border-slate-700/50">
                  <th className="px-6 py-4 font-medium">Invoice</th>
                  <th className="px-6 py-4 font-medium">Client</th>
                  <th className="px-6 py-4 font-medium">Amount</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Date</th>
                  <th className="px-6 py-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filteredInvoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <Link
                        to={`/invoices/${invoice.id}`}
                        className="flex items-center gap-3"
                      >
                        <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-slate-400" />
                        </div>
                        <div>
                          <p className="font-medium text-white">
                            #{invoice.invoice_number}
                          </p>
                          <p className="text-sm text-slate-400 capitalize">
                            {invoice.type}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-white">{invoice.client_name}</p>
                      <p className="text-sm text-slate-400">{invoice.client_email}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-white">
                        ${Number(invoice.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={invoice.status}
                        onChange={(e) =>
                          handleStatusChange(invoice.id, e.target.value as Invoice['status'])
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border appearance-none cursor-pointer ${getStatusColor(
                          invoice.status
                        )}`}
                      >
                        <option value="draft">Draft</option>
                        <option value="sent">Sent</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {format(parseISO(invoice.created_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/invoices/${invoice.id}`}
                          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <Link
                          to={`/invoices/${invoice.id}?download=true`}
                          className="p-2 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(invoice.id)}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
