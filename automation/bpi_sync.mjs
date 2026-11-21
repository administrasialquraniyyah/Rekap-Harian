/**
 * ==============================================================================
 * BPI MAJA CLOUD WORKER - SISTEM REKAP HARIAN AL-QUR'ANIYYAH
 * ==============================================================================
 * Deskripsi:
 * Mengambil mutasi transaksi pembayaran siswa dari portal BPI Maja (https://bpi.maja.id/payment),
 * memvalidasi identitas siswa, mencegah transaksi ganda (idempotency), dan melakukan
 * sinkronisasi langsung ke database Supabase (tabel payments, payment_allocations, bills, audit_logs).
 * 
 * Penggunaan:
 *   node automation/bpi_sync.mjs
 * 
 * Environment Variables (di GitHub Actions / .env):
 *   SUPABASE_URL               : URL Supabase Project
 *   SUPABASE_SERVICE_ROLE_KEY  : Service Role Key Supabase (Bypass RLS)
 *   BPI_URL                    : URL Portal BPI (Default: https://bpi.maja.id/payment)
 *   BPI_USERNAME               : Username / Akun BPI Institusi
 *   BPI_PASSWORD               : Password BPI Institusi
 *   HEADLESS                   : 'true' (default) atau 'false' (untuk debugging visual)
 *   SYNC_DATE                  : YYYY-MM-DD (Opsional, default: tanggal hari ini WIB)
 * ==============================================================================
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// 1. Inisialisasi Supabase Client
const DEFAULT_FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyeWVvc3hmcGVlZWVleXpvbnNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMTMyODYsImV4cCI6MjEwNzY4OTI4Nn0.tp1HgSpFp6Poj7zd65kA_0cPz3avtoqt8kPSmdFAduY';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iryeosxfpeeeeeyzonsa.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_FALLBACK_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY atau SUPABASE_KEY tidak ditemukan!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { enabled: false }
});

// Daftar bulan SPP standar
const SPP_MONTHS = [
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'
];

/**
 * Normalisasi nama siswa untuk pencocokan toleran
 */
