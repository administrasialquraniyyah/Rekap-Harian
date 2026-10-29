import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

// URL & Key Database TK & SD IT
const SDIT_URL = import.meta.env.VITE_SDIT_SUPABASE_URL || 'https://wuwixtsivlnrjsnsncqf.supabase.co';
const SDIT_KEY = import.meta.env.VITE_SDIT_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1d2l4dHNpdmxucmpzbnNuY3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMzA5MzUsImV4cCI6MjEwODgwNjkzNX0.RxJsFkAxaw5sniMflpaUkIfNQlugg2mfZabEiQM6QLs';

export const isCrossDbConfigured = Boolean(SDIT_URL && SDIT_KEY);

export const supabaseSDIT = isCrossDbConfigured
  ? createClient(SDIT_URL, SDIT_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export const SDIT_PORTAL_URL = import.meta.env.VITE_SDIT_PORTAL_URL || 'https://rekap-sdit.vercel.app';

export interface SDITGraduateStudent {
  id: string;
  nis: string | null;
  full_name: string;
  gender: string;
  phone: string | null;
  student_status: string;
  unit: string;
  grade: string;
  academic_year_name?: string;
}

/**
 * Mengambil daftar santri/siswa SD IT (Kelas VI atau status lulus) dari database SD IT
 */
export async function fetchSDITGraduates(): Promise<SDITGraduateStudent[]> {
  if (!supabaseSDIT) return [];

  const { data, error } = await supabaseSDIT
    .from('students')
    .select(`
      id,
      nis,
      full_name,
      gender,
      phone,
      student_status,
      student_enrollments(unit, grade, academic_years(name))
    `)
    .order('full_name');

  if (error) {
    console.error('Error fetching SDIT graduates:', error);
    return [];
  }

  const results: SDITGraduateStudent[] = [];
  (data || []).forEach((s: any) => {
    const enr = Array.isArray(s.student_enrollments) ? s.student_enrollments[0] : s.student_enrollments;
    const grade = enr?.grade || '-';
    const unit = enr?.unit || 'SD IT';
    const yearName = enr?.academic_years?.name;

    // Masukkan siswa SD IT kelas VI atau yang berstatus lulus
    if (grade === 'VI' || s.student_status === 'lulus' || unit === 'SD IT') {
      results.push({
        id: s.id,
        nis: s.nis,
        full_name: s.full_name,
        gender: s.gender,
        phone: s.phone,
        student_status: s.student_status,
        unit,
        grade,
        academic_year_name: yearName,
      });
    }
  });

  return results;
}

/**
 * Menyalin data santri pilihan dari database SD IT ke database SMP IT (Kelas VII)
 */
export async function copySDITStudentsToSMP(
  selectedStudents: SDITGraduateStudent[],
  targetAcademicYearId: string
): Promise<{ successCount: number; errors: string[] }> {
  let successCount = 0;
  const errors: string[] = [];

  for (const s of selectedStudents) {
    try {
      // 1. Cek apakah siswa dengan NIS atau Nama yang sama sudah ada di database SMP
      let existingId: string | null = null;
      if (s.nis) {
        const { data: exNis } = await supabase
          .from('students')
          .select('id')
          .eq('nis', s.nis)
          .maybeSingle();
        if (exNis) existingId = exNis.id;
      }

      if (!existingId) {
        const { data: exName } = await supabase
          .from('students')
          .select('id')
          .ilike('full_name', s.full_name.trim())
          .maybeSingle();
        if (exName) existingId = exName.id;
      }

      let studentId = existingId;

      // 2. Jika belum ada, insert siswa baru ke master siswa SMP
      if (!studentId) {
        const { data: newStd, error: insertStdErr } = await supabase
          .from('students')
          .insert({
            nis: s.nis || null,
            full_name: s.full_name.trim(),
            gender: s.gender || 'Laki-laki',
            phone: s.phone || null,
            student_status: 'aktif',
            notes: 'Alumni lulusan SD IT Al-Qur\'aniyyah',
          })
          .select('id')
          .single();

        if (insertStdErr) {
          errors.push(`Gagal membuat data master untuk ${s.full_name}: ${insertStdErr.message}`);
          continue;
        }
        studentId = newStd.id;
      }

      // 3. Masukkan enrollment ke Kelas VII SMP IT pada tahun ajaran aktif
      const { data: exEnr } = await supabase
        .from('student_enrollments')
        .select('id')
        .eq('student_id', studentId)
        .eq('academic_year_id', targetAcademicYearId)
        .maybeSingle();

      if (!exEnr) {
        const { error: insertEnrErr } = await supabase
          .from('student_enrollments')
          .insert({
            student_id: studentId,
            academic_year_id: targetAcademicYearId,
            unit: 'SMP IT',
            grade: 'VII',
            administrative_status: 'Mampu',
            notes: 'Pendaftaran otomatis dari alumni SD IT',
          });

        if (insertEnrErr) {
          errors.push(`Gagal menempatkan ${s.full_name} di Kelas VII: ${insertEnrErr.message}`);
          continue;
        }
      }

      successCount++;
    } catch (e: any) {
      errors.push(`Error memproses ${s.full_name}: ${e?.message || e}`);
    }
  }

  return { successCount, errors };
}

export interface FoundationUnitFinancialSummary {
  unit: 'TK IT' | 'SD IT' | 'SMP IT' | 'SMA IT';
  totalStudents: number;
  totalBills: number;
  totalPaid: number;
  totalArrears: number;
  collectionRate: number;
}

/**
 * Menghitung rekapitulasi gabungan seluruh Yayasan (TK, SD, SMP, SMA)
 */
export async function getFoundationConsolidatedSummary(): Promise<{
  units: FoundationUnitFinancialSummary[];
  grandTotal: {
    students: number;
    bills: number;
    paid: number;
    arrears: number;
    collectionRate: number;
  };
}> {
  const unitsMap: Record<string, FoundationUnitFinancialSummary> = {
    'TK IT': { unit: 'TK IT', totalStudents: 0, totalBills: 0, totalPaid: 0, totalArrears: 0, collectionRate: 0 },
    'SD IT': { unit: 'SD IT', totalStudents: 0, totalBills: 0, totalPaid: 0, totalArrears: 0, collectionRate: 0 },
    'SMP IT': { unit: 'SMP IT', totalStudents: 0, totalBills: 0, totalPaid: 0, totalArrears: 0, collectionRate: 0 },
    'SMA IT': { unit: 'SMA IT', totalStudents: 0, totalBills: 0, totalPaid: 0, totalArrears: 0, collectionRate: 0 },
  };

  // 1. Ambil data SMP IT & SMA IT dari database utama
  try {
    const { data: enrSMP } = await supabase
      .from('student_enrollments')
      .select('student_id, unit');
    
    (enrSMP || []).forEach((e: any) => {
      const u = e.unit === 'SMA IT' ? 'SMA IT' : 'SMP IT';
      unitsMap[u].totalStudents++;
    });

    const { data: billsSMP } = await supabase
      .from('bills')
      .select('amount, status, student_id, payment_allocations(allocated_amount, payment:payments(status))');

    const smpStudentUnitMap = new Map<string, string>();
    (enrSMP || []).forEach((e: any) => smpStudentUnitMap.set(e.student_id, e.unit));

    (billsSMP || []).forEach((b: any) => {
      const u = smpStudentUnitMap.get(b.student_id) === 'SMA IT' ? 'SMA IT' : 'SMP IT';
      const bAmt = Number(b.amount || 0);
      const paid = (b.payment_allocations || [])
        .filter((a: any) => a.payment?.status === 'valid')
        .reduce((sum: number, a: any) => sum + Number(a.allocated_amount || 0), 0);

      if (b.status !== 'Bebas') {
        unitsMap[u].totalBills += bAmt;
      }
      unitsMap[u].totalPaid += paid;
    });
  } catch (err) {
    console.warn('Error reading SMP/SMA for foundation summary:', err);
  }

  // 2. Ambil data TK IT & SD IT dari database kedua
  if (supabaseSDIT) {
    try {
      const { data: enrSD } = await supabaseSDIT
        .from('student_enrollments')
        .select('student_id, unit');

      (enrSD || []).forEach((e: any) => {
        const u = e.unit === 'TK IT' ? 'TK IT' : 'SD IT';
        unitsMap[u].totalStudents++;
      });

      const { data: billsSD } = await supabaseSDIT
        .from('bills')
        .select('amount, status, student_id, payment_allocations(allocated_amount, payment:payments(status))');

      const sdStudentUnitMap = new Map<string, string>();
      (enrSD || []).forEach((e: any) => sdStudentUnitMap.set(e.student_id, e.unit));

      (billsSD || []).forEach((b: any) => {
        const u = sdStudentUnitMap.get(b.student_id) === 'TK IT' ? 'TK IT' : 'SD IT';
        const bAmt = Number(b.amount || 0);
        const paid = (b.payment_allocations || [])
          .filter((a: any) => a.payment?.status === 'valid')
          .reduce((sum: number, a: any) => sum + Number(a.allocated_amount || 0), 0);

        if (b.status !== 'Bebas') {
          unitsMap[u].totalBills += bAmt;
        }
        unitsMap[u].totalPaid += paid;
      });
    } catch (err) {
      console.warn('Error reading TK/SD for foundation summary:', err);
    }
  }

  // Hitung sisa tunggakan & rate
  const unitsArray = (['TK IT', 'SD IT', 'SMP IT', 'SMA IT'] as const).map((key) => {
    const item = unitsMap[key];
    item.totalArrears = Math.max(0, item.totalBills - item.totalPaid);
    item.collectionRate = item.totalBills > 0 ? (item.totalPaid / item.totalBills) * 100 : 0;
    return item;
  });

  const grandTotal = {
    students: unitsArray.reduce((s, u) => s + u.totalStudents, 0),
    bills: unitsArray.reduce((s, u) => s + u.totalBills, 0),
    paid: unitsArray.reduce((s, u) => s + u.totalPaid, 0),
    arrears: unitsArray.reduce((s, u) => s + u.totalArrears, 0),
    collectionRate: 0,
  };
  grandTotal.collectionRate = grandTotal.bills > 0 ? (grandTotal.paid / grandTotal.bills) * 100 : 0;

  return { units: unitsArray, grandTotal };
}
