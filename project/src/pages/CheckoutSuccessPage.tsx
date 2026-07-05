import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle, Loader2, Sparkles, Zap } from 'lucide-react';

export function CheckoutSuccessPage() {
  const [searchParams] = useSearchParams();
  const plan = searchParams.get('plan') ?? 'pro';
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [refreshed, setRefreshed] = useState(false);

  // Poll for profile update (webhook may take a moment to fire)
  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 10;
    const interval = setInterval(async () => {
      attempts++;
      try {
        await refreshUser();
        setRefreshed(true);
        clearInterval(interval);
      } catch {
        // Keep trying
      }
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setRefreshed(true);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [refreshUser]);

  // Redirect to dashboard after 4 seconds once refreshed
  useEffect(() => {
    if (!refreshed) return;
    const timer = setTimeout(() => navigate('/dashboard'), 4000);
    return () => clearTimeout(timer);
  }, [refreshed, navigate]);

  const isPro = plan === 'pro';

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8 text-center space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="p-4 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30">
            {isPro ? (
              <Sparkles className="w-10 h-10 text-emerald-400" />
            ) : (
              <Zap className="w-10 h-10 text-amber-400" />
            )}
          </div>
        </div>

        {/* Heading */}
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {isPro ? 'Welcome to Pro! 🎉' : '10 Credits Added! ⚡'}
          </h1>
          <p className="text-slate-400">
            {isPro
              ? 'Your account has been upgraded. You now have unlimited invoices, custom branding, and all Pro features.'
              : 'Your 10 invoice credits have been added to your account. They never expire.'}
          </p>
        </div>

        {/* Status */}
        <div className="flex items-center justify-center gap-2 text-sm">
          {refreshed ? (
            <>
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-400">Account updated — redirecting to dashboard…</span>
            </>
          ) : (
            <>
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
              <span className="text-slate-400">Activating your account…</span>
            </>
          )}
        </div>

        {/* Manual redirect */}
        <button
          onClick={() => navigate('/dashboard')}
          className="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-cyan-600 transition-all"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
