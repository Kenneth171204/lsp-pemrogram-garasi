import { SupabaseClient } from '@supabase/supabase-js';
import { translateError } from '@/lib/errors';
import { supabase as defaultSupabase } from '@/lib/supabase';
import {
  BulkCreateGarageInput,
  Garage,
  GarageType,
  VehicleType,
} from '@/types';

export class GarageService {
  public static readonly MAX_UNITS_PER_TYPE = 999;

  private static readonly TYPE_PREFIX_MAP: Record<GarageType, 'S' | 'C' | 'E'> = {
    sepeda: 'S',
    mobil: 'C',
    mobil_listrik: 'E',
  };

  // Aturan kompatibilitas kendaraan terhadap tipe garasi
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

  constructor(db: SupabaseClient = defaultSupabase) {
    this.db = db;
  }

  public getPrefixByType(type: GarageType): 'S' | 'C' | 'E' {
    const prefix = GarageService.TYPE_PREFIX_MAP[type];
    if (!prefix) {
      throw new Error(`Tipe garasi tidak dikenal: ${type}`);
    }
    return prefix;
  }

  public parseCodeNumber(code: string): number {
    const match = /^[SCE](\d+)$/.exec(code.trim().toUpperCase());
    if (!match) {
      throw new Error(`Format kode garasi tidak valid: ${code}`);
    }
    return parseInt(match[1], 10);
  }

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

  public getAllowedGarageTypes(vehicleType: VehicleType): GarageType[] {
    const allowed = GarageService.VEHICLE_GARAGE_COMPATIBILITY[vehicleType];
    if (!allowed) {
      throw new Error(`Tipe kendaraan tidak valid: ${vehicleType}`);
    }
    return [...allowed];
  }

  public isVehicleCompatibleWithGarage(
    vehicleType: VehicleType,
    garageType: GarageType
  ): boolean {
    return this.getAllowedGarageTypes(vehicleType).includes(garageType);
  }

  public async getLastGarageCode(type: GarageType): Promise<string | null> {
    try {
      const { data, error } = await this.db
        .from('garages')
        .select('code')
        .eq('type', type)
        .order('code', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(translateError(error, 'Gagal mengecek kode garasi terakhir.'));
      }

      return data?.code ?? null;
    } catch (err) {
      throw new Error(translateError(err, 'Gagal mengecek kode garasi terakhir.'));
    }
  }

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

    try {
      const { data, error } = await this.db
        .from('garages')
        .insert(rows)
        .select('*')
        .order('code', { ascending: true });

      if (error) {
        throw new Error(translateError(error, 'Gagal membuat garasi secara massal.'));
      }

      return (data ?? []) as Garage[];
    } catch (err) {
      throw new Error(translateError(err, 'Gagal membuat garasi secara massal.'));
    }
  }

  public async getAvailableGaragesForVehicle(
    vehicleType: VehicleType
  ): Promise<Garage[]> {
    const allowedTypes = this.getAllowedGarageTypes(vehicleType);

    try {
      const { data, error } = await this.db
        .from('garages')
        .select('*')
        .eq('status', 'available')
        .in('type', allowedTypes)
        .order('code', { ascending: true });

      if (error) {
        throw new Error(translateError(error, 'Gagal memuat daftar garasi tersedia.'));
      }

      return (data ?? []) as Garage[];
    } catch (err) {
      throw new Error(translateError(err, 'Gagal memuat daftar garasi tersedia.'));
    }
  }

  public async getAllGarages(): Promise<Garage[]> {
    try {
      const { data, error } = await this.db
        .from('garages')
        .select('*')
        .order('code', { ascending: true });

      if (error) {
        throw new Error(translateError(error, 'Gagal memuat seluruh data garasi.'));
      }

      return (data ?? []) as Garage[];
    } catch (err) {
      throw new Error(translateError(err, 'Gagal memuat seluruh data garasi.'));
    }
  }
}
