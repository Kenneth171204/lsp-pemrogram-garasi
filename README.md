# Sistem Penyewaan Garasi Kendaraan

Aplikasi web untuk manajemen penyewaan garasi kendaraan (Sepeda, Mobil, dan Mobil Listrik/EV) dengan sistem verifikasi penyewa, perhitungan tarif harian/bulanan, pengisian daya EV, perpanjangan sewa oleh Admin, dan pelaporan transaksi.

---

## Tech Stack & Arsitektur

- **Framework:** Next.js 14 (App Router), React 18, TypeScript
- **Styling & UI:** Tailwind CSS, Lucide React
- **Database & Storage:** Supabase (PostgreSQL & Storage Bucket)
- **Unit Testing:** Vitest
- **Arsitektur:** MVC (Model: Supabase & Types, View: Next.js UI, Controller: OOP Service Layer)

---

## Fitur Utama

### Penyewa
- Registrasi akun (wajib email `@gmail.com`, validasi NIK, password min. 6 karakter & konfirmasi password) dengan status awal `pending`.
- Sewa garasi baru sesuai kompatibilitas kendaraan (`S` untuk Sepeda/Motor, `C` untuk Mobil/EV, `E` untuk EV).
- Perhitungan otomatis sewa harian dinamis (maks. `total hari dalam bulan - 1`), bulanan (`25 × tarif harian`), dan biaya listrik EV `(max_battery - current_battery) × tarif_kwh` khusus di Garasi `E`.
- Upload bukti pembayaran (format gambar, maks. 5 MB) dan melihat riwayat sewa aktif.

### Admin
- Verifikasi pendaftaran penyewa (*Approve / Reject*).
- Pembuatan unit garasi secara massal (*Bulk Create*) dengan kode inkremental (`S001`, `C001`, `E001`, maks. 999 unit per tipe).
- Perpanjangan masa sewa aktif beserta perhitungan sisa biaya tambahan dan upload bukti bayar.
- Laporan penyewaan dengan 4 filter dinamis (Tahun/Bulan, Tanggal, Tipe Garasi, dan Penyewa).

---

## Prasyarat (Yang Harus Disiapkan Terlebih Dahulu)

Sebelum menjalankan aplikasi, pastikan perangkat Anda sudah memiliki beberapa kebutuhan berikut:

