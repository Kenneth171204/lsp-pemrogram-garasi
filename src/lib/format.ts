import { GarageType, RentalType, UserStatus, VehicleType } from '@/types';

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export function formatDateID(dateStr: string): string {
  if (!dateStr) return '-';
  const clean = dateStr.slice(0, 10);
  const [y, m, d] = clean.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt);
}

export const GARAGE_TYPE_LABELS: Record<GarageType, string> = {
  sepeda: 'Garasi Sepeda (S)',
  mobil: 'Garasi Mobil (C)',
  mobil_listrik: 'Garasi Mobil Listrik (E)',
};

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  sepeda: 'Sepeda',
  sepeda_motor: 'Sepeda Motor',
  mobil: 'Mobil',
  mobil_listrik: 'Mobil Listrik (EV)',
};

export const RENTAL_TYPE_LABELS: Record<RentalType, string> = {
  harian: 'Harian (< 1 Bulan)',
  bulanan: 'Bulanan (Maks 1 Bulan)',
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  pending: 'Menunggu Verifikasi',
  approved: 'Terverifikasi',
  rejected: 'Ditolak',
};
