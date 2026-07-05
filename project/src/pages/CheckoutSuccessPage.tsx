import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, CheckCircle, Loader2, Sparkles, Zap } from 'lucide-react';

type Status = 'polling' | 'confirmed' | 'pending';

export function CheckoutSuccessPage() {
  const [searchParams] = useSearchParams();
  const plan = searchParams.get('plan') ?? 'pro';
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState<Status>('polling');

  // Snapshot of the user's profile at the moment they land here.
  // We use this to detect an actual change after the webhook fires.
  const baselineRef = useRef({
    tier: user?.subscription_tier ?? 'free',
    credits: user?.credits ?? 0,
  });

  function isUpgradeApplied(currentUser: typeof user): boolean {
    if (!currentUser) return false;
    if (plan === 'pro') return currentUser.subscription_tier === 'pro';
    return (currentUser.credits ?? 0) > baselineRef.current.credits;
  }

  // Poll until the webhook-driven profile change is reflected, or give up.
  useEffect(() => {
    const MAX_ATTEMPTS = 12;   // 12 × 1.5 s = 18 s max wait
    const INTERVAL_MS  = 1_500;
    let attempts = 0;

    const id = setInterval(async () => {
      attempts++;
      try {
        await refreshUser();
      } catch {
        // keep polling
      }

      if (attempts >= MAX_ATTEMPTS) {
        clearInterval(id);
        // Time-box expired without a confirmed profile change.
        // Show "pending" rather than false success — the user's money
        // is safe; the webhook may just be delayed.
        setStatus((prev) => (prev === 'confirmed' ? 'confirmed' : 'pending'));
      }
    }, INTERVAL_MS);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch `user` (updated by refreshUser) and confirm as soon as the
  // profile actually reflects the expected change.
  useEffect(() => {
    if (status !== 'polling') return;
    if (isUpgradeApplied(user)) setStatus('confirmed');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Redirect to dashboard 4 s after confirmed — not after "pending".
  useEffect(() => {
    if (status !== 'confirmed') return;
    const t = setTimeout(() => navigate('/dashboard'), 4_000);
    return () => clearTimeout(t);
  }, [status, navigate]);

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
        <div className="flex items-center justify-center gap-2 text-sm min-h-[1.5rem]">
          {status === 'confirmed' && (
            <>
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-emerald-400">Account updated — redirecting to dashboard…</span>
            </>
          )}
          {status === 'polling' && (
            <>
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0" />
              <span className="text-slate-400">Activating your account…</span>
            </>
          )}
          {status === 'pending' && (
            <>
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-amber-400">
                Still processing — check your dashboard in a moment.
              </span>
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