1. **Node.js (versi 18 atau lebih baru)**
   - Unduh dan instal versi **LTS** dari [https://nodejs.org](https://nodejs.org).
   - Untuk memastikan instalasi berhasil, buka **Terminal / Command Prompt (CMD)** lalu ketik:
     ```bash
     node -v
     npm -v
     ```
   - Jika muncul nomor versi (contoh `v20.x.x` dan `10.x.x`), berarti sudah siap digunakan.
2. **Git** *(Opsional, hanya diperlukan jika ingin clone dari GitHub)*
   - Unduh dari [https://git-scm.com](https://git-scm.com).
3. **Akun Supabase (Gratis)**
   - Daftar atau login di [https://supabase.com](https://supabase.com) menggunakan akun GitHub atau email.
4. **Code Editor & Browser**
   - Disarankan menggunakan **Visual Studio Code (VS Code)** dan browser modern (Chrome, Edge, atau Firefox).

---

## Panduan Instalasi & Menjalankan Proyek (Step-by-Step)

### Langkah 1: Mendapatkan Source Code

Pilih salah satu cara di bawah ini:

**Opsi A — Jika Anda sudah memiliki file ZIP proyek:**
1. Ekstrak file `.zip` proyek ke folder yang mudah ditemukan (misalnya di `Documents`).
2. Buka folder hasil ekstrak tersebut menggunakan **VS Code**, lalu buka terminal di dalam VS Code (`Ctrl + ~` atau menu **Terminal -> New Terminal**).

**Opsi B — Mengunduh langsung dari GitHub (Clone):**
1. Buka Terminal / CMD di folder tujuan Anda.
2. Jalankan perintah berikut:
   ```bash
   git clone https://github.com/Kenneth171204/lsp-pemrogram-garasi.git
   cd lsp-pemrogram-garasi
   ```

---

### Langkah 2: Menginstal Dependencies (Library)

Karena folder `node_modules` tidak disertakan di dalam repository/ZIP, Anda wajib mengunduh ulang seluruh library yang dibutuhkan terlebih dahulu.

Jalankan perintah berikut di terminal (pastikan posisi terminal berada di dalam folder `lsp-pemrogram-garasi`):

```bash
npm install
```

Tunggu hingga proses instalasi selesai tanpa error (biasanya memakan waktu 1–2 menit tergantung kecepatan internet).

---

### Langkah 3: Membuat Project & Setup Database di Supabase

Aplikasi ini menggunakan Supabase sebagai database PostgreSQL dan penyimpanan gambar bukti pembayaran.

1. Buka [https://supabase.com/dashboard](https://supabase.com/dashboard) dan login ke akun Anda.
2. Klik tombol **New Project**.
3. Isi detail project:
   - **Name:** Bebas (misalnya `lsp-garasi`).
   - **Database Password:** Buat password yang kuat (simpan jika perlu).
   - **Region:** Pilih yang terdekat (misalnya `Southeast Asia (Singapore)`).
4. Klik **Create new project** dan tunggu 1–2 menit hingga status project aktif.
5. Setelah masuk ke dashboard project, klik menu **SQL Editor** di panel sebelah kiri, lalu klik **New Query**.
6. Kembali ke folder proyek di komputer Anda, buka file **`supabase/schema.sql`**, lalu blok dan copy seluruh isinya (`Ctrl + A` lalu `Ctrl + C`).
7. Paste seluruh isi SQL tersebut ke dalam kotak **SQL Editor** di Supabase, lalu klik tombol **Run** (atau tekan `Ctrl + Enter`).
8. Pastikan muncul pesan **`Success. No rows returned`** (atau status berhasil). Langkah ini otomatis membuat:
   - 4 tabel database: `users`, `garages`, `rentals`, dan `rental_extensions`.
   - Storage bucket publik: `payment-proofs` (untuk bukti pembayaran).
   - 1 akun **Admin default**.

---

### Langkah 4: Mengambil Kredensial API Supabase

1. Masih di dashboard project Supabase Anda, klik ikon gerigi **Project Settings** di pojok kiri bawah.
2. Pilih menu **API** (atau **Data API** / **API Keys**).
3. Salin dan catat dua nilai berikut:
   - **Project URL** (contoh: `[https://xxxxxxxxxxxx.supabase.co](https://xxxxxxxxxxxx.supabase.co)`)
   - **anon / public key** (deretan teks panjang yang diawali `eyJhbGci...`)

---

### Langkah 5: Konfigurasi File Environment (`.env.local`)

1. Di dalam folder utama (*root*) proyek (sejajar dengan file `package.json`), buat file baru bernama persis `.env.local`.
2. Isi file `.env.local` dengan format berikut, lalu ganti nilainya menggunakan **Project URL** dan **anon public key** dari Langkah 4:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

3. Simpan file tersebut (`Ctrl + S`).

---

### Langkah 6: Menjalankan Aplikasi

1. Di terminal folder proyek, jalankan perintah:

```bash
npm run dev
```

2. Tunggu beberapa detik hingga muncul tulisan **`Ready`** dan alamat **`http://localhost:3000`**.
3. Buka browser Anda dan kunjungi `http://localhost:3000`.
4. Aplikasi siap digunakan! *(Untuk menghentikan aplikasi kapan saja, tekan `Ctrl + C` di terminal.)*

---

### Langkah 7: Menjalankan Unit Testing (Verifikasi Kode)

Untuk memverifikasi bahwa seluruh logika bisnis, validasi input, dan kalkulasi biaya berjalan sesuai spesifikasi, jalankan perintah berikut di terminal:

```bash
npm run test
```

Vitest akan mengeksekusi 3 file pengujian (`auth.service.test.ts`, `garage.service.test.ts`, dan `rental.service.test.ts`) dengan hasil **38/38 test cases PASS**.

---

## Akun Admin Default & Panduan Uji Cepat

### Akun Admin Default
- **Email:** `admin@garasi.com`
- **Password:** `admin123`

### Alur Uji Coba Singkat
1. **Login sebagai Admin** (`admin@garasi.com` / `admin123`) -> masuk ke tab **Buat Garasi (Bulk)** untuk menambahkan beberapa unit garasi (`S`, `C`, dan `E`).
2. **Logout**, lalu buka halaman **Daftar Penyewa** (`/register`) -> buat akun penyewa baru menggunakan email `@gmail.com`. Status akun otomatis `pending`.
3. **Login kembali sebagai Admin** -> buka tab **Verifikasi Pendaftar** -> klik **Terima (Approve)** pada akun penyewa tersebut.
4. **Login sebagai Penyewa** -> pilih jenis kendaraan, pilih garasi tersedia, atur durasi (Harian/Bulanan), upload gambar bukti pembayaran (< 5 MB), lalu klik **Bayar & Sewa Garasi Sekarang**.
5. **Login sebagai Admin** -> cek tab **Perpanjang Sewa** untuk memperpanjang transaksi aktif, dan tab **Laporan Sewa** untuk menguji 4 filter laporan serta melihat bukti bayar.

---

## Troubleshooting Umum

- **Error koneksi database / `Invalid API key`:** Pastikan file `.env.local` berada di folder root (sejajar `package.json`), tidak ada spasi berlebih, lalu hentikan server (`Ctrl + C`) dan jalankan ulang `npm run dev`.
- **Tabel tidak ditemukan (`relation does not exist`):** Pastikan Anda sudah menjalankan seluruh isi `supabase/schema.sql` di **SQL Editor** Supabase pada Langkah 3.
- **Port 3000 sudah dipakai aplikasi lain:** Next.js akan otomatis memindahkan aplikasi ke port berikutnya (misalnya `http://localhost:3001`)—perhatikan alamat URL yang muncul di terminal.
