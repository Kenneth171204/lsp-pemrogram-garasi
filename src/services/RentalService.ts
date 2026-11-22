import { SupabaseClient } from '@supabase/supabase-js';
import { translateError } from '@/lib/errors';
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
  VehicleType,
} from '@/types';

export class RentalService {
  public static readonly MONTHLY_PRICE_MULTIPLIER = 25;
  public static readonly MONTHLY_DURATION_DAYS = 30;

  private readonly db: SupabaseClient;
  private readonly authService: AuthService;
  private readonly garageService: GarageService;

  constructor(
    db: SupabaseClient = defaultSupabase,
    authService?: AuthService,
    garageService?: GarageService
  ) {
    this.db = db;
    this.authService = authService ?? new AuthService(this.db);
    this.garageService = garageService ?? new GarageService(this.db);
  }

  public static getTodayDateISO(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  public getTodayDateISO(): string {
    return RentalService.getTodayDateISO();
  }

  // Parsing komponen tanggal via UTC agar kalender tidak tergeser timezone lokal
  private static parseDateParts(dateInput: string | Date): {
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

  private parseDateParts(dateInput: string | Date): {
    year: number;
    month: number;
    day: number;
  } {
    return RentalService.parseDateParts(dateInput);
  }

  public static getDaysInMonth(dateStr: string | Date): number {
    const { year, month } = RentalService.parseDateParts(dateStr);
    return new Date(year, month, 0).getDate();
  }

  public getDaysInMonth(dateStr: string | Date): number {
    return RentalService.getDaysInMonth(dateStr);
  }

  public static getMaxDailyDuration(startDate?: string | Date): number {
    const targetDate = startDate ?? RentalService.getTodayDateISO();
    return RentalService.getDaysInMonth(targetDate) - 1;
  }

  public getMaxDailyDuration(startDate?: string | Date): number {
    return RentalService.getMaxDailyDuration(startDate);
  }

  private formatUTCDate(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

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

  public validateDuration(
    rentalType: RentalType,
    durationValue: number,
    startDate?: string | Date
  ): void {
    if (rentalType === 'harian') {
      const maxDays = this.getMaxDailyDuration(startDate);
      if (!Number.isInteger(durationValue) || durationValue < 1) {
        throw new Error('Durasi sewa harian minimal 1 hari.');
      }
      if (durationValue > maxDays) {
        throw new Error(
          `Durasi sewa harian maksimal adalah ${maxDays} hari untuk bulan ini (total hari bulan - 1).`
        );
      }
      return;
    }

    if (rentalType === 'bulanan') {
      // Menerima input 1 (bulan) atau 30 (hari); tolak durasi lebih dari 1 bulan
      if (durationValue !== 1 && durationValue !== RentalService.MONTHLY_DURATION_DAYS) {
        throw new Error(
          'Sewa bulanan maksimal 1 bulan (30 hari) per transaksi. Jika ingin menyewa lebih dari 1 bulan, silakan buat transaksi sewa baru lagi.'
        );
      }
      return;
    }

    throw new Error(`Tipe sewa tidak dikenal: ${rentalType}`);
  }

  // Sewa bulanan menggunakan tarif tetap 25x harga harian
  public calculateRentalCost(
    rentalType: RentalType,
    dailyPrice: number,
    durationDays?: number,
    startDate?: string | Date
  ): number {
    if (!Number.isFinite(dailyPrice) || dailyPrice < 0) {
      throw new Error('Harga sewa harian tidak valid.');
    }

    if (rentalType === 'harian') {
      const days = durationDays ?? 0;
      this.validateDuration('harian', days, startDate);
      return days * dailyPrice;
    }

    const monthlyCheckValue = durationDays ?? RentalService.MONTHLY_DURATION_DAYS;
    this.validateDuration('bulanan', monthlyCheckValue);
    return RentalService.MONTHLY_PRICE_MULTIPLIER * dailyPrice;
  }

  // Wajib isi penuh khusus mobil listrik di garasi E; biaya 0 jika masuk garasi C
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

  public calculateTotalCost(params: {
    rentalType: RentalType;
    dailyPrice: number;
    durationDays?: number;
    startDate?: string | Date;
    vehicleType: VehicleType;
    garageType: GarageType;
    maxBatteryKwh?: number | null;
    currentBatteryKwh?: number | null;
    kwhPrice?: number;
  }): CostBreakdown {
    const rentalCost = this.calculateRentalCost(
      params.rentalType,
      params.dailyPrice,
      params.durationDays,
      params.startDate
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

  public calculateEndDate(
    startDate: string | Date,
    rentalType: RentalType,
    durationDays?: number
  ): string {
    const { year, month, day } = this.parseDateParts(startDate);

    if (rentalType === 'harian') {
      const days = durationDays ?? 0;
      this.validateDuration('harian', days, startDate);
      const endUtc = new Date(Date.UTC(year, month - 1, day + days));
      return this.formatUTCDate(endUtc);
    }

    const monthlyCheckValue = durationDays ?? RentalService.MONTHLY_DURATION_DAYS;
    this.validateDuration('bulanan', monthlyCheckValue);

    // Clamp ke hari terakhir bulan tujuan agar tanggal 31 Jan tidak meloncat ke Maret
    const targetMonthIndex = month;
    const targetYear = year + Math.floor(targetMonthIndex / 12);
    const normalizedMonth = targetMonthIndex % 12;
    const lastDayOfTargetMonth = new Date(
      Date.UTC(targetYear, normalizedMonth + 1, 0)
    ).getUTCDate();
    const clampedDay = Math.min(day, lastDayOfTargetMonth);

    return this.formatUTCDate(new Date(Date.UTC(targetYear, normalizedMonth, clampedDay)));
  }

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

  public async createRental(input: CreateRentalInput): Promise<Rental> {
    if (!input.paymentProofUrl || !input.paymentProofUrl.trim()) {
      throw new Error('Bukti pelunasan biaya wajib diunggah.');
    }

    try {
      const user = await this.authService.getUserById(input.userId);
      if (!user) {
        throw new Error('Data penyewa tidak ditemukan.');
      }
      this.authService.ensureTenantApproved(user);

      const { data: garageData, error: garageError } = await this.db
        .from('garages')
        .select('*')
        .eq('id', input.garageId)
        .maybeSingle();

      if (garageError) {
        throw new Error(translateError(garageError, 'Gagal memeriksa data garasi.'));
      }
      if (!garageData) {
        throw new Error('Data garasi tidak ditemukan.');
      }
      const garage = garageData as Garage;
      if (garage.status !== 'available') {
        throw new Error(
          `Garasi ${garage.code} sedang digunakan (status: ${garage.status}). Silakan pilih garasi lain.`
        );
      }

      if (!this.garageService.isVehicleCompatibleWithGarage(input.vehicleType, garage.type)) {
        throw new Error(
          `Kendaraan tipe ${input.vehicleType} tidak dapat menggunakan garasi tipe ${garage.type} (${garage.code}).`
        );
      }

      this.validateVehicleInput({
        vehicleType: input.vehicleType,
        licensePlate: input.licensePlate,
        vehicleBrand: input.vehicleBrand,
        maxBatteryKwh: input.maxBatteryKwh,
        currentBatteryKwh: input.currentBatteryKwh,
      });

      const startDate = input.startDate ?? this.getTodayDateISO();
      const durationDays =
        input.rentalType === 'bulanan'
          ? RentalService.MONTHLY_DURATION_DAYS
          : input.durationDays ?? 0;

      const costs = this.calculateTotalCost({
        rentalType: input.rentalType,
        dailyPrice: Number(garage.daily_price),
        durationDays:
          input.rentalType === 'bulanan'
            ? RentalService.MONTHLY_DURATION_DAYS
            : durationDays,
        startDate,
        vehicleType: input.vehicleType,
        garageType: garage.type,
        maxBatteryKwh: input.maxBatteryKwh,
        currentBatteryKwh: input.currentBatteryKwh,
        kwhPrice: Number(garage.kwh_price),
      });

      const endDate = this.calculateEndDate(startDate, input.rentalType, durationDays);

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
        throw new Error(translateError(insertError, 'Gagal menyimpan transaksi sewa.'));
      }

      const { error: updateGarageError } = await this.db
        .from('garages')
        .update({ status: 'used' })
        .eq('id', garage.id);

      if (updateGarageError) {
        throw new Error(
          translateError(
            updateGarageError,
            'Transaksi tersimpan, tetapi gagal memperbarui status garasi.'
          )
        );
      }

      return createdRental as Rental;
    } catch (err) {
      throw new Error(translateError(err, 'Gagal membuat transaksi sewa garasi.'));
    }
  }

  public async getActiveRentals(): Promise<RentalWithDetails[]> {
    try {
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
        throw new Error(
          translateError(error, 'Gagal memuat daftar garasi yang sedang disewa.')
        );
      }

      return (data ?? []) as RentalWithDetails[];
    } catch (err) {
      throw new Error(
        translateError(err, 'Gagal memuat daftar garasi yang sedang disewa.')
      );
    }
  }

  public async getUserRentals(userId: string): Promise<RentalWithDetails[]> {
    try {
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
        throw new Error(translateError(error, 'Gagal memuat daftar sewa Anda.'));
      }

      return (data ?? []) as RentalWithDetails[];
    } catch (err) {
      throw new Error(translateError(err, 'Gagal memuat daftar sewa Anda.'));
    }
  }

  public async extendRental(input: ExtendRentalInput): Promise<RentalExtension> {
    if (!input.paymentProofUrl || !input.paymentProofUrl.trim()) {
      throw new Error('Bukti bayar perpanjangan wajib diunggah oleh Admin.');
    }

    try {
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

      if (rentalError) {
        throw new Error(translateError(rentalError, 'Gagal memeriksa data sewa.'));
      }
      if (!rentalData) {
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
        throw new Error(
          translateError(extError, 'Gagal menyimpan data perpanjangan sewa.')
        );
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
          translateError(
            updateRentalError,
            'Data perpanjangan tersimpan, tetapi gagal memperbarui tanggal selesai sewa.'
          )
        );
      }

      return createdExtension as RentalExtension;
    } catch (err) {
      throw new Error(translateError(err, 'Gagal memperpanjang masa sewa.'));
    }
  }

  public async getRentalReport(
    filters: ReportFilterInput = {}
  ): Promise<RentalWithDetails[]> {
    try {
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
        throw new Error(translateError(error, 'Gagal memuat laporan persewaan.'));
      }

      const allRentals = (data ?? []) as RentalWithDetails[];
      return this.filterRentals(allRentals, filters);
    } catch (err) {
      throw new Error(translateError(err, 'Gagal memuat laporan persewaan.'));
    }
  }
}
