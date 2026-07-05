import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import {
  User,
  Building,
  Mail,
  Save,
  CheckCircle,
  AlertCircle,
  Loader2,
  Shield,
} from 'lucide-react';

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setCompanyName(user.company_name || '');
    }
  }, [user]);

  const handleSave = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);
    setSaved(false);

    try {
      await api.updateProfile({
        full_name: fullName,
        company_name: companyName,
      });
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Failed to save changes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 mt-1">Manage your account settings</p>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="p-6 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Profile Information</h2>
          <p className="text-slate-400 text-sm mt-1">
            Update your personal and company details
          </p>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {saved && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <p className="text-emerald-400 text-sm">Settings saved successfully!</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <Mail className="w-4 h-4 inline mr-2" />
              Email Address
            </label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full px-4 py-3 bg-slate-700/30 border border-slate-600 rounded-xl text-slate-400 cursor-not-allowed"
            />
            <p className="text-xs text-slate-500 mt-1">
              Email cannot be changed. Contact support if needed.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <User className="w-4 h-4 inline mr-2" />
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <Building className="w-4 h-4 inline mr-2" />
              Company Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Inc."
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              This will appear on your invoices
            </p>
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={handleSave}
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              Save Changes
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="p-6 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Subscription</h2>
          <p className="text-slate-400 text-sm mt-1">
            View your current plan and billing
          </p>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className={`px-4 py-2 rounded-lg font-medium ${
                  user?.subscription_tier === 'pro'
                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {user?.subscription_tier === 'pro' ? 'Pro Plan' : 'Free Plan'}
              </div>
              <span className="text-slate-400">
                {user?.credits ?? 0} invoice credits
              </span>
            </div>
            {user?.subscription_tier !== 'pro' && (
              <a
                href="/pricing"
                className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
              >
                Upgrade
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="p-6 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            Security
          </h2>
        </div>
        <div className="p-6">
          <p className="text-slate-400 text-sm">
            Your account is protected with industry-standard security measures. All data is encrypted at rest and in transit.
          </p>
        </div>
      </div>
    </div>
  );
}
