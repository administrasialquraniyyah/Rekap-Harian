// ==============================================================================
// KONFIGURASI SUPABASE MULTI-CLIENT (SD IT & SMP/SMA IT)
// ==============================================================================
// File ini digunakan jika Anda ingin aplikasi dapat terhubung ke:
// 1. Database SD IT (Database Utama untuk operasional SD IT)
// 2. Database SMP/SMA IT (Database Sekunder untuk membaca data kelulusan / rekap yayasan)
// ==============================================================================

import { createClient } from '@supabase/supabase-js';

// ------------------------------------------------------------------------------
// 1. KONEKSI UTAMA: SD IT AL-QUR'ANIYYAH
// ------------------------------------------------------------------------------
const SDIT_SUPABASE_URL = import.meta.env.VITE_SDIT_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '';
const SDIT_SUPABASE_ANON_KEY = import.meta.env.VITE_SDIT_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabaseSDIT = createClient(SDIT_SUPABASE_URL, SDIT_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Alias default untuk kemudahan pemanggilan
export const supabase = supabaseSDIT;
export const isSupabaseConfigured = Boolean(SDIT_SUPABASE_URL && SDIT_SUPABASE_ANON_KEY);

// ------------------------------------------------------------------------------
// 2. KONEKSI SEKUNDER: SMP IT & SMA IT (Dihubungkan jika diperlukan)
// ------------------------------------------------------------------------------
const SMP_SUPABASE_URL = import.meta.env.VITE_SMP_SUPABASE_URL || 'https://iryeosxfpeeeeeyzonsa.supabase.co';
const SMP_SUPABASE_ANON_KEY = import.meta.env.VITE_SMP_SUPABASE_ANON_KEY || '';

export const supabaseSMP = Boolean(SMP_SUPABASE_URL && SMP_SUPABASE_ANON_KEY)
  ? createClient(SMP_SUPABASE_URL, SMP_SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
      },
    })
  : null;

/**
 * Contoh Helper: Menarik data siswa lulusan SD IT yang melanjutkan ke SMP IT
 */
export async function getGraduatedSDITStudents() {
  const { data, error } = await supabaseSDIT
    .from('students')
    .select(`
      id,
      nis,
      full_name,
      gender,
      phone,
      student_enrollments(grade, unit)
    `)
    .eq('student_status', 'lulus');

  if (error) throw error;
  return data || [];
}

/**
 * Contoh Helper: Menghitung total penerimaan gabungan seluruh Yayasan (SD IT + SMP IT + SMA IT)
 */
export async function getCombinedTotalIncome(academicYearName: string) {
  let sditTotal = 0;
  let smpTotal = 0;

  // 1. Ambil total SD IT
  const { data: sditPmts } = await supabaseSDIT
    .from('payments')
    .select('amount, status')
    .eq('status', 'valid');

  if (sditPmts) {
    sditTotal = sditPmts.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }

  // 2. Ambil total SMP/SMA IT (jika terkoneksi)
  if (supabaseSMP) {
    const { data: smpPmts } = await supabaseSMP
      .from('payments')
      .select('amount, status')
      .eq('status', 'valid');

    if (smpPmts) {
      smpTotal = smpPmts.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    }
  }

  return {
    sdit_total: sditTotal,
    smp_sma_total: smpTotal,
    grand_total_yayasan: sditTotal + smpTotal,
  };
}
