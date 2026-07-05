import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api, UserProfile } from '../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AppUser extends UserProfile {
  // UserProfile already has: id, email, full_name, company_name,
  //   subscription_tier, credits, stripe_customer_id, stripe_subscription_id
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Build AppUser from a Supabase auth user
  async function loadProfile(authUser: User): Promise<AppUser | null> {
    try {
      const profile = await api.getProfile();
      if (!profile) return null;
      return {
        ...profile,
        email: profile.email || authUser.email || '',
      };
    } catch {
      // Return a minimal profile so the user isn't stuck on the loading screen
      return {
        id: authUser.id,
        email: authUser.email ?? '',
        full_name: authUser.user_metadata?.full_name ?? '',
        company_name: '',
        subscription_tier: 'free',
        credits: 3,
      };
    }
  }

  async function refreshUser(): Promise<void> {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const appUser = await loadProfile(authUser);
      setUser(appUser);
    }
  }

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const appUser = await loadProfile(session.user);
        setUser(appUser);
      }
      setLoading(false);
    });

    // Listen to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          const appUser = await loadProfile(session.user);
          setUser(appUser);
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── Auth actions ───────────────────────────────────────────────────────────

  async function signIn(
    email: string,
    password: string
  ): Promise<{ error: AuthError | null }> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signUp(
    email: string,
    password: string,
    fullName: string
  ): Promise<{ error: AuthError | null }> {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    return { error };
  }

  async function signInWithGoogle(): Promise<{ error: AuthError | null }> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });
    return { error };
  }

  async function signOut(): Promise<void> {
    await supabase.auth.signOut();
    setUser(null);
  }

  // ── Value ──────────────────────────────────────────────────────────────────

  const value: AuthContextValue = {
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
