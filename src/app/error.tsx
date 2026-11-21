'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import { translateError } from '@/lib/errors';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const friendlyMessage = translateError(
    error,
    'Terjadi kesalahan tak terduga saat memuat halaman.'
  );

  return (
    <div className="mx-auto max-w-lg py-12">
      <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">
          Terjadi Gangguan Sistem
        </h1>
        <p className="mt-2 text-sm text-slate-600">{friendlyMessage}</p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <RotateCcw className="h-4 w-4" />
            Coba Lagi
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Home className="h-4 w-4" />
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