export function normalizeName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/['’`.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parsing angka nominal dari format teks (Rp 1.335.000 -> 1335000)
 */
export function parseCurrency(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  let s = String(val).trim().replace(/Rp/gi, '').replace(/\s+/g, '');
  if (s.includes('.') && s.includes(',')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes('.')) {
    const parts = s.split('.');
    if (parts.length > 2 || (parts[1] && parts[1].length === 3)) s = s.replace(/\./g, '');
  } else if (s.includes(',')) {
    const parts = s.split(',');
    if (parts.length > 2 || (parts[1] && parts[1].length === 3)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  }
  s = s.replace(/[^\d.-]/g, '');
  const parsed = parseFloat(s);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Deteksi bulan SPP dari uraian / keterangan pembayaran
 */
export function detectSppMonth(text) {
  if (!text) return null;
  const lower = String(text).toLowerCase();
  for (const m of SPP_MONTHS) {
    if (lower.includes(m.toLowerCase())) return m;
  }
  return null;
}

/**
 * Mendapatkan tanggal hari ini dalam zona waktu Asia/Jakarta (WIB)
 */
export function getTodayWIB() {
  const now = new Date();
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now);
  return d; // Format: YYYY-MM-DD
}

/**
 * Scraper Playwright: Mengambil data transaksi dari portal BPI Maja
 */
export async function scrapeBpiTransactions(options = {}) {
  const bpiUrl = process.env.BPI_URL || 'https://bpi.maja.id/payment';
  const username = process.env.BPI_USERNAME;
  const password = process.env.BPI_PASSWORD;
  const isHeadless = (process.env.HEADLESS || 'true').toLowerCase() === 'true';

  console.log(`\n🌐 Membuka browser Playwright (${isHeadless ? 'Headless' : 'Headed'})...`);

  // Jika kredensial BPI belum diset dan ada mock data untuk testing
  if (!username || !password) {
    if (options.mockTransactions) {
      console.log('ℹ️ Kredensial BPI tidak diset, menggunakan mock data yang disediakan untuk pengujian.');
      return options.mockTransactions;
    }
    console.warn('⚠️ Peringatan: BPI_USERNAME atau BPI_PASSWORD belum diset.');
    console.warn('   Pastikan kredensial BPI telah dikonfigurasi di GitHub Secrets / .env.');
    return [];
  }

  const browser = await chromium.launch({
    headless: isHeadless,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  const transactions = [];

  try {
    console.log(`📍 Mengakses: ${bpiUrl}`);
    await page.goto(bpiUrl, { waitUntil: 'networkidle', timeout: 45000 });

    // 1. Cek apakah diarahkan ke halaman login
    const currentUrl = page.url();
    console.log(`🔗 URL saat ini: ${currentUrl}`);

    const hasLoginForm = await page.$('input[type="password"]');
    if (hasLoginForm) {
      console.log('🔑 Terdeteksi form login BPI Maja. Memasukkan kredensial...');
      
      // Mengisi form login (selector fleksibel untuk Angular Maja X)
      const usernameInput = await page.$('input[type="text"], input[type="email"], input[name="username"], input[name="email"], input[formcontrolname="username"]');
      const passwordInput = await page.$('input[type="password"]');

      if (usernameInput && passwordInput) {
        await usernameInput.fill(username);
        await passwordInput.fill(password);

        // Cari tombol submit
        const submitBtn = await page.$('button[type="submit"], button:has-text("Login"), button:has-text("Masuk")');
        if (submitBtn) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
            submitBtn.click()
          ]);
          console.log('✅ Berhasil mengirim form login.');
        }
      }
    }

    // 2. Navigasi / Tunggu tabel pembayaran render
    console.log('⏳ Menunggu data transaksi termuat...');
    await page.waitForTimeout(3000);

    // Ambil baris tabel mutasi transaksi
    const rows = await page.$$('table tbody tr');
    console.log(`📊 Ditemukan ${rows.length} baris di tabel pembayaran.`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cols = await row.$$eval('td', tds => tds.map(td => td.innerText.trim()));
      
      if (cols.length >= 4) {
        // Asumsi format kolom umum portal BPI (No Ref / Waktu / Identitas / Nominal / Status)
        const refNumber = cols[0] || `BPI-ROW-${i + 1}`;
        const rawDate = cols[1] || getTodayWIB();
        const rawStudent = cols[2] || '';
        const rawAmount = cols[3] || '0';
        const rawNotes = cols[4] || 'Pembayaran BPI Maja';

        transactions.push({
          bpiRef: refNumber,
          paymentDate: rawDate,
          studentIdentifier: rawStudent,
          amount: parseCurrency(rawAmount),
          notes: rawNotes,
          rawCols: cols
        });
      }
    }

  } catch (err) {
    console.error('❌ Terjadi kesalahan saat scraping Playwright:', err.message);
  } finally {
    await browser.close();
    console.log('🔒 Browser ditutup.');
  }

  return transactions;
}

/**
 * Sinkronisasi Transaksi BPI ke Database Supabase
 */
export async function syncBpiToSupabase(transactions) {
  console.log(`\n🔄 Memulai proses sinkronisasi ${transactions.length} transaksi ke Supabase...`);

  // 1. Ambil Tahun Ajaran Aktif
  const { data: activeYear, error: ayErr } = await supabase
    .from('academic_years')
    .select('id, name')
    .eq('status', 'active')
    .limit(1)
    .single();

  if (ayErr || !activeYear) {
    throw new Error('Tidak ditemukan tahun ajaran aktif di database!');
  }
  console.log(`📅 Tahun Ajaran Aktif: ${activeYear.name} (ID: ${activeYear.id})`);

  // 2. Ambil Kategori SPP
  let sppCatId;
  const { data: sppCats } = await supabase
    .from('billing_categories')
    .select('id, name')
    .ilike('name', '%spp%')
    .limit(1);

  if (sppCats && sppCats.length > 0) {
    sppCatId = sppCats[0].id;
  } else {
    const { data: newCat } = await supabase
      .from('billing_categories')
      .insert([{ name: 'SPP', category_type: 'monthly', is_active: true }])
      .select()
      .single();
    sppCatId = newCat.id;
  }

  // 3. Cache Data Siswa
  const { data: allStudents, error: stdErr } = await supabase
    .from('students')
    .select(`
      id, nis, full_name,
      student_enrollments (unit, grade, academic_year_id)
    `);

  if (stdErr) throw stdErr;
  console.log(`👥 Total siswa di database: ${allStudents?.length || 0}`);

  // Buat index pencarian siswa
  const nisIndex = new Map();
  const nameIndex = new Map();

  allStudents.forEach(s => {
    if (s.nis) nisIndex.set(String(s.nis).trim(), s);
    nameIndex.set(normalizeName(s.full_name), s);
  });

  // Statistik Sinkronisasi
  let totalProcessed = 0;
  let totalSuccess = 0;
  let totalSkipped = 0;
  let totalUnmatched = 0;
  let totalErrors = 0;
  const syncDetails = [];

  for (const trx of transactions) {
    totalProcessed++;
    const bpiTrxNumber = `BPI-${trx.bpiRef.trim()}`;

    // A. Pencegahan Transaksi Ganda (Idempotency Check)
    const { data: existingPmt } = await supabase
      .from('payments')
      .select('id, transaction_number')
      .eq('transaction_number', bpiTrxNumber)
      .maybeSingle();

    if (existingPmt) {
      console.log(`⏭️ [SKIP] Transaksi duplikat: ${bpiTrxNumber} sudah tercatat.`);
      totalSkipped++;
      syncDetails.push({ trx: bpiTrxNumber, status: 'SKIPPED', reason: 'Duplikat transaksi' });
      continue;
    }

    // B. Pencocokan Identitas Siswa Bertingkat
    let matchedStudent = null;

    // Tingkat 1: Cek NIS jika tertera di identifier
    if (trx.nis) {
      matchedStudent = nisIndex.get(String(trx.nis).trim());
    }

    // Tingkat 2: Cek Nama Siswa (Toleransi format nama)
    if (!matchedStudent && trx.studentIdentifier) {
      const cleanIdent = normalizeName(trx.studentIdentifier);
      matchedStudent = nameIndex.get(cleanIdent);

      // Jika belum ketemu, coba pencocokan parsial
      if (!matchedStudent) {
        for (const [normName, studentObj] of nameIndex.entries()) {
          if (normName.includes(cleanIdent) || cleanIdent.includes(normName)) {
            matchedStudent = studentObj;
            break;
          }
        }
      }
    }

    if (!matchedStudent) {
      console.warn(`⚠️ [UNMATCHED] Siswa tidak ditemukan untuk BPI Ref: ${trx.bpiRef} (${trx.studentIdentifier})`);
      totalUnmatched++;
      syncDetails.push({ trx: bpiTrxNumber, status: 'UNMATCHED', identifier: trx.studentIdentifier });
      continue;
    }

    // C. Proses Input Pembayaran & Alokasi Tagihan
    try {
      const paymentDate = trx.paymentDate || getTodayWIB();
      const detectedMonth = detectSppMonth(trx.notes) || detectSppMonth(trx.bpiRef);

      // Cari atau buat tagihan (bill) yang sesuai
      let targetBillId;
      let billAmount = trx.amount;

      if (detectedMonth) {
        // Khusus SPP
        const { data: existingBill } = await supabase
          .from('bills')
          .select('id, amount, status')
          .eq('student_id', matchedStudent.id)
          .eq('academic_year_id', activeYear.id)
          .eq('category_id', sppCatId)
          .eq('billing_period', detectedMonth)
          .maybeSingle();

        if (existingBill) {
          targetBillId = existingBill.id;
          billAmount = Number(existingBill.amount);
        } else {
          const { data: newBill, error: bErr } = await supabase
            .from('bills')
            .insert([{
              student_id: matchedStudent.id,
              academic_year_id: activeYear.id,
              category_id: sppCatId,
              billing_period: detectedMonth,
              amount: trx.amount || 1335000,
              status: 'Belum Dibayar',
              description: `SPP Bulan ${detectedMonth}`
            }])
            .select()
            .single();

          if (bErr) throw bErr;
          targetBillId = newBill.id;
        }
      } else {
        // Tagihan Lainnya / Non-SPP
        const { data: existingBill } = await supabase
          .from('bills')
          .select('id, amount')
          .eq('student_id', matchedStudent.id)
          .eq('academic_year_id', activeYear.id)
          .eq('status', 'Belum Dibayar')
          .limit(1)
          .maybeSingle();

        if (existingBill) {
          targetBillId = existingBill.id;
          billAmount = Number(existingBill.amount);
        } else {
          // Buat bill baru
          const { data: newBill } = await supabase
            .from('bills')
            .insert([{
              student_id: matchedStudent.id,
              academic_year_id: activeYear.id,
              category_id: sppCatId,
              billing_period: null,
              amount: trx.amount,
              status: 'Belum Dibayar',
              description: trx.notes || 'Pembayaran via BPI Maja'
            }])
            .select()
            .single();

          targetBillId = newBill.id;
        }
      }

      // Insert ke tabel payments
      const { data: payment, error: pErr } = await supabase
        .from('payments')
        .insert([{
          transaction_number: bpiTrxNumber,
          student_id: matchedStudent.id,
          payment_date: paymentDate,
          amount: trx.amount,
          payment_method: 'BPI Maja',
          notes: `[Auto-Sync BPI Maja] ${trx.notes || ''}`.trim(),
          created_by: 'Cloud Worker BPI',
          status: 'valid'
        }])
        .select()
        .single();

      if (pErr) throw pErr;

      // Insert alokasi ke tabel payment_allocations
      const { error: paErr } = await supabase
        .from('payment_allocations')
        .insert([{
          payment_id: payment.id,
          bill_id: targetBillId,
          allocated_amount: trx.amount
        }]);

      if (paErr) throw paErr;

      // Perbarui status bill
      const finalStatus = trx.amount >= billAmount ? 'Lunas' : 'Belum Lunas';
      await supabase
        .from('bills')
        .update({ status: finalStatus, updated_at: new Date().toISOString() })
        .eq('id', targetBillId);

      console.log(`✅ [BERHASIL] ${bpiTrxNumber} -> Siswa: ${matchedStudent.full_name} (Rp${trx.amount.toLocaleString('id-ID')})`);
      totalSuccess++;
      syncDetails.push({ trx: bpiTrxNumber, status: 'SUCCESS', student: matchedStudent.full_name, amount: trx.amount });

    } catch (err) {
      console.error(`❌ [ERROR] Gagal memproses transaksi ${bpiTrxNumber}:`, err.message);
      totalErrors++;
      syncDetails.push({ trx: bpiTrxNumber, status: 'ERROR', error: err.message });
    }
  }

  // D. Catat Ringkasan ke Audit Log Supabase
  try {
    await supabase.from('audit_logs').insert([{
      user_id: 'bpi-cloud-worker',
      action: 'IMPORT',
      entity_type: 'BPI_MAJA_SYNC',
      entity_id: `SYNC-${Date.now()}`,
      new_data: {
        total_processed: totalProcessed,
        total_success: totalSuccess,
        total_skipped: totalSkipped,
        total_unmatched: totalUnmatched,
        total_errors: totalErrors,
        sync_date: getTodayWIB(),
        details: syncDetails
      }
    }]);
    console.log('📝 Ringkasan sinkronisasi berhasil dicatat di audit_logs Supabase.');
  } catch (logErr) {
    console.warn('⚠️ Gagal mencatat ke audit_logs:', logErr.message);
  }

  console.log('\n========================================================');
  console.log('📊 REKAPITULASI SINKRONISASI BPI MAJA:');
  console.log(`   • Total Diproses : ${totalProcessed}`);
  console.log(`   • Berhasil Masuk : ${totalSuccess}`);
  console.log(`   • Dilewati (Duplikat) : ${totalSkipped}`);
  console.log(`   • Siswa Tak Cocok: ${totalUnmatched}`);
  console.log(`   • Gagal/Error    : ${totalErrors}`);
  console.log('========================================================\n');

  return { totalProcessed, totalSuccess, totalSkipped, totalUnmatched, totalErrors };
}

// 4. Main Function Execution
async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   BPI MAJA TO SUPABASE CLOUD WORKER                ║');
  console.log('║   Yayasan Pendidikan Islam Al-Qur\'aniyyah          ║');
  console.log('╚════════════════════════════════════════════════════╝');

  try {
    const transactions = await scrapeBpiTransactions();
    if (transactions.length === 0) {
      console.log('ℹ️ Tidak ada transaksi baru yang ditemukan atau kredensial BPI belum diset.');
      process.exit(0);
    }

    await syncBpiToSupabase(transactions);
    console.log('🎉 Sinkronisasi BPI Maja selesai dengan sukses!');
    process.exit(0);
  } catch (err) {
    console.error('💥 Fatal Error pada sinkronisasi BPI:', err);
    process.exit(1);
  }
}

// Jalankan jika dieksekusi langsung
if (process.argv[1]?.endsWith('bpi_sync.mjs')) {
  main();
}
