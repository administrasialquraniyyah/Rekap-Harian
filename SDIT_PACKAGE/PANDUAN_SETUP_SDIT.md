# 📖 PANDUAN LENGKAP PEMBUATAN APLIKASI KEUANGAN SD IT AL-QUR'ANIYYAH

Dokumen ini berisi panduan langkah demi langkah untuk membuat aplikasi baru khusus **SD IT Al-Qur'aniyyah** dengan **Database Supabase Terpisah**, namun **tetap dapat saling terhubung** dengan database SMP/SMA IT jika sewaktu-waktu dibutuhkan.

---

## 📁 Berkas yang Telah Disiapkan:

Semua berkas setup sudah tersedia lengkap di dalam folder `SDIT_PACKAGE/`:

1. **`01_SCHEMA_SUPABASE_SDIT.sql`**  
   *Skrip SQL Master lengkap untuk membuat seluruh tabel, indeks performa, data awal tahun ajaran, kategori tagihan, views, dan izin akses (RLS) di database Supabase baru.*
2. **`database_sdit.ts`**  
   *Definisi tipe data TypeScript yang sudah disesuaikan khusus SD IT (Unit: `SD IT`, Kelas: `I`, `II`, `III`, `IV`, `V`, `VI`).*
3. **`supabase_multiclient.ts`**  
   *Contoh modul koneksi dua database sekaligus (Dual Supabase Client) untuk menghubungkan SD IT dengan database SMP/SMA IT.*
4. **`.env.example`**  
   *Contoh konfigurasi kredensial environment variable untuk aplikasi baru.*

---

## 🚀 Langkah 1: Buat Proyek Supabase Baru (Gratis)

1. Buka [https://supabase.com](https://supabase.com) dan login dengan akun Anda.
2. Di Dashboard, klik tombol **"New project"**.
3. Isi data proyek baru:
   - **Name**: `SDIT Al-Qur'aniyyah` (atau sesuai keinginan Anda).
   - **Database Password**: Buat password yang kuat dan simpan baik-baik.
   - **Region**: Pilih `Singapore (ap-southeast-1)` (paling cepat untuk Indonesia).
   - **Pricing Plan**: Pilih `Free` (Gratis).
4. Klik **"Create new project"** dan tunggu sekitar 1–2 menit hingga database selesai dibuat.

---

## ⚡ Langkah 2: Jalankan Skrip Skema Database Otomatis

1. Di dashboard proyek Supabase SD IT baru Anda, klik menu **"SQL Editor"** di bilah menu sebelah kiri (ikon terminal `>_`).
2. Klik tombol **"+ New query"**.
3. Buka file **`01_SCHEMA_SUPABASE_SDIT.sql`** yang ada di folder ini.
4. Salin seluruh isinya (*Ctrl+A*, lalu *Ctrl+C*), lalu paste ke dalam SQL Editor Supabase.
5. Klik tombol hijau **"Run"** (atau tekan *Ctrl+Enter*).
6. **Selesai!** Dalam hitungan detik, seluruh struktur database SD IT langsung siap:
   - ✅ Tabel `students` (Siswa SD IT)
   - ✅ Tabel `student_enrollments` (Kelas I s.d. VI)
   - ✅ Tabel `academic_years` (Otomatis terisi 2024/2025, 2025/2026, dan 2026/2027 Aktif)
   - ✅ Tabel `billing_categories` (SPP, Perlengkapan, Peralatan, Kegiatan, Pembangunan, Ujian, dll.)
   - ✅ Tabel `bills` (Tagihan)
   - ✅ Tabel `payments` & `payment_allocations` (Riwayat Transaksi & Pembayaran)
   - ✅ Izin Akses Publik RLS & Indeks Performa Cepat

---

## 🔑 Langkah 3: Ambil Kredensial API Supabase Baru

1. Di dashboard Supabase SD IT Anda, klik menu **"Project Settings"** (ikon roda gigi di kiri bawah).
2. Pilih submenu **"API"**.
3. Salin dua data penting ini:
   - **Project URL** (contoh: `https://abcdefghijklm.supabase.co`)
   - **anon / public key** (kunci panjang yang diawali `eyJhbGci...`)

---

## 💻 Langkah 4: Duplikasi Kode Aplikasi untuk SD IT

Untuk membuat aplikasinya, Anda dapat menduplikasi repository aplikasi ini:

### Cara A: Duplikasi ke Folder Baru di Komputer Anda
1. Salin seluruh folder `D:\Aplikasi Rekap Harian` ke folder baru, misalnya `D:\Aplikasi Rekap SDIT`.
2. Di folder baru tersebut, buat file `.env` dan masukkan kredensial Supabase SD IT baru dari Langkah 3:
   ```env
   VITE_SUPABASE_URL=https://proyek-sdit-anda.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...anon-key-sdit-anda
   ```
3. Ganti file `src/types/database.ts` dengan file `SDIT_PACKAGE/database_sdit.ts`.
4. Jalankan aplikasi di terminal:
   ```bash
   npm install
   npm run dev
   ```

### Cara B: Deploy ke Vercel (Alamat Baru, misal `rekap-sdit.vercel.app`)
1. Buat repository baru di GitHub (misal: `administrasialquraniyyah/Rekap-SDIT`).
2. Hubungkan repository tersebut ke Vercel.
3. Di menu **Environment Variables** Vercel, tambahkan:
   - `VITE_SUPABASE_URL` = URL Supabase SD IT
   - `VITE_SUPABASE_ANON_KEY` = Anon Key Supabase SD IT
4. Vercel akan otomatis men-deploy aplikasi SD IT ke alamat web baru yang mandiri.

---

## 🔗 Langkah 5: Menghubungkan SD IT dengan Database SMP/SMA (Opsional)

Jika suatu saat Yayasan ingin:
- **Melihat Laporan Gabungan**: Mengetahui total uang masuk seluruh unit (SD IT + SMP IT + SMA IT).
- **Mutasi Santri Lulusan**: Menarik data santri kelas VI yang lulus untuk langsung didaftarkan ke kelas VII SMP IT Al-Qur'aniyyah.

Anda cukup menggunakan berkas **`SDIT_PACKAGE/supabase_multiclient.ts`**. Dengan berkas ini, aplikasi dapat membaca data dari kedua database secara bersamaan tanpa mencampuradukkan tabel harian masing-masing unit.

---
*Dipersiapkan khusus untuk Yayasan Al-Qur'aniyyah (SD IT, SMP IT & SMA IT).*
