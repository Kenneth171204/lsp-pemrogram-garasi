'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CalendarPlus,
  CheckCircle2,
  ExternalLink,
  FileBarChart2,
  PlusSquare,
  Upload,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { AuthService } from '@/services/AuthService';
import { GarageService } from '@/services/GarageService';
import { RentalService } from '@/services/RentalService';
import { StorageService } from '@/services/StorageService';
import {
  GARAGE_TYPE_LABELS,
  USER_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  formatDateID,
  formatRupiah,
} from '@/lib/format';
import {
  Garage,
  GarageType,
  RentalWithDetails,
  ReportFilterInput,
  User,
  UserStatus,
} from '@/types';

const authService = new AuthService();
const garageService = new GarageService();
const rentalService = new RentalService();
const storageService = new StorageService();

type AdminTab = 'verify' | 'garages' | 'extend' | 'reports';

const MONTH_OPTIONS = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
];

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [activeTab, setActiveTab] = useState<AdminTab>('verify');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Tab 1: Verifikasi Pendaftar Baru
  const [tenants, setTenants] = useState<User[]>([]);
  const [tenantStatusFilter, setTenantStatusFilter] = useState<UserStatus | 'all'>(
    'pending'
  );

  // Tab 2: Kelola & Bulk Create Garasi
  const [garages, setGarages] = useState<Garage[]>([]);
  const [newGarageType, setNewGarageType] = useState<GarageType>('sepeda');
  const [bulkQuantity, setBulkQuantity] = useState<number>(5);
  const [dailyPrice, setDailyPrice] = useState<number>(20000);
  const [kwhPrice, setKwhPrice] = useState<number>(2500);

  // Tab 3: Perpanjang Status Garasi (Extend)
  const [activeRentals, setActiveRentals] = useState<RentalWithDetails[]>([]);
  const [selectedRentalId, setSelectedRentalId] = useState<string>('');
  const [newEndDate, setNewEndDate] = useState<string>('');
  const [extProofFile, setExtProofFile] = useState<File | null>(null);

  // Tab 4: Laporan Sewa Garasi (4 Filter)
  const [allRentals, setAllRentals] = useState<RentalWithDetails[]>([]);
  const [filterYear, setFilterYear] = useState<string>('');
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [filterDay, setFilterDay] = useState<string>('');
  const [filterGarageType, setFilterGarageType] = useState<string>('');
  const [filterUserId, setFilterUserId] = useState<string>('');

  const [busy, setBusy] = useState(false);

  const loadAllAdminData = useCallback(async () => {
    try {
      const [tenantList, garageList, activeList, reportList] = await Promise.all([
        authService.getTenants(),
        garageService.getAllGarages(),
        rentalService.getActiveRentals(),
        rentalService.getRentalReport(),
      ]);
      setTenants(tenantList);
      setGarages(garageList);
      setActiveRentals(activeList);
      setAllRentals(reportList);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal memuat data dashboard Admin.'
      );
    }
  }, []);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/login');
        return;
      }
      if (user.role !== 'admin') {
        router.replace('/penyewa');
        return;
      }
      loadAllAdminData();
    }
  }, [loading, user, router, loadAllAdminData]);

  // Preview kode incremental berikutnya untuk Bulk Create
  const codePreview = useMemo(() => {
    const existingOfType = garages.filter((g) => g.type === newGarageType);
    const lastCode =
      existingOfType.length > 0
        ? existingOfType[existingOfType.length - 1].code
        : null;
    try {
      const codes = garageService.generateIncrementalCodes(
        newGarageType,
        bulkQuantity,
        lastCode
      );
      return {
        text:
          codes.length === 1
            ? codes[0]
            : `${codes[0]} s.d. ${codes[codes.length - 1]}`,
        error: null as string | null,
      };
    } catch (err) {
      return {
        text: '-',
        error: err instanceof Error ? err.message : 'Jumlah unit tidak valid',
      };
    }
  }, [garages, newGarageType, bulkQuantity]);

  // Daftar penyewa terfilter untuk Tab 1
  const filteredTenants = useMemo(() => {
    if (tenantStatusFilter === 'all') return tenants;
    return tenants.filter((t) => t.status === tenantStatusFilter);
  }, [tenants, tenantStatusFilter]);

  // Detail sewa aktif terpilih & preview kalkulasi perpanjangan
  const selectedActiveRental = useMemo(
    () => activeRentals.find((r) => r.id === selectedRentalId) ?? null,
    [activeRentals, selectedRentalId]
  );

  const extensionPreview = useMemo(() => {
    if (!selectedActiveRental || !newEndDate) {
      return { additionalDays: 0, additionalCost: 0, error: null as string | null };
    }
    try {
      const res = rentalService.calculateExtension(
        selectedActiveRental.end_date,
        newEndDate,
        Number(selectedActiveRental.garage?.daily_price ?? 0)
      );
      return { ...res, error: null as string | null };
    } catch (err) {
      return {
        additionalDays: 0,
        additionalCost: 0,
        error: err instanceof Error ? err.message : 'Tanggal perpanjangan tidak valid',
      };
    }
  }, [selectedActiveRental, newEndDate]);

  // Laporan terfilter dengan 4 filter lengkap
  const filteredReportRentals = useMemo(() => {
    const criteria: ReportFilterInput = {};
    if (filterYear) criteria.year = Number(filterYear);
    if (filterMonth) criteria.month = Number(filterMonth);
    if (filterDay) criteria.day = Number(filterDay);
    if (filterGarageType) criteria.garageType = filterGarageType as GarageType;
    if (filterUserId) criteria.userId = filterUserId;
    return rentalService.filterRentals(allRentals, criteria);
  }, [
    allRentals,
    filterYear,
    filterMonth,
    filterDay,
    filterGarageType,
    filterUserId,
  ]);

  const reportSummary = useMemo(() => {
    let baseRentalRevenue = 0;
    let electricityRevenue = 0;
    let extensionRevenue = 0;
    for (const r of filteredReportRentals) {
      baseRentalRevenue += Number(r.rental_cost || 0);
      electricityRevenue += Number(r.electricity_cost || 0);
      for (const ext of r.extensions ?? []) {
        extensionRevenue += Number(ext.additional_cost || 0);
      }
    }
    return {
      count: filteredReportRentals.length,
      baseRentalRevenue,
      electricityRevenue,
      extensionRevenue,
      grandTotal: baseRentalRevenue + electricityRevenue + extensionRevenue,
    };
  }, [filteredReportRentals]);

  // Actions
  const handleVerifyTenant = async (
    tenantId: string,
    decision: 'approved' | 'rejected'
  ) => {
    setError(null);
    setSuccessMsg(null);
    setBusy(true);
    try {
      const updated = await authService.verifyTenant(tenantId, decision);
      setSuccessMsg(
        `Status penyewa ${updated.full_name} berhasil diperbarui menjadi ${updated.status.toUpperCase()}.`
      );
      await loadAllAdminData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal memperbarui status penyewa.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleBulkCreateGarages = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setBusy(true);
    try {
      const created = await garageService.bulkCreateGarages({
        type: newGarageType,
        quantity: bulkQuantity,
        dailyPrice,
        kwhPrice: newGarageType === 'mobil_listrik' ? kwhPrice : 0,
      });
      setSuccessMsg(
        `Berhasil membuat ${created.length} unit garasi baru (${created[0]?.code} - ${
          created[created.length - 1]?.code
        }).`
      );
      await loadAllAdminData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal membuat garasi secara massal.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleExtendRental = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedActiveRental) return;
    setError(null);
    setSuccessMsg(null);

    if (!extProofFile) {
      setError('Admin wajib mengunggah bukti bayar perpanjangan.');
      return;
    }

    setBusy(true);
    try {
      rentalService.calculateExtension(
        selectedActiveRental.end_date,
        newEndDate,
        Number(selectedActiveRental.garage?.daily_price ?? 0)
      );

      const proofUrl = await storageService.uploadPaymentProof(
        extProofFile,
        'extensions'
      );

      const ext = await rentalService.extendRental({
        rentalId: selectedActiveRental.id,
        newEndDate,
        paymentProofUrl: proofUrl,
        adminId: user.id,
      });

      setSuccessMsg(
        `Perpanjangan garasi ${selectedActiveRental.garage?.code} berhasil (+${
          ext.additional_days
        } hari, biaya tambahan ${formatRupiah(Number(ext.additional_cost))}).`
      );
      setNewEndDate('');
      setExtProofFile(null);
      await loadAllAdminData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal memperpanjang masa sewa.'
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user) {
    return <div className="py-10 text-center text-sm text-slate-500">Memuat dashboard Admin...</div>;
  }

  const pendingCount = tenants.filter((t) => t.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard Admin</h1>
          <p className="text-sm text-slate-600">
            Kelola verifikasi penyewa, unit garasi, perpanjangan sewa, dan laporan
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('verify')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'verify'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <UserCheck className="h-4 w-4" />
            Verifikasi Pendaftar
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-slate-900">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('garages')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'garages'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <PlusSquare className="h-4 w-4" />
            Buat Garasi (Bulk)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('extend')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'extend'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <CalendarPlus className="h-4 w-4" />
            Perpanjang Sewa
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'reports'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <FileBarChart2 className="h-4 w-4" />
            Laporan Sewa
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* TAB 1: VERIFIKASI PENDAFTAR BARU */}
      {activeTab === 'verify' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Verifikasi Pendaftar Baru
              </h2>
              <p className="text-xs text-slate-500">
                Terima atau tolak calon penyewa sebelum mereka dapat menyewa garasi
              </p>
            </div>
            <select
              value={tenantStatusFilter}
              onChange={(e) =>
                setTenantStatusFilter(e.target.value as UserStatus | 'all')
              }
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="pending">Pending ({pendingCount})</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="all">Semua Penyewa</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <th className="px-4 py-3">NIK</th>
                  <th className="px-4 py-3">Nama Lengkap</th>
                  <th className="px-4 py-3">Telepon</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTenants.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Tidak ada data penyewa untuk filter status ini.
                    </td>
                  </tr>
                ) : (
                  filteredTenants.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-mono text-xs">{t.nik ?? '-'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {t.full_name}
                      </td>
                      <td className="px-4 py-3">{t.phone ?? '-'}</td>
                      <td className="px-4 py-3">{t.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            t.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-700'
                              : t.status === 'rejected'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {USER_STATUS_LABELS[t.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-2">
                          {t.status !== 'approved' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleVerifyTenant(t.id, 'approved')}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Terima
                            </button>
                          )}
                          {t.status !== 'rejected' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleVerifyTenant(t.id, 'rejected')}
                              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Tolak
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: BUAT GARASI BARU (BULK CREATE) */}
      {activeTab === 'garages' && (
        <div className="grid gap-6 lg:grid-cols-12">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-5">
            <h2 className="text-lg font-bold text-slate-900">
              Buat Garasi Baru (Bulk Create)
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              Kode otomatis incremental (S001, C001, E001), maks 999 unit per tipe.
            </p>

            <form onSubmit={handleBulkCreateGarages} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Tipe Garasi
                </label>
                <select
                  value={newGarageType}
                  onChange={(e) => setNewGarageType(e.target.value as GarageType)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="sepeda">Sepeda (Prefix S)</option>
                  <option value="mobil">Mobil (Prefix C)</option>
                  <option value="mobil_listrik">Mobil Listrik (Prefix E)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Jumlah Garasi (1 – 999)
                </label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  required
                  value={bulkQuantity}
                  onChange={(e) => setBulkQuantity(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-slate-600">
                  Preview Kode Baru:{' '}
                  <strong className="text-blue-700">{codePreview.text}</strong>
                </p>
                {codePreview.error && (
                  <p className="mt-1 text-xs font-medium text-rose-600">
                    {codePreview.error}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Harga Sewa Harian (Rp)
                </label>
                <input
                  type="number"
                  min={1000}
                  step={500}
                  required
                  value={dailyPrice}
                  onChange={(e) => setDailyPrice(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              {newGarageType === 'mobil_listrik' && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Harga Isi Listrik per kWh (Rp)
                  </label>
                  <input
                    type="number"
                    min={100}
                    step={100}
                    required
                    value={kwhPrice}
                    onChange={(e) => setKwhPrice(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={busy || Boolean(codePreview.error)}
                className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? 'Menyimpan...' : 'Buat Unit Garasi'}
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-7">
            <h2 className="mb-4 text-lg font-bold text-slate-900">
              Inventaris Garasi ({garages.length} Unit)
            </h2>
            <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="px-3 py-2.5">Kode</th>
                    <th className="px-3 py-2.5">Tipe</th>
                    <th className="px-3 py-2.5">Tarif/Hari</th>
                    <th className="px-3 py-2.5">Tarif/kWh</th>
                    <th className="px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {garages.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                        Belum ada unit garasi. Silakan buat melalui form di samping.
                      </td>
                    </tr>
                  ) : (
                    garages.map((g) => (
                      <tr key={g.id} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2.5 font-mono font-bold text-slate-900">
                          {g.code}
                        </td>
                        <td className="px-3 py-2.5">{GARAGE_TYPE_LABELS[g.type]}</td>
                        <td className="px-3 py-2.5">
                          {formatRupiah(Number(g.daily_price))}
                        </td>
                        <td className="px-3 py-2.5">
                          {g.type === 'mobil_listrik'
                            ? formatRupiah(Number(g.kwh_price))
                            : '-'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
                              g.status === 'available'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {g.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: PERPANJANG STATUS GARASI (EXTEND) */}
      {activeTab === 'extend' && (
        <div className="grid gap-6 lg:grid-cols-12">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-6">
            <h2 className="text-lg font-bold text-slate-900">
              Daftar Garasi Sedang Aktif Disewa
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              Pilih garasi aktif untuk memperpanjang tanggal selesai sewa
            </p>

            {activeRentals.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Tidak ada garasi yang sedang aktif disewa saat ini.
              </div>
            ) : (
              <div className="space-y-3">
                {activeRentals.map((r) => {
                  const selected = r.id === selectedRentalId;
                  return (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => {
                        setSelectedRentalId(r.id);
                        setNewEndDate('');
                      }}
                      className={`w-full rounded-xl border p-4 text-left transition ${
                        selected
                          ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-500/20'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-bold text-blue-700">
                          {r.garage?.code} •{' '}
                          {r.garage ? GARAGE_TYPE_LABELS[r.garage.type] : ''}
                        </span>
                        <span className="text-xs font-medium text-slate-600">
                          {formatRupiah(Number(r.garage?.daily_price ?? 0))}/hari
                        </span>
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        Penyewa: {r.user?.full_name ?? '-'}
                      </div>
                      <div className="text-xs text-slate-600">
                        Kendaraan: {VEHICLE_TYPE_LABELS[r.vehicle_type]} —{' '}
                        {r.vehicle_brand} ({r.license_plate ?? 'Tanpa Plat'})
                      </div>
                      <div className="mt-2 text-xs font-medium text-slate-800">
                        Periode: {formatDateID(r.start_date)} s.d.{' '}
                        <span className="text-blue-700">
                          {formatDateID(r.end_date)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-6">
            <h2 className="text-lg font-bold text-slate-900">
              Form Perpanjangan Sewa Garasi
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              Admin bebas menentukan tanggal selesai baru beserta bukti bayar
            </p>

            {!selectedActiveRental ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                Silakan pilih salah satu garasi aktif di sebelah kiri terlebih dahulu.
              </div>
            ) : (
              <form onSubmit={handleExtendRental} className="space-y-4">
                <div className="rounded-xl bg-slate-50 p-4 text-sm">
                  <div className="font-bold text-slate-900">
                    Garasi {selectedActiveRental.garage?.code} —{' '}
                    {selectedActiveRental.user?.full_name}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    Tanggal Selesai Saat Ini:{' '}
                    <strong>{formatDateID(selectedActiveRental.end_date)}</strong> (
                    {selectedActiveRental.end_date})
                  </div>
                  <div className="text-xs text-slate-600">
                    Tarif Harian:{' '}
                    <strong>
                      {formatRupiah(
                        Number(selectedActiveRental.garage?.daily_price ?? 0)
                      )}
                    </strong>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Tanggal Selesai Baru
                  </label>
                  <input
                    type="date"
                    required
                    min={selectedActiveRental.end_date}
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Selisih Hari Tambahan</span>
                    <span className="font-semibold">
                      {extensionPreview.additionalDays} hari
                    </span>
                  </div>
                  <div className="mt-1.5 flex justify-between text-base font-bold text-slate-900">
                    <span>Sisa Biaya Tambahan</span>
                    <span className="text-blue-700">
                      {formatRupiah(extensionPreview.additionalCost)}
                    </span>
                  </div>
                  {extensionPreview.error && (
                    <p className="mt-2 text-xs font-medium text-rose-600">
                      {extensionPreview.error}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Upload Bukti Bayar Perpanjangan (Wajib)
                  </label>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600 hover:border-blue-400">
                    <Upload className="h-4 w-4 text-blue-600" />
                    <span>
                      {extProofFile
                        ? extProofFile.name
                        : 'Pilih gambar bukti bayar perpanjangan...'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        setExtProofFile(e.target.files?.[0] ?? null)
                      }
                      className="hidden"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={
                    busy || !newEndDate || Boolean(extensionPreview.error)
                  }
                  className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {busy ? 'Menyimpan Perpanjangan...' : 'Simpan Perpanjangan Sewa'}
                </button>
              </form>
            )}
          </section>
        </div>
      )}

      {/* TAB 4: LAPORAN SEWA GARASI (4 FILTER LENGKAP) */}
      {activeTab === 'reports' && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Laporan Sewa Garasi
              </h2>
              <p className="text-xs text-slate-500">
                Filter berdasarkan Tahun/Bulan, Hari dalam Bulan, Tipe Garasi, dan
                Penyewa
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFilterYear('');
                setFilterMonth('');
                setFilterDay('');
                setFilterGarageType('');
                setFilterUserId('');
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reset Semua Filter
            </button>
          </div>

          {/* 4 Filter Controls */}
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Tahun (Filter 1 &amp; 2)
              </label>
              <input
                type="number"
                placeholder="Semua Tahun (2026)"
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Bulan (Filter 1: Per Bulan)
              </label>
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
              >
                <option value="">Semua Bulan</option>
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Tanggal/Hari (Filter 2: Per Hari)
              </label>
              <input
                type="number"
                min={1}
                max={31}
                placeholder="1 - 31"
                value={filterDay}
                onChange={(e) => setFilterDay(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Tipe Garasi (Filter 3)
              </label>
              <select
                value={filterGarageType}
                onChange={(e) => setFilterGarageType(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
              >
                <option value="">Semua Tipe</option>
                <option value="sepeda">Garasi Sepeda (S)</option>
                <option value="mobil">Garasi Mobil (C)</option>
                <option value="mobil_listrik">Garasi Mobil Listrik (E)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Penyewa (Filter 4)
              </label>
              <select
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
              >
                <option value="">Semua Penyewa</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name} ({t.email})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Summary KPI */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500">Total Transaksi</div>
              <div className="mt-1 text-xl font-bold text-slate-900">
                {reportSummary.count}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500">Pendapatan Sewa Pokok</div>
              <div className="mt-1 text-xl font-bold text-slate-900">
                {formatRupiah(reportSummary.baseRentalRevenue)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500">
                Listrik EV + Perpanjangan
              </div>
              <div className="mt-1 text-xl font-bold text-slate-900">
                {formatRupiah(
                  reportSummary.electricityRevenue + reportSummary.extensionRevenue
                )}
              </div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-medium text-blue-700">
                Grand Total Pendapatan
              </div>
              <div className="mt-1 text-xl font-bold text-blue-800">
                {formatRupiah(reportSummary.grandTotal)}
              </div>
            </div>
          </div>

          {/* Tabel Laporan */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <th className="px-3 py-3">Tgl Mulai / Selesai</th>
                  <th className="px-3 py-3">Garasi</th>
                  <th className="px-3 py-3">Penyewa</th>
                  <th className="px-3 py-3">Kendaraan</th>
                  <th className="px-3 py-3">Sewa + Listrik</th>
                  <th className="px-3 py-3">Perpanjangan</th>
                  <th className="px-3 py-3">Bukti</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReportRentals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      Tidak ada transaksi sewa yang cocok dengan filter laporan.
                    </td>
                  </tr>
                ) : (
                  filteredReportRentals.map((r) => {
                    const extTotal = (r.extensions ?? []).reduce(
                      (s, ex) => s + Number(ex.additional_cost || 0),
                      0
                    );
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/60">
                        <td className="px-3 py-3 text-xs">
                          <div className="font-semibold text-slate-900">
                            {formatDateID(r.start_date)}
                          </div>
                          <div className="text-slate-500">
                            s.d. {formatDateID(r.end_date)} ({r.rental_type})
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded bg-blue-100 px-2 py-0.5 font-mono text-xs font-bold text-blue-800">
                            {r.garage?.code ?? '-'}
                          </span>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {r.garage ? GARAGE_TYPE_LABELS[r.garage.type] : '-'}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <div className="font-semibold text-slate-900">
                            {r.user?.full_name ?? '-'}
                          </div>
                          <div className="text-slate-500">{r.user?.email}</div>
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <div className="font-medium text-slate-900">
                            {VEHICLE_TYPE_LABELS[r.vehicle_type]} •{' '}
                            {r.vehicle_brand}
                          </div>
                          <div className="text-slate-500">
                            Plat: {r.license_plate ?? '-'}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <div className="font-bold text-slate-900">
                            {formatRupiah(Number(r.total_cost))}
                          </div>
                          <div className="text-slate-500">
                            Sewa {formatRupiah(Number(r.rental_cost))} • Listrik{' '}
                            {formatRupiah(Number(r.electricity_cost))}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {r.extensions && r.extensions.length > 0 ? (
                            <div>
                              <span className="font-semibold text-blue-700">
                                {formatRupiah(extTotal)}
                              </span>
                              <div className="text-slate-500">
                                ({r.extensions.length}x extend)
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <a
                            href={r.payment_proof_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
                          >
                            Bukti
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
