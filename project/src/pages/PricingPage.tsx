import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Check,
  Sparkles,
  Zap,
  Star,
  CreditCard,
  CheckCircle,
  X,
  Loader2,
} from 'lucide-react';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    description: 'Perfect for trying out SmartInvoice AI',
    features: [
      { text: '3 invoices per month', included: true },
      { text: 'Basic templates', included: true },
      { text: 'PDF export', included: true },
      { text: 'AI invoice parsing', included: true },
      { text: 'Custom branding', included: false },
      { text: 'Unlimited invoices', included: false },
    ],
    buttonText: 'Current Plan',
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pro Tier',
    price: 7,
    description: 'Unlimited invoices with premium features',
    features: [
      { text: 'Unlimited invoices', included: true },
      { text: 'Custom templates', included: true },
      { text: 'PDF & preview', included: true },
      { text: 'AI invoice parsing', included: true },
      { text: 'Custom branding', included: true },
      { text: 'Priority support', included: true },
    ],
    buttonText: 'Upgrade to Pro',
    popular: true,
  },
  {
    id: 'credits',
    name: 'Credit Pack',
    price: 5,
    description: '10 invoice credits - no subscription',
    features: [
      { text: '10 invoice credits', included: true },
      { text: 'No recurring payment', included: true },
      { text: 'All basic features', included: true },
      { text: 'Credits never expire', included: true },
      { text: 'Great for occasional use', included: true },
      { text: 'Pro features available', included: true },
    ],
    buttonText: 'Buy Credits',
    popular: false,
    isCreditPack: true,
  },
];

export function PricingPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [showStripeNotice, setShowStripeNotice] = useState(false);

  const handleSubscribe = async (planId: string) => {
    if (!user) return;

    if (planId === 'free') return;

    setLoading(planId);
    setShowStripeNotice(true);
    setLoading(null);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-12 py-8">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-4">
          Simple, Transparent Pricing
        </h1>
        <p className="text-lg text-slate-400">
          Choose the plan that fits your needs. Upgrade or downgrade at any time.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrentPlan = user?.subscription_tier === plan.id || (plan.id === 'free' && !user?.subscription_tier);
          const isLoading = loading === plan.id;

          return (
            <div
              key={plan.id}
              className={`relative bg-slate-800/50 backdrop-blur-xl rounded-2xl border ${
                plan.popular
                  ? 'border-emerald-500/50 ring-1 ring-emerald-500/30'
                  : 'border-slate-700/50'
              } overflow-hidden transition-all hover:shadow-2xl hover:shadow-emerald-500/10`}
            >
              {plan.popular && (
                <div className="absolute top-0 inset-x-0 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-xs font-bold text-center py-1">
                  MOST POPULAR
                </div>
              )}

              <div className={`p-6 ${plan.popular ? 'pt-8' : ''}`}>
                <div className="flex items-center gap-2 mb-2">
                  {plan.id === 'pro' && <Star className="w-5 h-5 text-emerald-400" />}
                  {plan.id === 'credits' && <Zap className="w-5 h-5 text-amber-400" />}
                  {plan.id === 'free' && <Sparkles className="w-5 h-5 text-slate-400" />}
                  <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                </div>

                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-3xl font-bold text-white">${plan.price}</span>
                  {plan.price > 0 && (
                    <span className="text-slate-400">
                      /{plan.isCreditPack ? 'one-time' : 'month'}
                    </span>
                  )}
                </div>

                <p className="text-slate-400 text-sm mb-6">{plan.description}</p>

                <button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={isLoading || isCurrentPlan}
                  className={`w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                    isCurrentPlan
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : plan.popular
                      ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:from-emerald-600 hover:to-cyan-600 shadow-lg shadow-emerald-500/20'
                      : 'bg-slate-700 text-white hover:bg-slate-600'
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : isCurrentPlan ? (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Current Plan
                    </>
                  ) : (
                    plan.buttonText
                  )}
                </button>
              </div>

              <div className="p-6 pt-0 space-y-3">
                {plan.features.map((feature, index) => (
                  <div
                    key={index}
                    className={`flex items-center gap-3 text-sm ${
                      feature.included ? 'text-white' : 'text-slate-500'
                    }`}
                  >
                    {feature.included ? (
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <X className="w-4 h-4 text-slate-600 flex-shrink-0" />
                    )}
                    {feature.text}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {user && (
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Your Subscription</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30">
                <CreditCard className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="font-medium text-white capitalize">
                  {user.subscription_tier === 'pro' ? 'Pro Tier' : 'Free Plan'}
                </p>
                <p className="text-slate-400 text-sm">
                  {user.credits} invoice credits available
                </p>
              </div>
            </div>
            {user.subscription_tier !== 'pro' && (
              <button
                onClick={() => handleSubscribe('pro')}
                className="px-4 py-2 bg-emerald-500 text-white font-medium rounded-lg hover:bg-emerald-600 transition-colors"
              >
                Upgrade Now
              </button>
            )}
          </div>
        </div>
      )}

      {/* Stripe Setup Notice Modal */}
      {showStripeNotice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 max-w-md w-full p-6 relative">
            <button
              onClick={() => setShowStripeNotice(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30">
                <CreditCard className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-white">
                Stripe Integration Required
              </h3>
            </div>

            <p className="text-slate-400 mb-6">
              To accept payments in your application, you'll need to set up Stripe integration. This requires a Stripe account and API keys.
            </p>

            <div className="bg-slate-900/50 rounded-xl p-4 mb-6">
              <p className="text-sm text-slate-300 mb-2 font-medium">Required Environment Variables:</p>
              <code className="text-xs text-emerald-400 block">
                VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...<br />
                STRIPE_SECRET_KEY=sk_test_...<br />
                STRIPE_WEBHOOK_SECRET=whsec_...
              </code>
            </div>

            <div className="space-y-3">
              <a
                href="https://dashboard.stripe.com/register"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-xl text-center hover:from-emerald-600 hover:to-cyan-600 transition-all"
              >
                Create Stripe Account
              </a>
              <a
                href="https://bolt.new/setup/stripe"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 bg-slate-700 text-white font-medium rounded-xl text-center hover:bg-slate-600 transition-all"
              >
                Setup Guide
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="text-center">
        <p className="text-slate-500 text-sm">
          All plans include 256-bit SSL encryption and secure payment processing.
          <br />
          Questions? Contact support@smartinvoice.ai
        </p>
      </div>
    </div>
  );
}
