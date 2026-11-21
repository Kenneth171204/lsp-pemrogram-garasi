'use client';

import React from 'react';
import Link from 'next/link';
import {
  Bike,
  Car,
  Zap,
  ShieldCheck,
  Clock,
  FileCheck2,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function HomePage() {
  const { user, loading } = useAuth();

  return (
    <div className="space-y-10 py-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <div className="max-w-3xl space-y-5">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            <ShieldCheck className="h-4 w-4" />
            Uji Kompetensi LSP Pemrogram • Next.js + Supabase
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Sistem Penyewaan Garasi Kendaraan Terpadu
          </h1>
          <p className="text-base leading-relaxed text-slate-600">
            Kelola penyewaan garasi untuk sepeda, sepeda motor, mobil, hingga mobil
            listrik (EV) dengan perhitungan biaya sewa harian/bulanan, pengisian
            daya listrik otomatis, unggah bukti pelunasan, perpanjangan sewa, dan
            pelaporan terstruktur.
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            {!loading && user ? (
              <Link
                href={user.role === 'admin' ? '/admin' : '/penyewa'}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Buka {user.role === 'admin' ? 'Dashboard Admin' : 'Dashboard Penyewa'}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                >
                  Masuk ke Sistem
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Daftar Penyewa Baru
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Bike className="h-5 w-5" />
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Garasi Sepeda (Kode S001)
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            Khusus menampung kendaraan tipe <strong>Sepeda</strong> dan{' '}
            <strong>Sepeda Motor</strong> dengan kode unit otomatis S001 – S999.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Car className="h-5 w-5" />
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Garasi Mobil (Kode C001)
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            Dapat digunakan oleh <strong>Mobil Konvensional</strong> maupun{' '}
            <strong>Mobil Listrik</strong> (tanpa biaya isi listrik).
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <Zap className="h-5 w-5" />
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Garasi Mobil Listrik (Kode E001)
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            Dilengkapi fasilitas isi daya penuh otomatis untuk{' '}
            <strong>Mobil Listrik</strong> sesuai kapasitas baterai &amp; tarif kWh.
          </p>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Sewa Harian &amp; Bulanan Fleksibel
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Sewa harian berlaku 1–29 hari dengan tanggal mulai hari ini. Sewa
              bulanan maksimal 1 bulan per transaksi dengan tarif hemat 25x harga
              harian.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5">
          <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Verifikasi Admin &amp; Bukti Pembayaran
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Pendaftar baru diverifikasi Admin sebelum menyewa. Seluruh transaksi
              sewa dan perpanjangan wajib melampirkan bukti bayar ke Storage.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
