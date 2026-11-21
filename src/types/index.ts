/**
 * @fileoverview Definisi tipe domain dan DTO untuk Sistem Penyewaan Garasi Kendaraan.
 */

export type UserRole = 'admin' | 'penyewa';

export type UserStatus = 'pending' | 'approved' | 'rejected';

export type GarageType = 'sepeda' | 'mobil' | 'mobil_listrik';

export type GarageStatus = 'available' | 'used';

export type VehicleType = 'sepeda' | 'sepeda_motor' | 'mobil' | 'mobil_listrik';

export type RentalType = 'harian' | 'bulanan';

export type RentalStatus = 'active' | 'completed';

/**
 * Representasi entitas pengguna (Admin atau Penyewa) pada tabel `users`.
 */
export interface User {
  id: string;
  nik: string | null;
  full_name: string;
  phone: string | null;
  email: string;
  password?: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
}

/**
 * Representasi entitas unit garasi pada tabel `garages`.
 */
export interface Garage {
  id: string;
  code: string;
  type: GarageType;
  daily_price: number;
  kwh_price: number;
  status: GarageStatus;
  created_at: string;
}

/**
 * Representasi transaksi persewaan pada tabel `rentals`.
 */
export interface Rental {
  id: string;
  user_id: string;
  garage_id: string;
  vehicle_type: VehicleType;
  license_plate: string | null;
  vehicle_brand: string;
  max_battery_kwh: number | null;
  current_battery_kwh: number | null;
  rental_type: RentalType;
  duration_days: number;
  start_date: string;
  end_date: string;
  rental_cost: number;
  electricity_cost: number;
  total_cost: number;
  payment_proof_url: string;
  status: RentalStatus;
  created_at: string;
}

/**
 * Representasi data perpanjangan sewa pada tabel `rental_extensions`.
 */
export interface RentalExtension {
  id: string;
  rental_id: string;
  previous_end_date: string;
  new_end_date: string;
  additional_days: number;
  additional_cost: number;
  payment_proof_url: string;
  extended_by: string | null;
  created_at: string;
}

/**
 * Data transaksi sewa beserta relasi penyewa, garasi, dan riwayat perpanjangan.
 */
export interface RentalWithDetails extends Rental {
  user?: Pick<User, 'id' | 'nik' | 'full_name' | 'phone' | 'email' | 'status'>;
  garage?: Pick<Garage, 'id' | 'code' | 'type' | 'daily_price' | 'kwh_price' | 'status'>;
  extensions?: RentalExtension[];
}

/**
 * Input pendaftaran penyewa baru.
 */
export interface RegisterInput {
  nik: string;
  fullName: string;
  phone: string;
  email: string;
  password: string;
}

/**
 * Input pembuatan unit garasi secara massal (bulk create) oleh Admin.
 */
export interface BulkCreateGarageInput {
  type: GarageType;
  quantity: number;
  dailyPrice: number;
  kwhPrice?: number;
}

/**
 * Input pembuatan transaksi sewa baru oleh Penyewa.
 */
export interface CreateRentalInput {
  userId: string;
  garageId: string;
  vehicleType: VehicleType;
  licensePlate?: string | null;
  vehicleBrand: string;
  maxBatteryKwh?: number | null;
  currentBatteryKwh?: number | null;
  rentalType: RentalType;
  durationDays?: number;
  startDate?: string;
  paymentProofUrl: string;
}

/**
 * Input perpanjangan tanggal selesai sewa oleh Admin.
 */
export interface ExtendRentalInput {
  rentalId: string;
  newEndDate: string;
  paymentProofUrl: string;
  adminId: string;
}

/**
 * Filter laporan persewaan garasi pada dashboard Admin.
 */
export interface ReportFilterInput {
  year?: number;
  month?: number; // 1 - 12
  day?: number; // 1 - 31
  exactDate?: string; // YYYY-MM-DD
  garageType?: GarageType;
  userId?: string;
}

/**
 * Rincian perhitungan biaya sewa dan biaya isi listrik.
 */
export interface CostBreakdown {
  rentalCost: number;
  electricityCost: number;
  totalCost: number;
}
