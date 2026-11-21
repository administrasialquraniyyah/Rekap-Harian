# Integrasi Cloud BPI Maja — Rekap Harian Al-Qur'aniyyah

Modul otomatisasi ini mengambil data transaksi pembayaran siswa dari portal **BPI Maja** (`https://bpi.maja.id/payment`), memvalidasi identitas siswa, mencegah transaksi ganda (idempotency), dan melakukan sinkronisasi otomatis ke database Supabase.

---

## 🏗️ Arsitektur & Cara Kerja

```
[Portal BPI Maja (https://bpi.maja.id)]
                    │
                    ▼  (Playwright Chromium Headless Scraper)
[GitHub Actions Scheduled Worker @ 08:00 WIB]
                    │
                    ├──> 1. Validasi Identitas Siswa (Tier 1: NIS, Tier 2: Nama Siswa)
                    ├──> 2. Pengecekan Idempotensi (Skip nomor transaksi yang sudah ada di DB)
                    ├──> 3. Alokasi Pembayaran ke Tagihan Siswa (SPP / Non-SPP)
                    └──> 4. Insert ke Supabase (tabel: payments, payment_allocations, bills, audit_logs)
                    │
                    ▼
[Database Supabase] ──> [Aplikasi Web Rekap Harian (Vercel) Otomatis Menampilkan Data Baru]
```

---

## 🔐 Konfigurasi Rahasia (GitHub Repository Secrets)

Untuk mengaktifkan sinkronisasi otomatis di GitHub Actions, buka repository GitHub Anda:
`Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`, lalu tambahkan:

1. **`BPI_USERNAME`**: Username / Email login institusi BPI Maja.
2. **`BPI_PASSWORD`**: Password login institusi BPI Maja.
3. **`SUPABASE_SERVICE_ROLE_KEY`**: Service Role Secret Key dari dashboard Supabase (`Project Settings` -> `API` -> `Project API keys` -> `service_role`).
4. **`SUPABASE_URL`** *(Opsional)*: `https://iryeosxfpeeeeeyzonsa.supabase.co`
5. **`BPI_URL`** *(Opsional)*: `https://bpi.maja.id/payment`

---

## ⏰ Jadwal Eksekusi

* **Otomatis:** Berjalan setiap hari pada pukul **08:00 WIB** (`01:00 UTC`).
* **Manual (On-Demand):** Kapan saja bendahara ingin menarik transaksi terbaru:
  1. Buka tab **Actions** di repository GitHub.
  2. Pilih workflow **Sinkronisasi BPI Maja Otomatis**.
  3. Klik tombol **Run workflow**.

---

## 🧪 Pengujian Logika Sinkronisasi (Mock Test)

Sebelum mengaktifkan di GitHub Actions, Anda dapat menguji seluruh alur logika validasi siswa, pencegahan duplikat, dan mutasi Supabase di terminal:

```bash
node automation/bpi_mock_test.mjs
```

---

## 🛡️ Fitur Keamanan & Integritas Data

1. **Pencegahan Transaksi Ganda (Idempotent):**
   Setiap transaksi BPI diberi prefix `BPI-[NoRef]`. Worker selalu mengecek ke tabel `payments` terlebih dahulu. Jika nomor transaksi sudah terdaftar, data akan **dilewati (skip)** secara otomatis tanpa menambah duplikat.
2. **Matching Siswa Bertingkat:**
   * **Tier 1:** Mencocokkan nomor NIS / nomor siswa.
   * **Tier 2:** Mencocokkan nama lengkap siswa yang dinormalisasi (menghapus spasi ganda, tanda petik, dan huruf kapital).
   * **Tier 3:** Transaksi yang siswanya tidak ditemukan akan dimasukkan ke log `UNMATCHED` di `audit_logs` agar tidak salah sasaran.
3. **Pencatatan Audit:**
   Seluruh aktivitas sinkronisasi dicatat ke tabel `audit_logs` di Supabase untuk transparansi pembukuan keuangan.
