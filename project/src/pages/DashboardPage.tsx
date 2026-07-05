import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, Invoice, DashboardStats } from '../lib/api';
import {
  FileText,
  DollarSign,
  Clock,
  Plus,
  Eye,
  FileStack,
  CheckCircle,
  AlertCircle,
  Sparkles,
  TrendingUp,
  ArrowUpRight,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

export function DashboardPage() {
  const { user } = useAuth();
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalInvoices: 0,
    totalRevenue: 0,
    pendingAmount: 0,
    paidInvoices: 0,
    overdueCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [dashStats, invoices] = await Promise.all([
        api.getDashboardStats(),
        api.getInvoices({ limit: 5 }),
      ]);
      setStats(dashStats);
      setRecentInvoices(invoices);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
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

  const statCards = [
    {
      label: 'Total Invoices',
      value: stats.totalInvoices.toString(),
      icon: FileStack,
      gradient: 'from-emerald-500/20 to-cyan-500/20',
      iconColor: 'text-emerald-400',
      borderColor: 'border-emerald-500/20',
    },
    {
      label: 'Total Revenue',
      value: `$${stats.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      gradient: 'from-green-500/20 to-emerald-500/20',
      iconColor: 'text-green-400',
      borderColor: 'border-green-500/20',
    },
    {
      label: 'Pending Amount',
      value: `$${stats.pendingAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      icon: Clock,
      gradient: 'from-amber-500/20 to-orange-500/20',
      iconColor: 'text-amber-400',
      borderColor: 'border-amber-500/20',
    },
    {
      label: 'Paid Invoices',
      value: stats.paidInvoices.toString(),
      icon: CheckCircle,
      gradient: 'from-teal-500/20 to-cyan-500/20',
      iconColor: 'text-teal-400',
      borderColor: 'border-teal-500/20',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Welcome back{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-slate-400 mt-1">
            Here's an overview of your invoicing activity
          </p>
        </div>
        <Link
          to="/create"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-cyan-600 transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:-translate-y-0.5"
        >
          <Plus className="w-5 h-5" />
          Create Invoice
        </Link>
      </div>

      {stats.totalInvoices === 0 && (
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 backdrop-blur-xl rounded-2xl p-8 border border-slate-700/50">
          <div className="flex flex-col md:flex-row items-start gap-6">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30">
              <Sparkles className="w-8 h-8 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-white mb-2">
                Create Your First Invoice
              </h3>
              <p className="text-slate-400 mb-6 max-w-lg">
                Paste your raw notes about work done and let our AI extract client info, line items, and totals automatically. Or build one from scratch.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/create"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white font-medium rounded-xl hover:bg-emerald-600 transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  Try AI Parsing
                </Link>
                <Link
                  to="/templates"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-700 text-white font-medium rounded-xl hover:bg-slate-600 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Set Up Templates
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className={`bg-slate-800/50 backdrop-blur-xl rounded-xl p-6 border ${stat.borderColor} hover:border-slate-600/80 transition-all hover:-translate-y-0.5`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2.5 rounded-xl bg-gradient-to-br ${stat.gradient}`}>
                  <Icon className={`w-5 h-5 ${stat.iconColor}`} />
                </div>
                {stat.label === 'Total Revenue' && stats.totalRevenue > 0 && (
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                )}
              </div>
              <p className="text-2xl font-bold text-white mb-1">{stat.value}</p>
              <p className="text-slate-400 text-sm">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {stats.overdueCount > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm">
            You have <span className="font-semibold">{stats.overdueCount}</span> overdue invoice{stats.overdueCount > 1 ? 's' : ''} that need attention.
          </p>
          <Link to="/invoices?status=overdue" className="ml-auto text-red-400 hover:text-red-300 text-sm font-medium whitespace-nowrap">
            View all
          </Link>
        </div>
      )}

      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Recent Invoices</h2>
          {recentInvoices.length > 0 && (
            <Link
              to="/invoices"
              className="inline-flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
            >
              View All
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        {recentInvoices.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No invoices yet</h3>
            <p className="text-slate-400 mb-6">
              Create your first invoice to see it here
            </p>
            <Link
              to="/create"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white font-medium rounded-xl hover:bg-emerald-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Invoice
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-700/50">
                  <th className="px-6 py-3 font-medium">Invoice</th>
                  <th className="px-6 py-3 font-medium">Client</th>
                  <th className="px-6 py-3 font-medium">Amount</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium sr-only">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {recentInvoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="hover:bg-slate-700/20 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <Link
                        to={`/invoices/${invoice.id}`}
                        className="flex items-center gap-3"
                      >
                        <div className="w-9 h-9 rounded-lg bg-slate-700/80 flex items-center justify-center group-hover:bg-slate-700">
                          <FileText className="w-4 h-4 text-slate-400" />
                        </div>
                        <div>
                          <p className="font-medium text-white text-sm">
                            #{invoice.invoice_number}
                          </p>
                          <p className="text-xs text-slate-500 capitalize">
                            {invoice.type}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-white">{invoice.client_name}</p>
                      {invoice.client_email && (
                        <p className="text-xs text-slate-500">{invoice.client_email}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-white text-sm">
                        ${Number(invoice.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                          invoice.status
                        )} capitalize`}
                      >
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {format(parseISO(invoice.created_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        to={`/invoices/${invoice.id}`}
                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors opacity-0 group-hover:opacity-100"
                        title="View"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
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
