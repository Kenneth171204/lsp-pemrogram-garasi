'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AuthService } from '@/services/AuthService';
import { User } from '@/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  setSessionUser: (user: User | null) => void;
  refreshUser: () => Promise<User | null>;
  logout: () => void;
}

const STORAGE_KEY = 'garasi_lsp_user';
const authService = new AuthService();

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const setSessionUser = useCallback((nextUser: User | null) => {
    setUser(nextUser);
    if (typeof window !== 'undefined') {
      if (nextUser) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    if (!user?.id) return null;
    try {
      const latest = await authService.getUserById(user.id);
      if (latest) {
        setSessionUser(latest);
        return latest;
      }
    } catch {
      // Abaikan error sinkronisasi agar sesi tidak hilang saat offline
    }
    return user;
  }, [user, setSessionUser]);

  const logout = useCallback(() => {
    setSessionUser(null);
  }, [setSessionUser]);

  useEffect(() => {
    const init = async () => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as User;
          setUser(parsed);
          if (parsed?.id) {
            try {
              const fresh = await authService.getUserById(parsed.id);
              if (fresh) {
                setSessionUser(fresh);
              }
            } catch {
              // Gunakan sesi lokal jika server tidak terjangkau
            }
          }
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [setSessionUser]);

  return (
    <AuthContext.Provider
      value={{ user, loading, setSessionUser, refreshUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus digunakan di dalam AuthProvider.');
  }
  return ctx;
}
