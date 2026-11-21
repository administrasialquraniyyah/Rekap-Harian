/**
 * ==============================================================================
 * BPI MOCK PIPELINE TESTER
 * ==============================================================================
 * Skrip untuk menguji logika matching siswa, pencegahan duplikat, dan
 * sinkronisasi Supabase tanpa harus login langsung ke live BPI Maja.
 * ==============================================================================
 */

import { syncBpiToSupabase } from './bpi_sync.mjs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const DEFAULT_FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyeWVvc3hmcGVlZWVleXpvbnNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMTMyODYsImV4cCI6MjEwNzY4OTI4Nn0.tp1HgSpFp6Poj7zd65kA_0cPz3avtoqt8kPSmdFAduY';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iryeosxfpeeeeeyzonsa.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_FALLBACK_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { enabled: false }
});

async function runTest() {
  console.log('🧪 Memulai pengujian simulasi alur BPI Maja...\n');

  // Ambil 1 sampel siswa dari database
  const { data: students } = await supabase.from('students').select('id, full_name, nis').limit(2);
  if (!students || students.length === 0) {
    console.error('❌ Tidak ada siswa di database untuk pengujian.');
    return;
  }

  const sampleStudent = students[0];
  console.log(`👤 Siswa Sampel Pengujian: ${sampleStudent.full_name} (NIS: ${sampleStudent.nis || '-'})`);

  const testRef = `TEST-${Date.now().toString().slice(-6)}`;

  // Simulasi 3 transaksi:
  // 1. Transaksi valid siswa ada
  // 2. Transaksi duplikat (menggunakan testRef yang sama untuk menguji pencegahan duplikat)
  // 3. Transaksi dengan nama siswa tidak dikenal (menguji penanganan unmatched)
  const mockPayload = [
    {
      bpiRef: testRef,
      paymentDate: new Date().toISOString().split('T')[0],
      studentIdentifier: sampleStudent.full_name,
      nis: sampleStudent.nis,
      amount: 1335000,
      notes: 'SPP Bulan Oktober (Simulasi BPI Maja)'
    },
    {
      bpiRef: testRef, // Sengaja sama untuk menguji skip idempotency
      paymentDate: new Date().toISOString().split('T')[0],
      studentIdentifier: sampleStudent.full_name,
      amount: 1335000,
      notes: 'SPP Bulan Oktober (Simulasi Duplikat)'
    },
    {
      bpiRef: `UNMATCH-${Date.now().toString().slice(-4)}`,
      paymentDate: new Date().toISOString().split('T')[0],
      studentIdentifier: 'Nama Siswa Fiktif Tidak Terdaftar 999',
      amount: 500000,
      notes: 'Pembayaran Siswa Fiktif'
    }
  ];

  console.log(`\n📦 Menjalankan sinkronisasi dengan ${mockPayload.length} transaksi simulasi...`);
  const result = await syncBpiToSupabase(mockPayload);

  console.log('\n🔍 Hasil Pengujian Alur:');
  console.log(`   - Transaksi Berhasil Masuk : ${result.totalSuccess} (Diharapkan: 1)`);
  console.log(`   - Transaksi Dilewati (Duplikat) : ${result.totalSkipped} (Diharapkan: 1)`);
  console.log(`   - Transaksi Siswa Tak Cocok: ${result.totalUnmatched} (Diharapkan: 1)`);

  if (result.totalSuccess === 1 && result.totalSkipped === 1 && result.totalUnmatched === 1) {
    console.log('\n🎉 SEMUA LOGIKA INTEGRASI BPI BERHASIL 100%! Logika Idempotensi & Validasi Siswa Bekerja Sempurna.');
  } else {
    console.warn('\n⚠️ Perhatian: Hasil berbeda dari ekspektasi.');
  }

  // Bersihkan data transaksi uji coba agar tabel produksi tetap bersih
  console.log('\n🧹 Membersihkan data transaksi uji coba dari tabel payments...');
  const { data: cleaned } = await supabase.from('payments').delete().like('transaction_number', 'BPI-TEST-%').select();
  console.log(`✨ Selesai. ${cleaned?.length || 0} data pengujian telah dibersihkan.`);
}

runTest().catch(console.error);
