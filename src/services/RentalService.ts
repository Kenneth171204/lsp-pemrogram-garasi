/**
 * @fileoverview Service Class untuk seluruh logika bisnis transaksi sewa, perhitungan biaya,
 * tanggal selesai, perpanjangan sewa (extend), serta filter laporan persewaan.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from '@/lib/supabase';
import { AuthService } from '@/services/AuthService';
import { GarageService } from '@/services/GarageService';
import {
  CostBreakdown,
  CreateRentalInput,
  ExtendRentalInput,
  Garage,
  GarageType,
  Rental,
  RentalExtension,
  RentalType,
  RentalWithDetails,
  ReportFilterInput,
  User,
  VehicleType,
} from '@/types';

/**
 * Mengelola seluruh logika bisnis persewaan garasi kendaraan:
 * validasi kendaraan & durasi, kalkulasi biaya sewa dan listrik EV,
 * kalkulasi tanggal selesai otomatis, pembuatan transaksi sewa baru,
 * perpanjangan sewa oleh Admin, dan filtering laporan persewaan.
 */
export class RentalService {
  public static readonly MAX_DAILY_RENTAL_DAYS = 29;
  public static readonly MONTHLY_PRICE_MULTIPLIER = 25;
  public static readonly MONTHLY_DURATION_DAYS = 30;

  private readonly db: SupabaseClient;
  private readonly authService: AuthService;
  private readonly garageService: GarageService;

  /**
   * Membuat instance baru dari RentalService.
   * @param db - Client Supabase opsional untuk dependency injection.
   * @param authService - Instance AuthService opsional.
   * @param garageService - Instance GarageService opsional.
   */
  constructor(
    db: SupabaseClient = defaultSupabase,
    authService?: AuthService,
    garageService?: GarageService
  ) {
    this.db = db;
    this.authService = authService ?? new AuthService(this.db);
    this.garageService = garageService ?? new GarageService(this.db);
  }

