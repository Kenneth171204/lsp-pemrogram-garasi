# Sistem Penyewaan Garasi Kendaraan

Aplikasi web untuk manajemen penyewaan garasi kendaraan (Sepeda, Mobil, dan Mobil Listrik/EV) dengan sistem verifikasi penyewa, perhitungan tarif harian/bulanan, pengisian daya EV, perpanjangan sewa oleh Admin, dan pelaporan transaksi.

## Tech Stack

- **Framework:** Next.js 14 (App Router), React 18, TypeScript
- **Styling & UI:** Tailwind CSS, Lucide React
- **Database & Storage:** Supabase (PostgreSQL & Storage Bucket)
- **Unit Testing:** Vitest

## Fitur Utama

### Penyewa
- Registrasi akun (wajib email `@gmail.com`, validasi NIK, password min. 6 karakter & konfirmasi password) dengan status awal `pending`.
- Sewa garasi baru sesuai kompatibilitas kendaraan (`S` untuk Sepeda/Motor, `C` untuk Mobil/EV, `E` untuk EV).
- Perhitungan otomatis sewa harian dinamis (maks. total hari dalam bulan - 1), bulanan (25x tarif harian), dan biaya listrik EV `(max_battery - current_battery) * tarif_kwh` khusus di Garasi `E`.
- Upload bukti pembayaran (maks. 5 MB) dan riwayat sewa aktif.

### Admin
- Verifikasi pendaftaran penyewa (*Approve / Reject*).
- Pembuatan unit garasi secara massal (*Bulk Create*) dengan kode inkremental (`S001`, `C001`, `E001`, maks. 999 unit per tipe).
- Perpanjangan masa sewa aktif beserta perhitungan sisa biaya tambahan dan upload bukti bayar.
- Laporan penyewaan dengan 4 filter dinamis (Tahun/Bulan, Tanggal, Tipe Garasi, dan Penyewa).

## Cara Menjalankan Proyek

### 1. Clone & Install Dependencies
```bash
git clone [https://github.com/Kenneth171204/lsp-pemrogram-garasi.git](https://github.com/Kenneth171204/lsp-pemrogram-garasi.git)
cd lsp-pemrogram-garasi
npm install
```

### 2. Konfigurasi Environment
Buat file `.env.local` di root proyek dan isi dengan kredensial Supabase:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Setup Database Supabase
Jalankan script SQL yang ada di `supabase/schema.sql` melalui **SQL Editor** pada Supabase Dashboard untuk membuat tabel (`users`, `garages`, `rentals`, `rental_extensions`), bucket storage `payment-proofs`, serta akun Admin default.

### 4. Jalankan Aplikasi
```bash
npm run dev
```
Buka `http://localhost:3000` di browser.

### 5. Jalankan Unit Testing
```bash
npm run test
```
Seluruh unit test (`auth.service.test.ts`, `garage.service.test.ts`, `rental.service.test.ts`) akan dijalankan menggunakan Vitest (38/38 test cases PASS).

## Akun Admin Default
- **Email:** `admin@garasi.com`
- **Password:** `admin123`
