/**
 * @fileoverview Service Class untuk manajemen unit garasi, penomoran otomatis, dan validasi kesesuaian kendaraan.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from '@/lib/supabase';
import {
  BulkCreateGarageInput,
  Garage,
  GarageType,
  VehicleType,
} from '@/types';

/**
 * Mengelola seluruh logika bisnis terkait unit garasi:
 * pembuatan massal (bulk create), generator kode incremental (S001, C001, E001)
 * dengan batas maksimal 999 unit per tipe, serta pencocokan tipe kendaraan dengan tipe garasi.
 */
export class GarageService {
  public static readonly MAX_UNITS_PER_TYPE = 999;

  private static readonly TYPE_PREFIX_MAP: Record<GarageType, 'S' | 'C' | 'E'> = {
    sepeda: 'S',
    mobil: 'C',
    mobil_listrik: 'E',
  };

  private static readonly VEHICLE_GARAGE_COMPATIBILITY: Record<
    VehicleType,
    GarageType[]
  > = {
    sepeda: ['sepeda'],
    sepeda_motor: ['sepeda'],
    mobil: ['mobil'],
    mobil_listrik: ['mobil', 'mobil_listrik'],
  };

  private readonly db: SupabaseClient;

  /**
   * Membuat instance baru dari GarageService.
   * @param db - Client Supabase opsional untuk dependency injection.
   */
  constructor(db: SupabaseClient = defaultSupabase) {
    this.db = db;
  }

  /**
   * Mengembalikan huruf awalan kode garasi berdasarkan tipe garasi.
   * `sepeda` -> `S`, `mobil` -> `C`, `mobil_listrik` -> `E`.
   * @param type - Tipe garasi.
   * @returns Karakter prefix (`S`, `C`, atau `E`).
   */
  public getPrefixByType(type: GarageType): 'S' | 'C' | 'E' {
    const prefix = GarageService.TYPE_PREFIX_MAP[type];
    if (!prefix) {
      throw new Error(`Tipe garasi tidak dikenal: ${type}`);
    }
    return prefix;
  }

  /**
   * Mengekstrak nomor urut numerik dari kode garasi (misal `C010` -> `10`).
   * @param code - Kode garasi dengan format `[SCE]001`.
   * @returns Nomor urut integer antara 1 sampai 999.
   * @throws {Error} Jika format kode tidak valid.
   */
  public parseCodeNumber(code: string): number {
    const match = /^[SCE](\d+)$/.exec(code.trim().toUpperCase());
    if (!match) {
      throw new Error(`Format kode garasi tidak valid: ${code}`);
    }
    return parseInt(match[1], 10);
  }

  /**
   * Memformat nomor urut menjadi kode garasi 3 digit dengan prefix tipe (misal `S001`, `C010`).
   * @param type - Tipe garasi.
   * @param sequenceNumber - Nomor urut antara 1 hingga 999.
   * @returns Kode garasi terformat.
   * @throws {Error} Jika nomor urut kurang dari 1 atau melebihi 999.
   */
  public formatGarageCode(type: GarageType, sequenceNumber: number): string {
    if (
      !Number.isInteger(sequenceNumber) ||
      sequenceNumber < 1 ||
      sequenceNumber > GarageService.MAX_UNITS_PER_TYPE
    ) {
      throw new Error(
        `Nomor urut garasi harus antara 1 dan ${GarageService.MAX_UNITS_PER_TYPE}.`
      );
    }

    const prefix = this.getPrefixByType(type);
    return `${prefix}${String(sequenceNumber).padStart(3, '0')}`;
  }

  /**
   * Menghasilkan daftar kode garasi secara berurutan (incremental) berdasarkan kode terakhir di database.
   * Menjamin total unit per tipe tidak melebihi 999.
   * @param type - Tipe garasi (`sepeda`, `mobil`, atau `mobil_listrik`).
   * @param quantity - Jumlah garasi baru yang akan dibuat (1 - 999).
   * @param lastCode - Kode garasi terakhir yang sudah ada di database (null jika belum ada).
   * @returns Array kode garasi baru yang berurutan.
   * @throws {Error} Jika quantity tidak valid atau total unit melebihi 999.
   */
  public generateIncrementalCodes(
    type: GarageType,
    quantity: number,
    lastCode?: string | null
  ): string[] {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error('Jumlah garasi yang dibuat minimal 1 unit.');
    }
    if (quantity > GarageService.MAX_UNITS_PER_TYPE) {
      throw new Error(
        `Jumlah pembuatan garasi maksimal ${GarageService.MAX_UNITS_PER_TYPE} unit per tipe.`
      );
    }

    const lastNumber = lastCode ? this.parseCodeNumber(lastCode) : 0;
    const targetLastNumber = lastNumber + quantity;

    if (targetLastNumber > GarageService.MAX_UNITS_PER_TYPE) {
      const remaining = Math.max(0, GarageService.MAX_UNITS_PER_TYPE - lastNumber);
      throw new Error(
        `Batas maksimal garasi tipe ${type} adalah ${GarageService.MAX_UNITS_PER_TYPE} unit. Sisa kapasitas yang dapat dibuat: ${remaining} unit.`
      );
    }