  /**
   * Mengembalikan tanggal hari ini dalam format `YYYY-MM-DD` sesuai kalender lokal.
   * @returns String tanggal hari ini (`YYYY-MM-DD`).
   */
  public getTodayDateISO(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Mem-parsing string tanggal `YYYY-MM-DD` atau objek `Date` menjadi komponen UTC yang aman dari pergeseran zona waktu.
   * @param dateInput - Tanggal dalam format `YYYY-MM-DD` atau `Date`.
   * @returns Objek `{ year, month, day }` (month 1-12).
   */
  private parseDateParts(dateInput: string | Date): {
    year: number;
    month: number;
    day: number;
  } {
    if (dateInput instanceof Date) {
      if (Number.isNaN(dateInput.getTime())) {
        throw new Error('Objek tanggal tidak valid.');
      }
      return {
        year: dateInput.getUTCFullYear(),
        month: dateInput.getUTCMonth() + 1,
        day: dateInput.getUTCDate(),
      };
    }

    const clean = dateInput.trim().slice(0, 10);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
    if (!match) {
      throw new Error(`Format tanggal harus YYYY-MM-DD, diterima: ${dateInput}`);
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const probe = new Date(Date.UTC(year, month - 1, day));
    if (
      probe.getUTCFullYear() !== year ||
      probe.getUTCMonth() + 1 !== month ||
      probe.getUTCDate() !== day
    ) {
      throw new Error(`Tanggal kalender tidak valid: ${dateInput}`);
    }

    return { year, month, day };
  }

  /**
   * Memformat objek Date UTC menjadi string `YYYY-MM-DD`.
   */
  private formatUTCDate(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Memvalidasi detail kendaraan sebelum transaksi sewa dibuat.
   * - `sepeda`: nomor plat opsional.
   * - Selain `sepeda`: nomor plat wajib diisi.
   * - `mobil_listrik`: wajib mengisi `maxBatteryKwh > 0` dan `0 <= currentBatteryKwh <= maxBatteryKwh`.
   * @param input - Data detail kendaraan.
   * @throws {Error} Jika terdapat data kendaraan yang tidak sesuai aturan bisnis.
   */
  public validateVehicleInput(input: {
    vehicleType: VehicleType;
    licensePlate?: string | null;
    vehicleBrand: string;
    maxBatteryKwh?: number | null;
    currentBatteryKwh?: number | null;
  }): void {
    if (!input.vehicleBrand || !input.vehicleBrand.trim()) {
      throw new Error('Merek dan tipe kendaraan wajib diisi.');
    }

    if (
      input.vehicleType !== 'sepeda' &&
      (!input.licensePlate || !input.licensePlate.trim())
    ) {
      throw new Error('Nomor plat wajib diisi untuk selain sepeda.');
    }

    if (input.vehicleType === 'mobil_listrik') {
      const maxKwh = input.maxBatteryKwh;
      const currentKwh = input.currentBatteryKwh;

      if (
        maxKwh === null ||
        maxKwh === undefined ||
        !Number.isFinite(maxKwh) ||
        maxKwh <= 0
      ) {
        throw new Error(
          'Kapasitas Max Charge (max_battery_kwh) wajib diisi dan lebih dari 0.'
        );
      }

      if (
        currentKwh === null ||
        currentKwh === undefined ||
        !Number.isFinite(currentKwh) ||
        currentKwh < 0
      ) {
        throw new Error(
          'Kapasitas baterai saat ini (current_battery_kwh) wajib diisi dan tidak boleh negatif.'
        );
      }

      if (currentKwh > maxKwh) {
        throw new Error(
          'Current Battery (current_battery_kwh) tidak boleh melebihi Kapasitas Max Charge (max_battery_kwh).'
        );
      }
    }
  }

  /**
   * Memvalidasi batas durasi sewa berdasarkan tipe sewa:
   * - `harian`: 1 sampai 29 hari (maksimal kurang dari 30 hari).
   * - `bulanan`: maksimal 1 bulan per transaksi (nilai 1 bulan atau 30 hari).
   * @param rentalType - Tipe sewa (`harian` atau `bulanan`).
   * @param durationValue - Jumlah hari (untuk `harian`), atau `1` (bulan) / `30` (hari) untuk `bulanan`.
   * @throws {Error} Jika durasi di luar batas yang diperbolehkan.
   */
  public validateDuration(rentalType: RentalType, durationValue: number): void {
    if (rentalType === 'harian') {
      if (
        !Number.isInteger(durationValue) ||
        durationValue < 1 ||
        durationValue > RentalService.MAX_DAILY_RENTAL_DAYS
      ) {
        throw new Error(
          `Sewa harian hanya diperbolehkan antara 1 hingga ${RentalService.MAX_DAILY_RENTAL_DAYS} hari (kurang dari 30 hari).`
        );
      }
      return;
    }

    if (rentalType === 'bulanan') {
      if (durationValue !== 1 && durationValue !== RentalService.MONTHLY_DURATION_DAYS) {
        throw new Error(
          'Sewa bulanan maksimal 1 bulan (30 hari) per transaksi. Jika ingin menyewa lebih dari 1 bulan, silakan buat transaksi sewa baru lagi.'
        );
      }
      return;
    }

    throw new Error(`Tipe sewa tidak dikenal: ${rentalType}`);
  }

  /**
   * Menghitung biaya sewa garasi (di luar biaya listrik).
   * - `harian`: `jumlah_hari * daily_price` (1-29 hari).
   * - `bulanan`: `25 * daily_price` (maksimal 1 bulan).
   * @param rentalType - Tipe sewa (`harian` atau `bulanan`).
   * @param dailyPrice - Harga sewa harian unit garasi.
   * @param durationDays - Jumlah hari sewa (wajib untuk `harian`, opsional default 30 untuk `bulanan`).
   * @returns Total biaya sewa garasi.
   */
  public calculateRentalCost(
    rentalType: RentalType,
    dailyPrice: number,
    durationDays?: number
  ): number {
    if (!Number.isFinite(dailyPrice) || dailyPrice < 0) {
      throw new Error('Harga sewa harian tidak valid.');
    }

    if (rentalType === 'harian') {
      const days = durationDays ?? 0;
      this.validateDuration('harian', days);
      return days * dailyPrice;
    }

    const monthlyCheckValue = durationDays ?? RentalService.MONTHLY_DURATION_DAYS;
    this.validateDuration('bulanan', monthlyCheckValue);
    return RentalService.MONTHLY_PRICE_MULTIPLIER * dailyPrice;
  }

  /**
   * Menghitung biaya pengisian listrik untuk kendaraan listrik (EV).
   * - Jika `mobil_listrik` masuk ke Garasi Mobil Listrik (`E`), wajib isi penuh:
   *   `(max_battery_kwh - current_battery_kwh) * kwh_price`.
   * - Jika `mobil_listrik` masuk ke Garasi Mobil (`C`), biaya listrik = `0`.
   * - Kendaraan non-EV selalu memiliki biaya listrik = `0`.
   * @param params - Parameter kendaraan, garasi, dan kapasitas baterai.
   * @returns Biaya isi listrik dalam Rupiah.
   */
  public calculateElectricityCost(params: {
    vehicleType: VehicleType;
    garageType: GarageType;
    maxBatteryKwh?: number | null;
    currentBatteryKwh?: number | null;
    kwhPrice?: number;
  }): number {
    if (
      params.vehicleType === 'mobil_listrik' &&
      params.garageType === 'mobil_listrik'
    ) {
      const maxKwh = params.maxBatteryKwh ?? 0;
      const currentKwh = params.currentBatteryKwh ?? 0;
      const kwhPrice = params.kwhPrice ?? 0;

      if (maxKwh <= 0) {
        throw new Error('Kapasitas Max Charge harus lebih dari 0.');
      }
      if (currentKwh < 0 || currentKwh > maxKwh) {
        throw new Error('Current Battery tidak boleh melebihi Max Charge.');
      }
      if (kwhPrice < 0) {
        throw new Error('Harga per kWh tidak valid.');
      }

      return (maxKwh - currentKwh) * kwhPrice;
    }

    return 0;
  }

  /**
   * Menghitung rincian lengkap biaya sewa, biaya isi listrik, dan total biaya.
   * @param params - Seluruh parameter perhitungan transaksi sewa.
   * @returns Objek `{ rentalCost, electricityCost, totalCost }`.
   */
  public calculateTotalCost(params: {
    rentalType: RentalType;
    dailyPrice: number;
    durationDays?: number;
    vehicleType: VehicleType;
    garageType: GarageType;
    maxBatteryKwh?: number | null;
    currentBatteryKwh?: number | null;
    kwhPrice?: number;
  }): CostBreakdown {
    const rentalCost = this.calculateRentalCost(
      params.rentalType,
      params.dailyPrice,
      params.durationDays
    );
    const electricityCost = this.calculateElectricityCost({
      vehicleType: params.vehicleType,
      garageType: params.garageType,
      maxBatteryKwh: params.maxBatteryKwh,
      currentBatteryKwh: params.currentBatteryKwh,
      kwhPrice: params.kwhPrice,
    });

    return {
      rentalCost,
      electricityCost,
      totalCost: rentalCost + electricityCost,
    };
  }

  /**
   * Menghitung tanggal selesai sewa secara otomatis dari tanggal mulai:
   * - `harian`: tanggal mulai + `durationDays` hari (1 - 29 hari).
   * - `bulanan`: mengikuti tanggal yang sama di bulan berikutnya (misal `2026-11-21` -> `2026-12-21`).
   *   Apabila tanggal mulai tidak ada di bulan berikutnya (misal 31 Jan), disesuaikan ke akhir bulan (28/29 Feb).
   * @param startDate - Tanggal mulai sewa (`YYYY-MM-DD` atau `Date`).
   * @param rentalType - Tipe sewa (`harian` atau `bulanan`).
   * @param durationDays - Jumlah hari (untuk sewa `harian`).
   * @returns Tanggal selesai dalam format `YYYY-MM-DD`.
   */
  public calculateEndDate(
    startDate: string | Date,
    rentalType: RentalType,
    durationDays?: number
  ): string {
    const { year, month, day } = this.parseDateParts(startDate);

    if (rentalType === 'harian') {
      const days = durationDays ?? 0;
      this.validateDuration('harian', days);
      const endUtc = new Date(Date.UTC(year, month - 1, day + days));
      return this.formatUTCDate(endUtc);
    }

    const monthlyCheckValue = durationDays ?? RentalService.MONTHLY_DURATION_DAYS;
    this.validateDuration('bulanan', monthlyCheckValue);

    const targetMonthIndex = month; // month 1-based -> +1 bulan di JS Date (0-based)
    const targetYear = year + Math.floor(targetMonthIndex / 12);
    const normalizedMonth = targetMonthIndex % 12; // 0-11
    const lastDayOfTargetMonth = new Date(
      Date.UTC(targetYear, normalizedMonth + 1, 0)
    ).getUTCDate();
    const clampedDay = Math.min(day, lastDayOfTargetMonth);

    return this.formatUTCDate(new Date(Date.UTC(targetYear, normalizedMonth, clampedDay)));
  }

  /**
   * Menghitung jumlah hari tambahan dan biaya tambahan perpanjangan sewa berdasarkan
   * selisih tanggal selesai baru terhadap tanggal selesai saat ini.
   * @param currentEndDate - Tanggal selesai sewa saat ini (`YYYY-MM-DD`).
   * @param newEndDate - Tanggal selesai baru yang dipilih Admin (`YYYY-MM-DD`).
   * @param dailyPrice - Harga sewa harian unit garasi.
   * @returns Objek `{ additionalDays, additionalCost }`.
   * @throws {Error} Jika tanggal baru tidak lebih besar dari tanggal selesai saat ini.
   */
  public calculateExtension(
    currentEndDate: string | Date,
    newEndDate: string | Date,
    dailyPrice: number
  ): { additionalDays: number; additionalCost: number } {
    if (!Number.isFinite(dailyPrice) || dailyPrice < 0) {
      throw new Error('Harga sewa harian tidak valid.');
    }

    const currentParts = this.parseDateParts(currentEndDate);
    const newParts = this.parseDateParts(newEndDate);

    const currentUtcMs = Date.UTC(
      currentParts.year,
      currentParts.month - 1,
      currentParts.day
    );
    const newUtcMs = Date.UTC(newParts.year, newParts.month - 1, newParts.day);

    const additionalDays = Math.round((newUtcMs - currentUtcMs) / 86_400_000);
    if (additionalDays <= 0) {
      throw new Error(
        'Tanggal selesai baru harus lebih besar minimal 1 hari dari tanggal selesai saat ini.'
      );
    }

    return {
      additionalDays,
      additionalCost: additionalDays * dailyPrice,
    };
  }

  /**
   * Memfilter daftar transaksi persewaan untuk kebutuhan Laporan Admin dengan 4 kriteria:
   * 1) Per bulan dalam tahun tertentu (`year` + `month`)
   * 2) Per hari dalam bulan tertentu (`year` + `month` + `day` atau `exactDate`)
   * 3) Per Tipe Garasi (`garageType`)
   * 4) Per Penyewa (`userId`)
   * @param rentals - Daftar transaksi lengkap.
   * @param filters - Kriteria filter laporan.
   * @returns Daftar transaksi yang memenuhi seluruh kriteria filter.
   */
  public filterRentals(
    rentals: RentalWithDetails[],
    filters: ReportFilterInput
  ): RentalWithDetails[] {
    return rentals.filter((rental) => {
      const { year, month, day } = this.parseDateParts(rental.start_date);
      const isoStartDate = `${year}-${String(month).padStart(2, '0')}-${String(
        day
      ).padStart(2, '0')}`;

      if (filters.exactDate && isoStartDate !== filters.exactDate.trim()) {
        return false;
      }

      if (filters.year !== undefined && year !== filters.year) {
        return false;
      }

      if (filters.month !== undefined && month !== filters.month) {
        return false;
      }

      if (filters.day !== undefined && day !== filters.day) {
        return false;
      }

      if (filters.garageType && rental.garage?.type !== filters.garageType) {
        return false;
      }

      if (filters.userId && rental.user_id !== filters.userId) {
        return false;
      }

      return true;
    });
  }

  /**
   * Membuat transaksi sewa baru oleh Penyewa yang telah diverifikasi (`approved`),
   * memvalidasi kendaraan, garasi tersedia, durasi, biaya, serta mengubah status garasi menjadi `used`.
   * @param input - Data transaksi sewa baru.
   * @returns Data transaksi yang tersimpan di tabel `rentals`.
   */
  public async createRental(input: CreateRentalInput): Promise<Rental> {
    if (!input.paymentProofUrl || !input.paymentProofUrl.trim()) {
      throw new Error('Bukti pelunasan biaya wajib diunggah.');
    }

    // 1. Pastikan user berstatus approved
    const user = await this.authService.getUserById(input.userId);
    if (!user) {
      throw new Error('Data penyewa tidak ditemukan.');
    }
    this.authService.ensureTenantApproved(user);

    // 2. Pastikan garasi tersedia hari ini
    const { data: garageData, error: garageError } = await this.db
      .from('garages')
      .select('*')
      .eq('id', input.garageId)
      .maybeSingle();

    if (garageError || !garageData) {
      throw new Error('Data garasi tidak ditemukan.');
    }
    const garage = garageData as Garage;
    if (garage.status !== 'available') {
      throw new Error(
        `Garasi ${garage.code} sedang digunakan (status: ${garage.status}). Silakan pilih garasi lain.`
      );
    }

    // 3. Validasi kesesuaian tipe kendaraan vs tipe garasi
    if (!this.garageService.isVehicleCompatibleWithGarage(input.vehicleType, garage.type)) {
      throw new Error(
        `Kendaraan tipe ${input.vehicleType} tidak dapat menggunakan garasi tipe ${garage.type} (${garage.code}).`
      );
    }

    // 4. Validasi detail kendaraan
    this.validateVehicleInput({
      vehicleType: input.vehicleType,
      licensePlate: input.licensePlate,
      vehicleBrand: input.vehicleBrand,
      maxBatteryKwh: input.maxBatteryKwh,
      currentBatteryKwh: input.currentBatteryKwh,
    });

    // 5. Tanggal mulai sewa SELALU otomatis hari ini
    const startDate = input.startDate ?? this.getTodayDateISO();
    const durationDays =
      input.rentalType === 'bulanan'
        ? RentalService.MONTHLY_DURATION_DAYS
        : input.durationDays ?? 0;

    // 6. Hitung biaya dan tanggal selesai
    const costs = this.calculateTotalCost({
      rentalType: input.rentalType,
      dailyPrice: Number(garage.daily_price),
      durationDays: input.rentalType === 'bulanan' ? RentalService.MONTHLY_DURATION_DAYS : durationDays,
      vehicleType: input.vehicleType,
      garageType: garage.type,
      maxBatteryKwh: input.maxBatteryKwh,
      currentBatteryKwh: input.currentBatteryKwh,
      kwhPrice: Number(garage.kwh_price),
    });

    const endDate = this.calculateEndDate(startDate, input.rentalType, durationDays);

    // 7. Simpan transaksi ke tabel rentals
    const rentalPayload = {
      user_id: input.userId,
      garage_id: input.garageId,
      vehicle_type: input.vehicleType,
      license_plate:
        input.vehicleType === 'sepeda'
          ? input.licensePlate?.trim() || null
          : input.licensePlate!.trim().toUpperCase(),
      vehicle_brand: input.vehicleBrand.trim(),
      max_battery_kwh:
        input.vehicleType === 'mobil_listrik' ? input.maxBatteryKwh ?? null : null,
      current_battery_kwh:
        input.vehicleType === 'mobil_listrik' ? input.currentBatteryKwh ?? null : null,
      rental_type: input.rentalType,
      duration_days: durationDays,
      start_date: startDate,
      end_date: endDate,
      rental_cost: costs.rentalCost,
      electricity_cost: costs.electricityCost,
      total_cost: costs.totalCost,
      payment_proof_url: input.paymentProofUrl.trim(),
      status: 'active' as const,
    };

    const { data: createdRental, error: insertError } = await this.db
      .from('rentals')
      .insert(rentalPayload)
      .select('*')
      .single();

    if (insertError) {
      throw new Error(`Gagal menyimpan transaksi sewa: ${insertError.message}`);
    }

    // 8. Ubah status garasi otomatis menjadi 'used'
    const { error: updateGarageError } = await this.db
      .from('garages')
      .update({ status: 'used' })
      .eq('id', garage.id);

    if (updateGarageError) {
      throw new Error(
        `Transaksi tersimpan, tetapi gagal memperbarui status garasi: ${updateGarageError.message}`
      );
    }

    return createdRental as Rental;
  }

  /**
   * Mengambil seluruh transaksi sewa yang masih berstatus `active` beserta detail relasi.
   * @returns Daftar sewa aktif.
   */
  public async getActiveRentals(): Promise<RentalWithDetails[]> {
    const { data, error } = await this.db
      .from('rentals')
      .select(
        `
        *,
        user:users(id, nik, full_name, phone, email, status),
        garage:garages(id, code, type, daily_price, kwh_price, status),
        extensions:rental_extensions(*)
      `
      )
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Gagal memuat daftar garasi yang sedang disewa: ${error.message}`);
    }

    return (data ?? []) as RentalWithDetails[];
  }

  /**
   * Mengambil seluruh riwayat sewa milik seorang penyewa (mendukung banyak garasi bersamaan).
   * @param userId - UUID penyewa.
   * @returns Daftar sewa penyewa tersebut.
   */
  public async getUserRentals(userId: string): Promise<RentalWithDetails[]> {
    const { data, error } = await this.db
      .from('rentals')
      .select(
        `
        *,
        garage:garages(id, code, type, daily_price, kwh_price, status),
        extensions:rental_extensions(*)
      `
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Gagal memuat daftar sewa Anda: ${error.message}`);
    }

    return (data ?? []) as RentalWithDetails[];
  }

  /**
   * Memperpanjang masa sewa garasi yang sedang aktif oleh Admin.
   * Menyimpan catatan ke tabel `rental_extensions` dan memperbarui `end_date` di tabel `rentals`.
   * @param input - Data perpanjangan (ID sewa, tanggal selesai baru, bukti bayar, ID admin).
   * @returns Data perpanjangan yang baru disimpan.
   */
  public async extendRental(input: ExtendRentalInput): Promise<RentalExtension> {
    if (!input.paymentProofUrl || !input.paymentProofUrl.trim()) {
      throw new Error('Bukti bayar perpanjangan wajib diunggah oleh Admin.');
    }

    const adminUser = await this.authService.getUserById(input.adminId);
    if (!adminUser || adminUser.role !== 'admin') {
      throw new Error('Hanya Admin yang diizinkan melakukan perpanjangan sewa garasi.');
    }

    const { data: rentalData, error: rentalError } = await this.db
      .from('rentals')
      .select(
        `
        *,
        garage:garages(id, code, type, daily_price, kwh_price, status)
      `
      )
      .eq('id', input.rentalId)
      .maybeSingle();

    if (rentalError || !rentalData) {
      throw new Error('Transaksi sewa tidak ditemukan.');
    }

    const rental = rentalData as RentalWithDetails;
    if (rental.status !== 'active') {
      throw new Error('Hanya transaksi sewa berstatus aktif yang dapat diperpanjang.');
    }

    const dailyPrice = Number(rental.garage?.daily_price ?? 0);
    const { additionalDays, additionalCost } = this.calculateExtension(
      rental.end_date,
      input.newEndDate,
      dailyPrice
    );

    const extensionPayload = {
      rental_id: rental.id,
      previous_end_date: rental.end_date,
      new_end_date: input.newEndDate,
      additional_days: additionalDays,
      additional_cost: additionalCost,
      payment_proof_url: input.paymentProofUrl.trim(),
      extended_by: input.adminId,
    };

    const { data: createdExtension, error: extError } = await this.db
      .from('rental_extensions')
      .insert(extensionPayload)
      .select('*')
      .single();

    if (extError) {
      throw new Error(`Gagal menyimpan data perpanjangan sewa: ${extError.message}`);
    }

    const { error: updateRentalError } = await this.db
      .from('rentals')
      .update({
        end_date: input.newEndDate,
        duration_days: rental.duration_days + additionalDays,
      })
      .eq('id', rental.id);

    if (updateRentalError) {
      throw new Error(
        `Data perpanjangan tersimpan, tetapi gagal memperbarui end_date sewa: ${updateRentalError.message}`
      );
    }

    return createdExtension as RentalExtension;
  }

  /**
   * Mengambil laporan seluruh transaksi persewaan dengan dukungan 4 filter lengkap.
   * @param filters - Kriteria filter laporan (tahun, bulan, hari/tanggal, tipe garasi, penyewa).
   * @returns Daftar transaksi sewa terfilter beserta detail relasinya.
   */
  public async getRentalReport(
    filters: ReportFilterInput = {}
  ): Promise<RentalWithDetails[]> {
    const { data, error } = await this.db
      .from('rentals')
      .select(
        `
        *,
        user:users(id, nik, full_name, phone, email, status),
        garage:garages(id, code, type, daily_price, kwh_price, status),
        extensions:rental_extensions(*)
      `
      )
      .order('start_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Gagal memuat laporan persewaan: ${error.message}`);
    }

    const allRentals = (data ?? []) as RentalWithDetails[];
    return this.filterRentals(allRentals, filters);
  }
}
