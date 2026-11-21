'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BatteryCharging,
  Calendar,
  Clock,
  ExternalLink,
  RefreshCw,
  Upload,
  Warehouse,
} from 'lucide-react';
import { AlertBanner } from '@/components/AlertBanner';
import { useAuth } from '@/context/AuthContext';
import { translateError, validateImageFile } from '@/lib/errors';
import {
  GARAGE_TYPE_LABELS,
  RENTAL_TYPE_LABELS,
  VEHICLE_TYPE_LABELS,
  formatDateID,
  formatRupiah,
} from '@/lib/format';
import { AuthService } from '@/services/AuthService';
import { GarageService } from '@/services/GarageService';
import { RentalService } from '@/services/RentalService';
import { StorageService } from '@/services/StorageService';
import {
  Garage,
  RentalType,
  RentalWithDetails,
  VehicleType,
} from '@/types';

const authService = new AuthService();
const garageService = new GarageService();
const rentalService = new RentalService();
const storageService = new StorageService();

interface RentalFormErrors {
  vehicleBrand?: string;
  licensePlate?: string;
  maxBatteryKwh?: string;
  currentBatteryKwh?: string;
  selectedGarageId?: string;
  durationDays?: string;
  proofFile?: string;
}

export default function PenyewaDashboardPage() {
  const router = useRouter();
  const { user, loading, refreshUser } = useAuth();

  const [availableGarages, setAvailableGarages] = useState<Garage[]>([]);
  const [myRentals, setMyRentals] = useState<RentalWithDetails[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [vehicleType, setVehicleType] = useState<VehicleType>('mobil');
  const [licensePlate, setLicensePlate] = useState('');
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [maxBatteryKwh, setMaxBatteryKwh] = useState<string>('60');
  const [currentBatteryKwh, setCurrentBatteryKwh] = useState<string>('20');
  const [selectedGarageId, setSelectedGarageId] = useState<string>('');
  const [rentalType, setRentalType] = useState<RentalType>('harian');
  const [durationDays, setDurationDays] = useState<number>(1);
  const [proofFile, setProofFile] = useState<File | null>(null);

  const [fieldErrors, setFieldErrors] = useState<RentalFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const todayISO = useMemo(() => rentalService.getTodayDateISO(), []);

  const loadGaragesForVehicle = useCallback(async (vType: VehicleType) => {
    try {
      const list = await garageService.getAvailableGaragesForVehicle(vType);
      setAvailableGarages(list);
      setSelectedGarageId((prev) =>
        list.some((g) => g.id === prev) ? prev : list[0]?.id ?? ''
      );
      setFieldErrors((prev) => ({ ...prev, selectedGarageId: undefined }));
    } catch (err) {
      setError(translateError(err, 'Gagal memuat daftar garasi tersedia.'));
    }
  }, []);

  const loadMyRentals = useCallback(async (userId: string) => {
    setLoadingData(true);
    try {
      const list = await rentalService.getUserRentals(userId);
      setMyRentals(list);
    } catch (err) {
      setError(translateError(err, 'Gagal memuat riwayat sewa Anda.'));
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/login');
        return;
      }
      if (user.role !== 'penyewa') {
        router.replace('/admin');
        return;
      }
      loadGaragesForVehicle(vehicleType);
      loadMyRentals(user.id);
    }
  }, [loading, user, router, vehicleType, loadGaragesForVehicle, loadMyRentals]);

  const selectedGarage = useMemo(
    () => availableGarages.find((g) => g.id === selectedGarageId) ?? null,
    [availableGarages, selectedGarageId]
  );

  const previewCalculation = useMemo(() => {
    if (!selectedGarage) {
      return {
        endDate: '-',
        rentalCost: 0,
        electricityCost: 0,
        totalCost: 0,
        error: null as string | null,
      };
    }

    try {
      const daysParam =
        rentalType === 'bulanan' ? RentalService.MONTHLY_DURATION_DAYS : durationDays;
      const endDate = rentalService.calculateEndDate(todayISO, rentalType, daysParam);

      const maxKwh = vehicleType === 'mobil_listrik' ? Number(maxBatteryKwh) : 0;
      const curKwh = vehicleType === 'mobil_listrik' ? Number(currentBatteryKwh) : 0;

      const breakdown = rentalService.calculateTotalCost({
        rentalType,
        dailyPrice: Number(selectedGarage.daily_price),
        durationDays: daysParam,
        vehicleType,
        garageType: selectedGarage.type,
        maxBatteryKwh: maxKwh,
        currentBatteryKwh: curKwh,
        kwhPrice: Number(selectedGarage.kwh_price),
      });

      return { endDate, ...breakdown, error: null as string | null };
    } catch (err) {
      return {
        endDate: '-',
        rentalCost: 0,
        electricityCost: 0,
        totalCost: 0,
        error: translateError(err, 'Input belum valid.'),
      };
    }
  }, [
    selectedGarage,
    rentalType,
    durationDays,
    todayISO,
    vehicleType,
    maxBatteryKwh,
    currentBatteryKwh,
  ]);

  const isApproved = user ? authService.canTenantRent(user) : false;

  const validateRentalForm = (): RentalFormErrors => {
    const errs: RentalFormErrors = {};

    if (!vehicleBrand.trim()) {
      errs.vehicleBrand = 'Merek dan tipe kendaraan wajib diisi.';
    }

    if (vehicleType !== 'sepeda' && !licensePlate.trim()) {
      errs.licensePlate = 'Nomor plat kendaraan wajib diisi untuk selain sepeda.';
    }

    if (vehicleType === 'mobil_listrik') {
      const maxKwh = Number(maxBatteryKwh);
      const curKwh = Number(currentBatteryKwh);
      if (!maxBatteryKwh.trim() || !Number.isFinite(maxKwh) || maxKwh <= 0) {
        errs.maxBatteryKwh = 'Kapasitas Max Charge wajib diisi lebih dari 0 kWh.';
      }
      if (!currentBatteryKwh.trim() || !Number.isFinite(curKwh) || curKwh < 0) {
        errs.currentBatteryKwh = 'Current Battery wajib diisi dan tidak boleh negatif.';
      } else if (Number.isFinite(maxKwh) && maxKwh > 0 && curKwh > maxKwh) {
        errs.currentBatteryKwh =
          'Current Battery tidak boleh melebihi Kapasitas Max Charge.';
      }
    }

    if (!selectedGarage) {
      errs.selectedGarageId = 'Silakan pilih unit garasi yang tersedia.';
    }

    if (rentalType === 'harian') {
      if (
        !Number.isInteger(durationDays) ||
        durationDays < 1 ||
        durationDays > RentalService.MAX_DAILY_RENTAL_DAYS
      ) {
        errs.durationDays = `Sewa harian harus antara 1 hingga ${RentalService.MAX_DAILY_RENTAL_DAYS} hari.`;
      }
    }

    const fileErr = validateImageFile(proofFile);
    if (fileErr) {
      errs.proofFile = fileErr;
    }

    return errs;
  };

  const handleProofFileChange = (file: File | null) => {
    setProofFile(file);
    if (!file) {
      setFieldErrors((prev) => ({ ...prev, proofFile: undefined }));
      return;
    }
    const fileErr = validateImageFile(file);
    setFieldErrors((prev) => ({
      ...prev,
      proofFile: fileErr ?? undefined,
    }));
  };

  const handleSubmitRental = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSuccessMsg(null);

    if (!isApproved) {
      setError('Akun Anda belum diverifikasi (approved) oleh Admin.');
      return;
    }

    const errs = validateRentalForm();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0 || !selectedGarage || !proofFile) {
      return;
    }

    setSubmitting(true);
    try {
      const maxKwh = vehicleType === 'mobil_listrik' ? Number(maxBatteryKwh) : null;
      const curKwh =
        vehicleType === 'mobil_listrik' ? Number(currentBatteryKwh) : null;

      // Validasi sebelum upload agar storage tidak terisi file jika input ditolak
      rentalService.validateVehicleInput({
        vehicleType,
        licensePlate: vehicleType === 'sepeda' ? null : licensePlate,
        vehicleBrand,
        maxBatteryKwh: maxKwh,
        currentBatteryKwh: curKwh,
      });
      rentalService.validateDuration(
        rentalType,
        rentalType === 'bulanan' ? 30 : durationDays
      );

      const proofUrl = await storageService.uploadPaymentProof(
        proofFile,
        'rentals'
      );

      const created = await rentalService.createRental({
        userId: user.id,
        garageId: selectedGarage.id,
        vehicleType,
        licensePlate: vehicleType === 'sepeda' ? null : licensePlate,
        vehicleBrand,
        maxBatteryKwh: maxKwh,
        currentBatteryKwh: curKwh,
        rentalType,
        durationDays:
          rentalType === 'bulanan'
            ? RentalService.MONTHLY_DURATION_DAYS
            : durationDays,
        startDate: todayISO,
        paymentProofUrl: proofUrl,
      });

      setSuccessMsg(
        `Sewa garasi ${selectedGarage.code} berhasil dibuat (Berakhir: ${formatDateID(
          created.end_date
        )})! Status garasi kini otomatis menjadi USED.`
      );

      setLicensePlate('');
      setVehicleBrand('');
      setProofFile(null);
      setFieldErrors({});

      await Promise.all([
        loadGaragesForVehicle(vehicleType),
        loadMyRentals(user.id),
      ]);
    } catch (err) {
      setError(translateError(err, 'Gagal membuat transaksi sewa garasi.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="py-10 text-center text-sm text-slate-500">
        Memuat dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Dashboard Penyewa
          </h1>
          <p className="text-sm text-slate-600">
            Halo, <strong>{user.full_name}</strong> (NIK: {user.nik ?? '-'})
          </p>
        </div>

        <button
          type="button"
          disabled={refreshing || submitting}
          onClick={async () => {
            setRefreshing(true);
            setError(null);
            try {
              await refreshUser();
              await Promise.all([
                loadGaragesForVehicle(vehicleType),
                loadMyRentals(user.id),
              ]);
            } catch (err) {
              setError(translateError(err, 'Gagal menyegarkan data.'));
            } finally {
              setRefreshing(false);
            }
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Menyegarkan...' : 'Segarkan Status & Data'}
        </button>
      </div>

      {!isApproved && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <h2 className="text-sm font-bold">
              Akun Menunggu Verifikasi Admin (Status: {user.status.toUpperCase()})
            </h2>
            <p className="mt-1 text-sm">
              Anda belum dapat melakukan penyewaan garasi sebelum akun Anda
              diterima (approved) oleh Admin melalui menu Verifikasi Pendaftar
              Baru.
            </p>
          </div>
        </div>
      )}

      {error && (
        <AlertBanner
          variant="error"
          message={error}
          onClose={() => setError(null)}
        />
      )}

      {successMsg && (
        <AlertBanner
          variant="success"
          message={successMsg}
          onClose={() => setSuccessMsg(null)}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-7">
          <div className="mb-5 flex items-center gap-2.5 border-b border-slate-100 pb-4">
            <Warehouse className="h-5 w-5 text-blue-600" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Sewa Baru Garasi
              </h2>
              <p className="text-xs text-slate-500">
                Satu penyewa dapat menyewa lebih dari satu garasi secara bersamaan
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmitRental} noValidate className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Tipe Kendaraan
                </label>
                <select
                  value={vehicleType}
                  onChange={(e) => {
                    setVehicleType(e.target.value as VehicleType);
                    setFieldErrors((prev) => ({
                      ...prev,
                      licensePlate: undefined,
                      maxBatteryKwh: undefined,
                      currentBatteryKwh: undefined,
                    }));
                  }}
                  disabled={!isApproved || submitting}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-100"
                >
                  {(Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[]).map((vt) => (
                    <option key={vt} value={vt}>
                      {VEHICLE_TYPE_LABELS[vt]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Merek &amp; Tipe Kendaraan
                </label>
                <input
                  type="text"
                  required
                  disabled={!isApproved || submitting}
                  value={vehicleBrand}
                  onChange={(e) => {
                    setVehicleBrand(e.target.value);
                    if (fieldErrors.vehicleBrand && e.target.value.trim()) {
                      setFieldErrors((prev) => ({
                        ...prev,
                        vehicleBrand: undefined,
                      }));
                    }
                  }}
                  placeholder="Contoh: Hyundai Ioniq 5 / Honda Beat"
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none disabled:bg-slate-100 ${
                    fieldErrors.vehicleBrand
                      ? 'border-rose-400 focus:border-rose-500'
                      : 'border-slate-300 focus:border-blue-500'
                  }`}
                />
                {fieldErrors.vehicleBrand && (
                  <p className="mt-1 text-xs font-medium text-rose-600">
                    {fieldErrors.vehicleBrand}
                  </p>
                )}
              </div>
            </div>

            {vehicleType !== 'sepeda' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Nomor Plat Kendaraan
                </label>
                <input
                  type="text"
                  required
                  disabled={!isApproved || submitting}
                  value={licensePlate}
                  onChange={(e) => {
                    setLicensePlate(e.target.value);
                    if (fieldErrors.licensePlate && e.target.value.trim()) {
                      setFieldErrors((prev) => ({
                        ...prev,
                        licensePlate: undefined,
                      }));
                    }
                  }}
                  placeholder="Contoh: B 1234 XYZ"
                  className={`w-full rounded-lg border px-3 py-2 text-sm uppercase focus:outline-none disabled:bg-slate-100 ${
                    fieldErrors.licensePlate
                      ? 'border-rose-400 focus:border-rose-500'
                      : 'border-slate-300 focus:border-blue-500'
                  }`}
                />
                {fieldErrors.licensePlate && (
                  <p className="mt-1 text-xs font-medium text-rose-600">
                    {fieldErrors.licensePlate}
                  </p>
                )}
              </div>
            )}

            {vehicleType === 'mobil_listrik' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900">
                  <BatteryCharging className="h-4 w-4 text-amber-600" />
                  Detail Baterai Mobil Listrik (EV)
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Kapasitas Max Charge (max_battery_kwh)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      required
                      disabled={!isApproved || submitting}
                      value={maxBatteryKwh}
                      onChange={(e) => {
                        setMaxBatteryKwh(e.target.value);
                        setFieldErrors((prev) => ({
                          ...prev,
                          maxBatteryKwh: undefined,
                          currentBatteryKwh: undefined,
                        }));
                      }}
                      className={`w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none ${
                        fieldErrors.maxBatteryKwh
                          ? 'border-rose-400 focus:border-rose-500'
                          : 'border-slate-300 focus:border-blue-500'
                      }`}
                    />
                    {fieldErrors.maxBatteryKwh && (
                      <p className="mt-1 text-xs font-medium text-rose-600">
                        {fieldErrors.maxBatteryKwh}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Current Battery (current_battery_kwh)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      required
                      disabled={!isApproved || submitting}
                      value={currentBatteryKwh}
                      onChange={(e) => {
                        setCurrentBatteryKwh(e.target.value);
                        setFieldErrors((prev) => ({
                          ...prev,
                          currentBatteryKwh: undefined,
                        }));
                      }}
                      className={`w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none ${
                        fieldErrors.currentBatteryKwh
                          ? 'border-rose-400 focus:border-rose-500'
                          : 'border-slate-300 focus:border-blue-500'
                      }`}
                    />
                    {fieldErrors.currentBatteryKwh && (
                      <p className="mt-1 text-xs font-medium text-rose-600">
                        {fieldErrors.currentBatteryKwh}
                      </p>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs text-amber-800">
                  * Wajib <code>current_battery_kwh &lt;= max_battery_kwh</code>. Jika
                  memilih Garasi Mobil Listrik (E), baterai akan diisi penuh.
                </p>
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Pilih Garasi Tersedia Hari Ini (Kompatibel:{' '}
                {garageService
                  .getAllowedGarageTypes(vehicleType)
                  .map((t) => GARAGE_TYPE_LABELS[t])
                  .join(' / ')}
                )
              </label>
              {availableGarages.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                  Tidak ada garasi tersedia untuk tipe kendaraan{' '}
                  <strong>{VEHICLE_TYPE_LABELS[vehicleType]}</strong> saat ini.
                </div>
              ) : (
                <div className="grid max-h-52 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
                  {availableGarages.map((g) => {
                    const active = g.id === selectedGarageId;
                    return (
                      <label
                        key={g.id}
                        className={`flex cursor-pointer items-start justify-between rounded-xl border p-3 text-sm transition ${
                          active
                            ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-500/20'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <input
                            type="radio"
                            name="garage"
                            disabled={!isApproved || submitting}
                            checked={active}
                            onChange={() => {
                              setSelectedGarageId(g.id);
                              setFieldErrors((prev) => ({
                                ...prev,
                                selectedGarageId: undefined,
                              }));
                            }}
                            className="mt-1"
                          />
                          <div>
                            <div className="font-bold text-slate-900">
                              {g.code}{' '}
                              <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                                {g.status}
                              </span>
                            </div>
                            <div className="text-xs text-slate-600">
                              {GARAGE_TYPE_LABELS[g.type]}
                            </div>
                            <div className="mt-1 text-xs font-medium text-slate-800">
                              {formatRupiah(Number(g.daily_price))}/hari
                              {g.type === 'mobil_listrik' && (
                                <span className="block text-amber-700">
                                  + {formatRupiah(Number(g.kwh_price))}/kWh
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              {fieldErrors.selectedGarageId && (
                <p className="mt-1 text-xs font-medium text-rose-600">
                  {fieldErrors.selectedGarageId}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Tanggal Mulai (Hari Ini)
                </label>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
                  <Calendar className="h-4 w-4 text-slate-500" />
                  {formatDateID(todayISO)}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Tipe Sewa
                </label>
                <select
                  value={rentalType}
                  disabled={!isApproved || submitting}
                  onChange={(e) => {
                    setRentalType(e.target.value as RentalType);
                    setFieldErrors((prev) => ({
                      ...prev,
                      durationDays: undefined,
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-100"
                >
                  {(Object.keys(RENTAL_TYPE_LABELS) as RentalType[]).map((rt) => (
                    <option key={rt} value={rt}>
                      {RENTAL_TYPE_LABELS[rt]}
                    </option>
                  ))}
                </select>
              </div>

              {rentalType === 'harian' ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Jumlah Hari (1–29)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={29}
                    required
                    disabled={!isApproved || submitting}
                    value={durationDays}
                    onChange={(e) => {
                      setDurationDays(Number(e.target.value));
                      setFieldErrors((prev) => ({
                        ...prev,
                        durationDays: undefined,
                      }));
                    }}
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none disabled:bg-slate-100 ${
                      fieldErrors.durationDays
                        ? 'border-rose-400 focus:border-rose-500'
                        : 'border-slate-300 focus:border-blue-500'
                    }`}
                  />
                  {fieldErrors.durationDays && (
                    <p className="mt-1 text-xs font-medium text-rose-600">
                      {fieldErrors.durationDays}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Durasi Bulanan
                  </label>
                  <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
                    1 Bulan (25x Tarif Harian)
                  </div>
                </div>
              )}
            </div>

            {rentalType === 'bulanan' && (
              <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
                Aturan Sewa Bulanan: Maksimal 1 bulan per transaksi. Jika ingin
                menyewa lebih dari 1 bulan, silakan buat transaksi sewa baru lagi.
              </p>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
                <span>Tanggal Selesai Otomatis</span>
                <span className="font-semibold text-slate-900">
                  {previewCalculation.endDate !== '-'
                    ? formatDateID(previewCalculation.endDate)
                    : '-'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-700">
                <span>Biaya Sewa Garasi</span>
                <span className="font-medium">
                  {formatRupiah(previewCalculation.rentalCost)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm text-slate-700">
                <span>Biaya Isi Listrik EV</span>
                <span className="font-medium">
                  {formatRupiah(previewCalculation.electricityCost)}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2.5 text-base font-bold text-slate-900">
                <span>Total Biaya Pelunasan</span>
                <span className="text-blue-700">
                  {formatRupiah(previewCalculation.totalCost)}
                </span>
              </div>
              {previewCalculation.error && (
                <p className="mt-2 text-xs font-medium text-rose-600">
                  {previewCalculation.error}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Upload Bukti Pelunasan Biaya (Wajib Gambar, Maks 5 MB)
              </label>
              <label
                className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-4 text-sm text-slate-600 transition ${
                  fieldErrors.proofFile
                    ? 'border-rose-400 bg-rose-50/40'
                    : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/40'
                }`}
              >
                <Upload className="h-4 w-4 text-blue-600" />
                <span>
                  {proofFile ? proofFile.name : 'Pilih file gambar bukti bayar...'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={!isApproved || submitting}
                  onChange={(e) =>
                    handleProofFileChange(e.target.files?.[0] ?? null)
                  }
                  className="hidden"
                />
              </label>
              {fieldErrors.proofFile && (
                <p className="mt-1 text-xs font-medium text-rose-600">
                  {fieldErrors.proofFile}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={
                !isApproved ||
                submitting ||
                !selectedGarage ||
                Boolean(previewCalculation.error)
              }
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Memproses Transaksi...' : 'Bayar & Sewa Garasi Sekarang'}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-5">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Garasi yang Saya Sewa
              </h2>
              <p className="text-xs text-slate-500">
                Total transaksi Anda: {myRentals.length}
              </p>
            </div>
          </div>

          {loadingData ? (
            <p className="text-sm text-slate-500">Memuat riwayat sewa...</p>
          ) : myRentals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              Anda belum memiliki transaksi sewa garasi.
            </div>
          ) : (
            <div className="space-y-3.5">
              {myRentals.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-slate-200 p-4 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="inline-block rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                        {r.garage?.code ?? '-'}
                      </span>
                      <span className="ml-2 text-xs text-slate-500">
                        {r.garage ? GARAGE_TYPE_LABELS[r.garage.type] : ''}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        r.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {r.status === 'active' ? 'Aktif' : 'Selesai'}
                    </span>
                  </div>

                  <div className="mt-2 font-semibold text-slate-900">
                    {VEHICLE_TYPE_LABELS[r.vehicle_type]} • {r.vehicle_brand}
                    {r.license_plate && (
                      <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
                        {r.license_plate}
                      </span>
                    )}
                  </div>

                  {r.vehicle_type === 'mobil_listrik' && (
                    <div className="mt-1 text-xs text-amber-700">
                      Baterai awal: {r.current_battery_kwh} / {r.max_battery_kwh}{' '}
                      kWh
                    </div>
                  )}

                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
                    <div>
                      <span className="block text-[11px] text-slate-400">
                        Mulai Sewa
                      </span>
                      <span className="font-medium text-slate-800">
                        {formatDateID(r.start_date)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-400">
                        Selesai Sewa
                      </span>
                      <span className="font-medium text-slate-800">
                        {formatDateID(r.end_date)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-slate-600">
                      Sewa: {formatRupiah(Number(r.rental_cost))} • Listrik:{' '}
                      {formatRupiah(Number(r.electricity_cost))}
                    </span>
                    <span className="font-bold text-slate-900">
                      {formatRupiah(Number(r.total_cost))}
                    </span>
                  </div>

                  {r.extensions && r.extensions.length > 0 && (
                    <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/60 p-2 text-xs text-blue-800">
                      Diperpanjang {r.extensions.length}x oleh Admin (total +
                      {r.extensions.reduce((acc, ex) => acc + ex.additional_days, 0)}{' '}
                      hari).
                    </div>
                  )}

                  <div className="mt-2.5 flex justify-end">
                    <a
                      href={r.payment_proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                    >
                      Lihat Bukti Bayar
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