    const codes: string[] = [];
    for (let seq = lastNumber + 1; seq <= targetLastNumber; seq++) {
      codes.push(this.formatGarageCode(type, seq));
    }
    return codes;
  }

  /**
   * Mendapatkan daftar tipe garasi yang diperbolehkan untuk tipe kendaraan tertentu.
   * - `sepeda` / `sepeda_motor` -> hanya `sepeda` (S)
   * - `mobil` -> hanya `mobil` (C)
   * - `mobil_listrik` -> `mobil` (C) atau `mobil_listrik` (E)
   * @param vehicleType - Tipe kendaraan penyewa.
   * @returns Array tipe garasi yang kompatibel.
   */
  public getAllowedGarageTypes(vehicleType: VehicleType): GarageType[] {
    const allowed = GarageService.VEHICLE_GARAGE_COMPATIBILITY[vehicleType];
    if (!allowed) {
      throw new Error(`Tipe kendaraan tidak valid: ${vehicleType}`);
    }
    return [...allowed];
  }

  /**
   * Memvalidasi apakah suatu tipe kendaraan diizinkan menempati suatu tipe garasi.
   * @param vehicleType - Tipe kendaraan yang akan disewakan garasinya.
   * @param garageType - Tipe garasi yang dipilih.
   * @returns `true` jika kompatibel, `false` jika tidak sesuai aturan bisnis.
   */
  public isVehicleCompatibleWithGarage(
    vehicleType: VehicleType,
    garageType: GarageType
  ): boolean {
    return this.getAllowedGarageTypes(vehicleType).includes(garageType);
  }

  /**
   * Mengambil kode garasi terakhir di database untuk tipe tertentu agar tidak terjadi bentrok penomoran.
   * @param type - Tipe garasi.
   * @returns Kode terakhir (misal `C005`) atau `null` jika belum ada garasi untuk tipe tersebut.
   */
  public async getLastGarageCode(type: GarageType): Promise<string | null> {
    const { data, error } = await this.db
      .from('garages')
      .select('code')
      .eq('type', type)
      .order('code', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Gagal mengecek kode garasi terakhir: ${error.message}`);
    }

    return data?.code ?? null;
  }

  /**
   * Membuat unit garasi baru secara massal (bulk create) dengan penomoran otomatis incremental.
   * @param input - Parameter pembuatan garasi (tipe, jumlah, harga harian, harga kWh khusus EV).
   * @returns Daftar unit garasi yang berhasil disimpan ke database.
   * @throws {Error} Jika input tidak valid, kapasitas 999 terlampaui, atau insert database gagal.
   */
  public async bulkCreateGarages(input: BulkCreateGarageInput): Promise<Garage[]> {
    if (!Number.isFinite(input.dailyPrice) || input.dailyPrice <= 0) {
      throw new Error('Harga sewa harian harus lebih besar dari 0.');
    }

    const isElectric = input.type === 'mobil_listrik';
    const kwhPrice = isElectric ? Number(input.kwhPrice ?? 0) : 0;

    if (isElectric && (!Number.isFinite(kwhPrice) || kwhPrice <= 0)) {
      throw new Error(
        'Untuk garasi mobil_listrik, Harga Isi Listrik per kWh wajib diisi lebih dari 0.'
      );
    }

    const lastCode = await this.getLastGarageCode(input.type);
    const newCodes = this.generateIncrementalCodes(
      input.type,
      input.quantity,
      lastCode
    );

    const rows = newCodes.map((code) => ({
      code,
      type: input.type,
      daily_price: input.dailyPrice,
      kwh_price: kwhPrice,
      status: 'available' as const,
    }));

    const { data, error } = await this.db
      .from('garages')
      .insert(rows)
      .select('*')
      .order('code', { ascending: true });

    if (error) {
      throw new Error(`Gagal membuat garasi secara massal: ${error.message}`);
    }

    return (data ?? []) as Garage[];
  }

  /**
   * Mengambil seluruh unit garasi yang berstatus `available` pada hari ini
   * dan sesuai dengan tipe kendaraan yang dipilih penyewa.
   * @param vehicleType - Tipe kendaraan penyewa.
   * @returns Daftar garasi tersedia yang kompatibel, diurutkan berdasarkan kode.
   */
  public async getAvailableGaragesForVehicle(
    vehicleType: VehicleType
  ): Promise<Garage[]> {
    const allowedTypes = this.getAllowedGarageTypes(vehicleType);

    const { data, error } = await this.db
      .from('garages')
      .select('*')
      .eq('status', 'available')
      .in('type', allowedTypes)
      .order('code', { ascending: true });

    if (error) {
      throw new Error(`Gagal memuat daftar garasi tersedia: ${error.message}`);
    }

    return (data ?? []) as Garage[];
  }

  /**
   * Mengambil seluruh unit garasi untuk manajemen inventaris Admin.
   * @returns Daftar seluruh garasi diurutkan berdasarkan kode.
   */
  public async getAllGarages(): Promise<Garage[]> {
    const { data, error } = await this.db
      .from('garages')
      .select('*')
      .order('code', { ascending: true });

    if (error) {
      throw new Error(`Gagal memuat seluruh data garasi: ${error.message}`);
    }

    return (data ?? []) as Garage[];
  }
}
