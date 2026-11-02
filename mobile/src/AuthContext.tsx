import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, loadStoredToken, setToken, setUnauthorizedHandler } from './api';
import { registerForPushToken } from './push';
import { Meta, Profile } from './types';

interface AuthState {
  loading: boolean;
  signedIn: boolean;
  email: string | null;
  profile: Profile | null;
  meta: Meta | null;
  login(email: string, password: string): Promise<{ requiresVerification?: boolean; email?: string } | void>;
  register(email: string, password: string, fullName: string): Promise<{ requiresVerification: boolean; email: string; message: string }>;
  verifyEmail(email: string, code: string): Promise<void>;
  socialLogin(provider: 'google' | 'apple', email: string, fullName?: string): Promise<{ requiresVerification?: boolean; email?: string; message?: string } | void>;
  resendCode(email: string): Promise<{ message: string }>;
  logout(): Promise<void>;
  saveProfile(p: Profile): Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider eksik');
  return v;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);

  const loadSession = useCallback(async () => {
    const [me, m] = await Promise.all([
      api<{ email: string; profile: Profile }>('/profile'),
      api<Meta>('/jobs/meta'),
    ]);
    setEmail(me.email);
    setProfile(me.profile);
    setMeta(m);
    setSignedIn(true);
    // Push token'ı arka planda kaydet
    registerForPushToken().then((token) => {
      if (token) api('/profile/push-token', { method: 'PUT', body: { token } }).catch(() => {});
    });
  }, []);

  const logout = useCallback(async () => {
    await api('/profile/push-token', { method: 'PUT', body: { token: null } }).catch(() => {});
    await setToken(null);
    setSignedIn(false);
    setProfile(null);
    setEmail(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setSignedIn(false);
    });
    (async () => {
      try {
        if (await loadStoredToken()) await loadSession();
      } catch {
        await setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadSession]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      signedIn,
      email,
      profile,
      meta,
      async login(em, password) {
        try {
          const r = await api<{ token: string }>('/auth/login', { method: 'POST', body: { email: em, password } });
          await setToken(r.token);
          await loadSession();
        } catch (e: any) {
          if (e.data && e.data.requiresVerification) {
            return { requiresVerification: true, email: e.data.email || em };
          }
          throw e;
        }
      },
      async register(em, password, fullName) {
        return await api<{ requiresVerification: boolean; email: string; message: string }>('/auth/register', {
          method: 'POST',
          body: { email: em, password, fullName },
        });
      },
      async verifyEmail(em, code) {
        const r = await api<{ token: string; message: string }>('/auth/verify-email', {
          method: 'POST',
          body: { email: em, code },
        });
        await setToken(r.token);
        await loadSession();
      },
      async socialLogin(provider, email, fullName) {
        const r = await api<{ token?: string; requiresVerification?: boolean; email?: string; message: string }>('/auth/social', {
          method: 'POST',
          body: { provider, email, fullName },
        });
        if (r.requiresVerification) {
          return { requiresVerification: true, email: r.email || email, message: r.message };
        }
        if (r.token) {
          await setToken(r.token);
          await loadSession();
        }
      },
      async resendCode(em) {
        return await api<{ message: string }>('/auth/resend-code', {
          method: 'POST',
          body: { email: em },
        });
      },
      logout,
      async saveProfile(p) {
        const r = await api<{ profile: Profile }>('/profile', { method: 'PUT', body: p });
        setProfile(r.profile);
      },
    }),
    [loading, signedIn, email, profile, meta, loadSession, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
