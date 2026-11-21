-- ============================================================================
-- Sistem Penyewaan Garasi Kendaraan (LSP Pemrogram)
-- Schema PostgreSQL + Seeder Admin + Storage Bucket Setup untuk Supabase
-- ============================================================================

-- Aktifkan ekstensi pgcrypto / uuid jika belum aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TABEL USERS (Admin & Penyewa)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nik VARCHAR(20) UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(30),
  email VARCHAR(150) UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'penyewa' CHECK (role IN ('admin', 'penyewa')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. TABEL GARAGES (Sepeda: S001, Mobil: C001, Mobil Listrik: E001)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.garages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) UNIQUE NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('sepeda', 'mobil', 'mobil_listrik')),
  daily_price NUMERIC(12, 2) NOT NULL CHECK (daily_price >= 0),
  kwh_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (kwh_price >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'used')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. TABEL RENTALS (Transaksi Sewa Garasi)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  garage_id UUID NOT NULL REFERENCES public.garages(id) ON DELETE RESTRICT,
  vehicle_type VARCHAR(20) NOT NULL CHECK (vehicle_type IN ('sepeda', 'sepeda_motor', 'mobil', 'mobil_listrik')),
  license_plate VARCHAR(30),
  vehicle_brand VARCHAR(150) NOT NULL,
  max_battery_kwh NUMERIC(10, 2),
  current_battery_kwh NUMERIC(10, 2),
  rental_type VARCHAR(20) NOT NULL CHECK (rental_type IN ('harian', 'bulanan')),
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL,
  rental_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (rental_cost >= 0),
  electricity_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (electricity_cost >= 0),
  total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  payment_proof_url TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. TABEL RENTAL_EXTENSIONS (Riwayat Perpanjangan Sewa oleh Admin)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rental_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id UUID NOT NULL REFERENCES public.rentals(id) ON DELETE CASCADE,
  previous_end_date DATE NOT NULL,
  new_end_date DATE NOT NULL,
  additional_days INTEGER NOT NULL CHECK (additional_days > 0),
  additional_cost NUMERIC(12, 2) NOT NULL CHECK (additional_cost >= 0),
  payment_proof_url TEXT NOT NULL,
  extended_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. INDEXES UNTUK PERFORMA QUERY
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_users_role_status ON public.users(role, status);
CREATE INDEX IF NOT EXISTS idx_garages_type_status ON public.garages(type, status);
CREATE INDEX IF NOT EXISTS idx_garages_code ON public.garages(code);
CREATE INDEX IF NOT EXISTS idx_rentals_user_id ON public.rentals(user_id);
CREATE INDEX IF NOT EXISTS idx_rentals_garage_id ON public.rentals(garage_id);
CREATE INDEX IF NOT EXISTS idx_rentals_status_dates ON public.rentals(status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_rental_extensions_rental_id ON public.rental_extensions(rental_id);

-- ============================================================================
-- 6. PERMISSIONS & ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.garages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.rentals DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_extensions DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.users TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.garages TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.rentals TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.rental_extensions TO anon, authenticated, service_role;

-- ============================================================================
-- 7. SEEDER AKUN ADMIN DEFAULT
-- ============================================================================
INSERT INTO public.users (nik, full_name, phone, email, password, role, status)
VALUES (
  '0000000000000001',
  'Administrator Utama',
  '081200000001',
  'admin@garasi.com',
  'admin123',
  'admin',
  'approved'
)
ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- 8. SUPABASE STORAGE BUCKET: payment-proofs (PUBLIC)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Hapus policy lama jika ada agar idempotent saat dijalankan ulang
DROP POLICY IF EXISTS "Public read payment-proofs" ON storage.objects;
DROP POLICY IF EXISTS "Public insert payment-proofs" ON storage.objects;
DROP POLICY IF EXISTS "Public update payment-proofs" ON storage.objects;
DROP POLICY IF EXISTS "Public delete payment-proofs" ON storage.objects;

CREATE POLICY "Public read payment-proofs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'payment-proofs');

CREATE POLICY "Public insert payment-proofs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'payment-proofs');

CREATE POLICY "Public update payment-proofs"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'payment-proofs')
  WITH CHECK (bucket_id = 'payment-proofs');

CREATE POLICY "Public delete payment-proofs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'payment-proofs');
