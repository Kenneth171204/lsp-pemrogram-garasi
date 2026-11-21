'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Car, LogOut, ShieldCheck, UserCheck, Clock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <Car className="h-5 w-5" />
          </div>
          <div>
            <span className="block text-base font-bold tracking-tight text-slate-900">
              GarasiKu LSP
            </span>
            <span className="block text-xs text-slate-500">
              Sistem Penyewaan Garasi Kendaraan
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-3">
          {!user ? (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Masuk
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              >
                Daftar Penyewa
              </Link>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href={user.role === 'admin' ? '/admin' : '/penyewa'}
                className="hidden rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-200 sm:inline-flex"
              >
                {user.role === 'admin' ? 'Dashboard Admin' : 'Dashboard Penyewa'}
              </Link>

              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
                {user.role === 'admin' ? (
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                ) : user.status === 'approved' ? (
                  <UserCheck className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Clock className="h-4 w-4 text-amber-600" />
                )}
                <div className="leading-tight">
                  <div className="font-semibold text-slate-800">{user.full_name}</div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    {user.role} • {user.status}
                  </div>
                </div>
              </div>

              <button
                onClick={handleLogout}
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
