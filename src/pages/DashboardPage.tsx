import React, { useState, useEffect } from 'react';
import {
  Users,
  CreditCard,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Filter,
  ArrowUpRight,
  RefreshCw,
  Wallet,
  Calendar,
  GraduationCap,
  Download,
  Award,
  HeartHandshake
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { SPP_MONTHS } from '../services/billingService';
import { localStore } from '../services/dataStore';
import * as XLSX from 'xlsx';

interface CategorySummary {
  name: string;
  tagihanSMP: number;
  bayarSMP: number;
  sisaSMP: number;
  tagihanSMA: number;
  bayarSMA: number;
  sisaSMA: number;
  tagihanTotal: number;
  bayarTotal: number;
  sisaTotal: number;
}

export interface StudentClassRecap {
  unit: 'SMP IT' | 'SMA IT';
  grade: string;
  lakiLaki: number;
  perempuan: number;
  mampu: number;
  yatim: number;
  lainnya: number;
  total: number;
}

export const DashboardPage: React.FC = () => {
  const { selectedAcademicYearId, selectedAcademicYear, refreshKey } = useApp();

  const [unitFilter, setUnitFilter] = useState<'ALL' | 'SMP IT' | 'SMA IT'>('ALL');
  const [classRecapUnitFilter, setClassRecapUnitFilter] = useState<'ALL' | 'SMP IT' | 'SMA IT'>('ALL');
  const [isLoading, setIsLoading] = useState(true);

  // Stats
  const [activeStudentsCount, setActiveStudentsCount] = useState(0);
  const [totalBills, setTotalBills] = useState(0);
  const [totalPayments, setTotalPayments] = useState(0);
  const [totalArrears, setTotalArrears] = useState(0);
  const [paidStudentsCount, setPaidStudentsCount] = useState(0);
  const [arrearsStudentsCount, setArrearsStudentsCount] = useState(0);

  // Student status & gender breakdown
  const [totalLaki, setTotalLaki] = useState(0);
  const [totalPerempuan, setTotalPerempuan] = useState(0);
  const [totalMampu, setTotalMampu] = useState(0);
  const [totalYatim, setTotalYatim] = useState(0);
  const [totalLainnya, setTotalLainnya] = useState(0);
  const [classRecapList, setClassRecapList] = useState<StudentClassRecap[]>([]);

  // Category breakdown identical to sheet DASHBOARD
  const [categorySummaries, setCategorySummaries] = useState<CategorySummary[]>([]);

  // Monthly SPP performance (Juli - Juni)
  const [monthlySppStats, setMonthlySppStats] = useState<{
    month: string;
    totalTarget: number;
    totalCollected: number;
    totalRemaining: number;
    percentage: number;
  }[]>([]);

  // Recent transactions
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);

  // Top arrears
  const [topArrears, setTopArrears] = useState<any[]>([]);

  const fetchDashboardData = async () => {
    if (!selectedAcademicYearId) return;
    setIsLoading(true);

    try {
      let activeEnr: any[] = [];
      let recentPmts: any[] = [];
      let bills: any[] = [];
      const allocsByBillId = new Map<string, number>();

      if (!isSupabaseConfigured) {
        // Use local store
        const storeStudents = localStore.getStudents();
        const storeEnr = localStore.getEnrollments().filter((e) => e.academic_year_id === selectedAcademicYearId);
        const storeBills = localStore.getBills().filter((b) => b.academic_year_id === selectedAcademicYearId);
        const storeCategories = localStore.getCategories();
        const storePayments = localStore.getPayments();
        const storeAllocs = localStore.getAllocations();

        activeEnr = storeEnr.map((e) => ({
          ...e,
          student: storeStudents.find((s) => s.id === e.student_id),
        })).filter((e) => e.student && e.student.student_status === 'aktif');

        // Map allocs
        for (const a of storeAllocs) {
          const p = storePayments.find((pm) => pm.id === a.payment_id);
          if (p?.status === 'valid') {
            const prev = allocsByBillId.get(a.bill_id) || 0;
            allocsByBillId.set(a.bill_id, prev + Number(a.allocated_amount || 0));
          }
        }

        bills = storeBills.map((b) => ({
          ...b,
          catName: storeCategories.find((c) => c.id === b.category_id)?.name || 'Lainnya',
          paidAmount: allocsByBillId.get(b.id) || 0,
        }));

        recentPmts = storePayments.filter((p) => p.status === 'valid').slice(0, 5).map((p) => ({
          ...p,
          student: storeStudents.find((s) => s.id === p.student_id),
        }));
      } else {
        // Fast & reliable flat queries to Supabase
        // 1. Enrollments
        const { data: enrollments, error: enrErr } = await supabase
          .from('student_enrollments')
          .select(`
            id,
            student_id,
            unit,
            grade,
            administrative_status,
            student:students(
              id,
              full_name,
              nis,
              gender,
              student_status
            )
          `)
          .eq('academic_year_id', selectedAcademicYearId)
          .range(0, 4999);

        if (enrErr) console.warn('Enrollment fetch err:', enrErr);

        activeEnr = (enrollments || []).filter(
          (e: any) => e.student && e.student.student_status === 'aktif'
        );

        // 2. Billing Categories
        const { data: catList } = await supabase.from('billing_categories').select('id, name');
        const catMapById = new Map<string, string>();
        (catList || []).forEach((c: any) => catMapById.set(c.id, c.name));

        // 3. Flat payment allocations (only ~2188 rows)
        let aPage = 0;
        while (true) {
          const { data: aData } = await supabase.from('payment_allocations')
            .select('bill_id, allocated_amount, payment:payments(status)')
            .range(aPage * 1000, aPage * 1000 + 999);
          if (!aData || aData.length === 0) break;
          for (const a of aData) {
            if ((a as any).payment?.status === 'valid') {
              const prev = allocsByBillId.get(a.bill_id) || 0;
              allocsByBillId.set(a.bill_id, prev + Number(a.allocated_amount || 0));
            }
          }
          if (aData.length < 1000) break;
          aPage++;
        }

        // 4. Flat bills (7246 rows in fast pages of 1000)
        let allBillsData: any[] = [];
        let bPage = 0;
        while (true) {
          const { data: bData, error: bErr } = await supabase.from('bills')
            .select('id, student_id, category_id, billing_period, amount, status')
            .eq('academic_year_id', selectedAcademicYearId)
            .range(bPage * 1000, bPage * 1000 + 999);
          if (bErr || !bData || bData.length === 0) break;
          allBillsData = allBillsData.concat(bData);
          if (bData.length < 1000) break;
          bPage++;
        }

        bills = allBillsData.map((b) => ({
          ...b,
          catName: catMapById.get(b.category_id) || 'Lainnya',
          paidAmount: allocsByBillId.get(b.id) || 0,
        }));

        // 5. Recent payments
        const { data: pmts } = await supabase
          .from('payments')
          .select(`
            id,
            transaction_number,
            payment_date,
            amount,
            payment_method,
            status,
            student:students(full_name)
          `)
          .eq('status', 'valid')
          .order('payment_date', { ascending: false })
          .limit(5);

        recentPmts = pmts || [];
      }

      // Update student counts immediately
      setActiveStudentsCount(activeEnr.length);

      // Student mapping & unit lookup
      const studentUnitMap = new Map<string, string>();
      const studentGradeMap = new Map<string, string>();
      const studentNameMap = new Map<string, string>();
      const studentNisMap = new Map<string, string>();

      // Initialize class recap
      const defaultRecaps: StudentClassRecap[] = [
        { unit: 'SMP IT', grade: 'VII', lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 },
        { unit: 'SMP IT', grade: 'VIII', lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 },
        { unit: 'SMP IT', grade: 'IX', lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 },
        { unit: 'SMA IT', grade: 'X', lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 },
        { unit: 'SMA IT', grade: 'XI', lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 },
        { unit: 'SMA IT', grade: 'XII', lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 },
      ];

      let countLaki = 0;
      let countPerempuan = 0;
      let countMampu = 0;
      let countYatim = 0;
      let countLainnya = 0;

      activeEnr.forEach((e: any) => {
        const stdId = e.student_id || e.student?.id;
        if (stdId) {
          studentUnitMap.set(stdId, e.unit);
          studentGradeMap.set(stdId, e.grade);
          if (e.student) {
            studentNameMap.set(stdId, e.student.full_name);
            studentNisMap.set(stdId, e.student.nis);
          }
        }

        const row = defaultRecaps.find((r) => r.unit === e.unit && r.grade === e.grade);

        // Gender counting (L / P)
        const g = (e.student?.gender || '').toString().trim().toLowerCase();
        const isLaki = g === 'l' || g.startsWith('laki');
        if (isLaki) {
          countLaki++;
          if (row) row.lakiLaki++;
        } else {
          countPerempuan++;
          if (row) row.perempuan++;
        }

        const st = (e.administrative_status || 'Mampu').toLowerCase();
        if (row) {
          if (st === 'mampu') {
            row.mampu++;
            countMampu++;
          } else if (st === 'yatim') {
            row.yatim++;
            countYatim++;
          } else {
            row.lainnya++;
            countLainnya++;
          }
          row.total++;
        }
      });

      setTotalLaki(countLaki);
      setTotalPerempuan(countPerempuan);
      setTotalMampu(countMampu);
      setTotalYatim(countYatim);
      setTotalLainnya(countLainnya);
      setClassRecapList(defaultRecaps);

      let sumBills = 0;
      let sumPaid = 0;
      const studentBalanceMap = new Map<string, { studentId: string; totalBills: number; totalPaid: number }>();

      const catMap: Record<string, {
        smpTagihan: number; smpBayar: number;
        smaTagihan: number; smaBayar: number;
      }> = {
        'SPP': { smpTagihan: 0, smpBayar: 0, smaTagihan: 0, smaBayar: 0 },
        'Perlengkapan': { smpTagihan: 0, smpBayar: 0, smaTagihan: 0, smaBayar: 0 },
        'Peralatan': { smpTagihan: 0, smpBayar: 0, smaTagihan: 0, smaBayar: 0 },
        'Kegiatan': { smpTagihan: 0, smpBayar: 0, smaTagihan: 0, smaBayar: 0 },
        'Pembangunan': { smpTagihan: 0, smpBayar: 0, smaTagihan: 0, smaBayar: 0 },
        'Ujian': { smpTagihan: 0, smpBayar: 0, smaTagihan: 0, smaBayar: 0 },
        'Lainnya': { smpTagihan: 0, smpBayar: 0, smaTagihan: 0, smaBayar: 0 },
      };

      const sppMonthMap: Record<string, { target: number; collected: number }> = {};
      SPP_MONTHS.forEach((m) => {
        sppMonthMap[m] = { target: 0, collected: 0 };
      });

      for (const bill of bills || []) {
        const studentUnit = studentUnitMap.get(bill.student_id) || 'SMP IT';
        const billAmount = Number(bill.amount || 0);
        const paidAmount = Number(bill.paidAmount || 0);

        if (bill.status !== 'Bebas') {
          sumBills += billAmount;
          sumPaid += paidAmount;

          if (!studentBalanceMap.has(bill.student_id)) {
            studentBalanceMap.set(bill.student_id, {
              studentId: bill.student_id,
              totalBills: 0,
              totalPaid: 0,
            });
          }
          const sBal = studentBalanceMap.get(bill.student_id)!;
          sBal.totalBills += billAmount;
          sBal.totalPaid += paidAmount;
        }

        let catName = bill.catName || 'Lainnya';
        if (catName.includes('Syahriyyah') || catName.includes('SPP')) catName = 'SPP';
        else if (catName.includes('Perlengkapan')) catName = 'Perlengkapan';
        else if (catName.includes('Peralatan')) catName = 'Peralatan';
        else if (catName.includes('Kegiatan')) catName = 'Kegiatan';
        else if (catName.includes('Pembangunan')) catName = 'Pembangunan';
        else if (catName.includes('Ujian')) catName = 'Ujian';
        else catName = 'Lainnya';

        if (studentUnit === 'SMP IT') {
          if (bill.status !== 'Bebas') catMap[catName].smpTagihan += billAmount;
          catMap[catName].smpBayar += paidAmount;
        } else {
          if (bill.status !== 'Bebas') catMap[catName].smaTagihan += billAmount;
          catMap[catName].smaBayar += paidAmount;
        }

        if (catName === 'SPP' && bill.billing_period && sppMonthMap[bill.billing_period]) {
          if (bill.status !== 'Bebas') {
            sppMonthMap[bill.billing_period].target += billAmount;
          }
          sppMonthMap[bill.billing_period].collected += paidAmount;
        }
      }

      setTotalBills(sumBills);
      setTotalPayments(sumPaid);
      setTotalArrears(Math.max(0, sumBills - sumPaid));

      let countPaid = 0;
      let countArrears = 0;
      const studentArrearsList: any[] = [];

      studentBalanceMap.forEach((bal) => {
        const remaining = Math.max(0, bal.totalBills - bal.totalPaid);
        if (remaining === 0) {
          countPaid++;
        } else {
          countArrears++;
          studentArrearsList.push({
            studentId: bal.studentId,
            remaining,
          });
        }
      });

      setPaidStudentsCount(countPaid);
      setArrearsStudentsCount(countArrears);

      const catOrder = ['SPP', 'Perlengkapan', 'Peralatan', 'Kegiatan', 'Pembangunan', 'Ujian', 'Lainnya'];
      const builtSummaries: CategorySummary[] = catOrder.map((catKey) => {
        const data = catMap[catKey];
        const sisaSMP = Math.max(0, data.smpTagihan - data.smpBayar);
        const sisaSMA = Math.max(0, data.smaTagihan - data.smaBayar);
        const tagihanTotal = data.smpTagihan + data.smaTagihan;
        const bayarTotal = data.smpBayar + data.smaBayar;
        const sisaTotal = Math.max(0, tagihanTotal - bayarTotal);

        return {
          name: catKey === 'SPP' ? 'INFAQ SYAHRIYYAH (SPP)' : catKey.toUpperCase(),
          tagihanSMP: data.smpTagihan,
          bayarSMP: data.smpBayar,
          sisaSMP,
          tagihanSMA: data.smaTagihan,
          bayarSMA: data.smaBayar,
          sisaSMA,
          tagihanTotal,
          bayarTotal,
          sisaTotal,
        };
      });

      setCategorySummaries(builtSummaries);

      const builtMonthly = SPP_MONTHS.map((m) => {
        const item = sppMonthMap[m];
        const remaining = Math.max(0, item.target - item.collected);
        const percentage = item.target > 0 ? (item.collected / item.target) * 100 : 0;
        return {
          month: m,
          totalTarget: item.target,
          totalCollected: item.collected,
          totalRemaining: remaining,
          percentage,
        };
      });
      setMonthlySppStats(builtMonthly);

      studentArrearsList.sort((a, b) => b.remaining - a.remaining);
      const topFive = studentArrearsList.slice(0, 5);

      const mergedTop = topFive.map((s) => ({
        id: s.studentId,
        name: studentNameMap.get(s.studentId) || 'Siswa',
        nis: studentNisMap.get(s.studentId),
        unit: studentUnitMap.get(s.studentId) || 'SMP IT',
        grade: studentGradeMap.get(s.studentId) || '-',
        remaining: s.remaining,
      }));

      setTopArrears(mergedTop);
      setRecentTransactions(recentPmts);
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [selectedAcademicYearId, refreshKey]);

  const formatRupiah = (val: number) => {
    return 'Rp' + Number(val || 0).toLocaleString('id-ID');
  };

  // Export Rekap Siswa Per Kelas & Jenjang
  const handleExportClassRecap = () => {
    const exportRows: any[] = classRecapList.map((r, idx) => ({
      'No': idx + 1,
      'Jenjang': r.unit,
      'Kelas': r.grade,
      'Laki-laki (L)': r.lakiLaki,
      'Perempuan (P)': r.perempuan,
      'Mampu (Reguler)': r.mampu,
      'Yatim (Bebas Biaya)': r.yatim,
      'Lainnya (Beasiswa/Dhuafa)': r.lainnya,
      'Total Siswa': r.total,
      'Persentase Mampu (%)': r.total > 0 ? ((r.mampu / r.total) * 100).toFixed(1) + '%' : '0%',
    }));

    // Subtotal rows
    const smpTotal = classRecapList.filter((r) => r.unit === 'SMP IT').reduce((acc, r) => ({
      lakiLaki: acc.lakiLaki + r.lakiLaki,
      perempuan: acc.perempuan + r.perempuan,
      mampu: acc.mampu + r.mampu,
      yatim: acc.yatim + r.yatim,
      lainnya: acc.lainnya + r.lainnya,
      total: acc.total + r.total,
    }), { lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 });

    const smaTotal = classRecapList.filter((r) => r.unit === 'SMA IT').reduce((acc, r) => ({
      lakiLaki: acc.lakiLaki + r.lakiLaki,
      perempuan: acc.perempuan + r.perempuan,
      mampu: acc.mampu + r.mampu,
      yatim: acc.yatim + r.yatim,
      lainnya: acc.lainnya + r.lainnya,
      total: acc.total + r.total,
    }), { lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 });

    exportRows.push({
      'No': '' as any,
      'Jenjang': 'SUBTOTAL SMP IT',
      'Kelas': 'VII - IX',
      'Laki-laki (L)': smpTotal.lakiLaki,
      'Perempuan (P)': smpTotal.perempuan,
      'Mampu (Reguler)': smpTotal.mampu,
      'Yatim (Bebas Biaya)': smpTotal.yatim,
      'Lainnya (Beasiswa/Dhuafa)': smpTotal.lainnya,
      'Total Siswa': smpTotal.total,
      'Persentase Mampu (%)': smpTotal.total > 0 ? ((smpTotal.mampu / smpTotal.total) * 100).toFixed(1) + '%' : '0%',
    });

    exportRows.push({
      'No': '' as any,
      'Jenjang': 'SUBTOTAL SMA IT',
      'Kelas': 'X - XII',
      'Laki-laki (L)': smaTotal.lakiLaki,
      'Perempuan (P)': smaTotal.perempuan,
      'Mampu (Reguler)': smaTotal.mampu,
      'Yatim (Bebas Biaya)': smaTotal.yatim,
      'Lainnya (Beasiswa/Dhuafa)': smaTotal.lainnya,
      'Total Siswa': smaTotal.total,
      'Persentase Mampu (%)': smaTotal.total > 0 ? ((smaTotal.mampu / smaTotal.total) * 100).toFixed(1) + '%' : '0%',
    });

    exportRows.push({
      'No': '' as any,
      'Jenjang': 'TOTAL KESELURUHAN',
      'Kelas': 'Semua Kelas',
      'Laki-laki (L)': totalLaki,
      'Perempuan (P)': totalPerempuan,
      'Mampu (Reguler)': totalMampu,
      'Yatim (Bebas Biaya)': totalYatim,
      'Lainnya (Beasiswa/Dhuafa)': totalLainnya,
      'Total Siswa': activeStudentsCount,
      'Persentase Mampu (%)': activeStudentsCount > 0 ? ((totalMampu / activeStudentsCount) * 100).toFixed(1) + '%' : '0%',
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Kelas & Status');
    XLSX.writeFile(wb, `Rekap_Siswa_Kelas_Status_${selectedAcademicYear?.name || '2026-2027'}.xlsx`);
  };

  const filteredClassRecap = classRecapList.filter((r) => {
    if (classRecapUnitFilter === 'ALL') return true;
    return r.unit === classRecapUnitFilter;
  });

  const smpSubtotal = classRecapList.filter((r) => r.unit === 'SMP IT').reduce((acc, r) => ({
    lakiLaki: acc.lakiLaki + r.lakiLaki,
    perempuan: acc.perempuan + r.perempuan,
    mampu: acc.mampu + r.mampu,
    yatim: acc.yatim + r.yatim,
    lainnya: acc.lainnya + r.lainnya,
    total: acc.total + r.total,
  }), { lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 });

  const smaSubtotal = classRecapList.filter((r) => r.unit === 'SMA IT').reduce((acc, r) => ({
    lakiLaki: acc.lakiLaki + r.lakiLaki,
    perempuan: acc.perempuan + r.perempuan,
    mampu: acc.mampu + r.mampu,
    yatim: acc.yatim + r.yatim,
    lainnya: acc.lainnya + r.lainnya,
    total: acc.total + r.total,
  }), { lakiLaki: 0, perempuan: 0, mampu: 0, yatim: 0, lainnya: 0, total: 0 });

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner / Academic Year Status */}
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-850 to-emerald-950 rounded-2xl p-6 text-white shadow-lg border border-emerald-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gold-400 text-emerald-950 mb-2">
            <Calendar className="w-3.5 h-3.5" />
            Tahun Ajaran {selectedAcademicYear?.name || '2026/2027'}
          </span>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            Dashboard Keuangan Yayasan Al-Qur’aniyyah
          </h2>
          <p className="text-emerald-200/80 text-sm mt-1 max-w-2xl">
            Ringkasan data real-time penerimaan Infaq Syahriyyah (SPP), perlengkapan, pembangunan, dan rekap tunggakan siswa unit SMP IT & SMA IT.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchDashboardData()}
            disabled={isLoading}
            className="flex items-center gap-2 bg-emerald-800/80 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm border border-emerald-600/50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Perbarui Data</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Siswa Aktif</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{activeStudentsCount}</h3>
            <p className="text-xs text-slate-500 mt-1">
              <span className="text-emerald-600 font-semibold">{paidStudentsCount} lunas</span> ·{' '}
              <span className="text-rose-600 font-semibold">{arrearsStudentsCount} menunggak</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Tagihan</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{formatRupiah(totalBills)}</h3>
            <p className="text-xs text-slate-500 mt-1">Seluruh item pembiayaan</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Wallet className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Pemasukan Diterima</p>
            <h3 className="text-2xl font-black text-emerald-700 mt-1">{formatRupiah(totalPayments)}</h3>
            <p className="text-xs text-emerald-600/80 font-medium mt-1">
              {totalBills > 0 ? ((totalPayments / totalBills) * 100).toFixed(1) : 0}% terealisasi
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-rose-500">Sisa Tagihan / Tunggakan</p>
            <h3 className="text-2xl font-black text-rose-600 mt-1">{formatRupiah(totalArrears)}</h3>
            <p className="text-xs text-rose-500/80 font-medium mt-1">Perlu ditindaklanjuti</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* REKAP STATUS SISWA & KELAS (Requested by user) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
              <h3 className="text-base font-bold text-slate-800">
                Rekap Siswa Tiap Kelas & Jenjang (Jenis Kelamin L/P & Status Administrasi)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Rincian lengkap sebaran jenis kelamin (Laki-laki / Perempuan) serta status reguler (mampu), bebas biaya (yatim), dan keringanan/beasiswa di tiap tingkatan kelas.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white text-xs font-semibold">
              <button
                onClick={() => setClassRecapUnitFilter('ALL')}
                className={`px-3 py-1.5 rounded-md transition ${
                  classRecapUnitFilter === 'ALL' ? 'bg-emerald-800 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Semua Jenjang
              </button>
              <button
                onClick={() => setClassRecapUnitFilter('SMP IT')}
                className={`px-3 py-1.5 rounded-md transition ${
                  classRecapUnitFilter === 'SMP IT' ? 'bg-emerald-800 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                SMP IT
              </button>
              <button
                onClick={() => setClassRecapUnitFilter('SMA IT')}
                className={`px-3 py-1.5 rounded-md transition ${
                  classRecapUnitFilter === 'SMA IT' ? 'bg-emerald-800 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                SMA IT
              </button>
            </div>

            <button
              onClick={handleExportClassRecap}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-emerald-700" />
              <span>Export Rekap Siswa</span>
            </button>
          </div>
        </div>

        {/* Visual Cards: Gender & Administrative Status */}
        <div className="p-6 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50/40">
          <div className="bg-white p-3.5 rounded-xl border border-sky-100 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Laki-laki (L)</p>
              <h4 className="text-xl font-black text-sky-700 mt-0.5">{totalLaki} Siswa</h4>
              <p className="text-[11px] text-sky-600 font-medium">
                {activeStudentsCount > 0 ? ((totalLaki / activeStudentsCount) * 100).toFixed(1) : 0}% santri putra
              </p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-rose-100 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Perempuan (P)</p>
              <h4 className="text-xl font-black text-rose-700 mt-0.5">{totalPerempuan} Siswi</h4>
              <p className="text-[11px] text-rose-600 font-medium">
                {activeStudentsCount > 0 ? ((totalPerempuan / activeStudentsCount) * 100).toFixed(1) : 0}% santri putri
              </p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-emerald-100 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Mampu (Reguler)</p>
              <h4 className="text-xl font-black text-emerald-800 mt-0.5">{totalMampu} Siswa</h4>
              <p className="text-[11px] text-emerald-600 font-medium">
                {activeStudentsCount > 0 ? ((totalMampu / activeStudentsCount) * 100).toFixed(1) : 0}% dari total
              </p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-purple-100 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Yatim (Free)</p>
              <h4 className="text-xl font-black text-purple-800 mt-0.5">{totalYatim} Siswa</h4>
              <p className="text-[11px] text-purple-600 font-medium">
                Bebas SPP ({activeStudentsCount > 0 ? ((totalYatim / activeStudentsCount) * 100).toFixed(1) : 0}%)
              </p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
              <HeartHandshake className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-blue-100 shadow-xs flex items-center justify-between col-span-2 sm:col-span-1">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Lainnya / Beasiswa</p>
              <h4 className="text-xl font-black text-blue-800 mt-0.5">{totalLainnya} Siswa</h4>
              <p className="text-[11px] text-blue-600 font-medium">
                Subsidi ({activeStudentsCount > 0 ? ((totalLainnya / activeStudentsCount) * 100).toFixed(1) : 0}%)
              </p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
              <Award className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Breakdown Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-800 text-white font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4 border-b border-slate-700 w-12 text-center">No</th>
                <th className="py-3 px-4 border-b border-slate-700">Jenjang</th>
                <th className="py-3 px-4 border-b border-slate-700 text-center">Kelas</th>
                <th className="py-3 px-4 border-b border-slate-700 text-right bg-sky-950/60 text-sky-200">
                  L (Laki-laki)
                </th>
                <th className="py-3 px-4 border-b border-slate-700 text-right bg-rose-950/60 text-rose-200">
                  P (Perempuan)
                </th>
                <th className="py-3 px-4 border-b border-slate-700 text-right bg-emerald-900/40">
                  Mampu (Reguler)
                </th>
                <th className="py-3 px-4 border-b border-slate-700 text-right bg-purple-900/40">
                  Yatim (Free)
                </th>
                <th className="py-3 px-4 border-b border-slate-700 text-right bg-blue-900/40">
                  Lainnya (Beasiswa/Dhuafa)
                </th>
                <th className="py-3 px-4 border-b border-slate-700 text-right bg-slate-900">
                  Total Siswa Kelas
                </th>
                <th className="py-3 px-4 border-b border-slate-700 text-center">
                  Rasio Mampu
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredClassRecap.map((row, idx) => {
                const ratio = row.total > 0 ? Math.round((row.mampu / row.total) * 100) : 0;
                return (
                  <tr key={`${row.unit}-${row.grade}`} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 text-center text-slate-400 font-bold">{idx + 1}</td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                        row.unit === 'SMP IT' ? 'bg-emerald-50 text-emerald-800' : 'bg-blue-50 text-blue-800'
                      }`}>
                        {row.unit}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-black text-slate-800">
                      Kelas {row.grade}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-sky-700 bg-sky-50/30">
                      {row.lakiLaki} L
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-rose-700 bg-rose-50/30">
                      {row.perempuan} P
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-700 bg-emerald-50/30">
                      {row.mampu} Siswa
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-purple-700 bg-purple-50/30">
                      {row.yatim} Siswa
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-blue-700 bg-blue-50/30">
                      {row.lainnya} Siswa
                    </td>
                    <td className="py-3 px-4 text-right font-black text-slate-900 bg-slate-50">
                      {row.total} Siswa
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                        {ratio}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {/* Subtotal SMP IT */}
              {(classRecapUnitFilter === 'ALL' || classRecapUnitFilter === 'SMP IT') && (
                <tr className="bg-emerald-50/80 font-bold text-emerald-950 border-t border-emerald-200">
                  <td className="py-2.5 px-4 text-center" colSpan={3}>
                    SUBTOTAL SMP IT (Kelas VII - IX)
                  </td>
                  <td className="py-2.5 px-4 text-right text-sky-800 font-black">{smpSubtotal.lakiLaki} L</td>
                  <td className="py-2.5 px-4 text-right text-rose-800 font-black">{smpSubtotal.perempuan} P</td>
                  <td className="py-2.5 px-4 text-right text-emerald-800 font-black">{smpSubtotal.mampu} Siswa</td>
                  <td className="py-2.5 px-4 text-right text-purple-800 font-black">{smpSubtotal.yatim} Siswa</td>
                  <td className="py-2.5 px-4 text-right text-blue-800 font-black">{smpSubtotal.lainnya} Siswa</td>
                  <td className="py-2.5 px-4 text-right font-black text-emerald-950">{smpSubtotal.total} Siswa</td>
                  <td className="py-2.5 px-4 text-center">
                    {smpSubtotal.total > 0 ? ((smpSubtotal.mampu / smpSubtotal.total) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              )}

              {/* Subtotal SMA IT */}
              {(classRecapUnitFilter === 'ALL' || classRecapUnitFilter === 'SMA IT') && (
                <tr className="bg-blue-50/80 font-bold text-blue-950 border-t border-blue-200">
                  <td className="py-2.5 px-4 text-center" colSpan={3}>
                    SUBTOTAL SMA IT (Kelas X - XII)
                  </td>
                  <td className="py-2.5 px-4 text-right text-sky-800 font-black">{smaSubtotal.lakiLaki} L</td>
                  <td className="py-2.5 px-4 text-right text-rose-800 font-black">{smaSubtotal.perempuan} P</td>
                  <td className="py-2.5 px-4 text-right text-emerald-800 font-black">{smaSubtotal.mampu} Siswa</td>
                  <td className="py-2.5 px-4 text-right text-purple-800 font-black">{smaSubtotal.yatim} Siswa</td>
                  <td className="py-2.5 px-4 text-right text-blue-800 font-black">{smaSubtotal.lainnya} Siswa</td>
                  <td className="py-2.5 px-4 text-right font-black text-blue-950">{smaSubtotal.total} Siswa</td>
                  <td className="py-2.5 px-4 text-center">
                    {smaSubtotal.total > 0 ? ((smaSubtotal.mampu / smaSubtotal.total) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              )}

              {/* Grand Total */}
              {classRecapUnitFilter === 'ALL' && (
                <tr className="bg-slate-900 font-black text-white border-t-2 border-slate-700">
                  <td className="py-3 px-4 text-center" colSpan={3}>
                    TOTAL KESELURUHAN (SMP IT & SMA IT)
                  </td>
                  <td className="py-3 px-4 text-right text-sky-300 font-black">{totalLaki} L</td>
                  <td className="py-3 px-4 text-right text-rose-300 font-black">{totalPerempuan} P</td>
                  <td className="py-3 px-4 text-right text-emerald-300 font-black">{totalMampu} Siswa</td>
                  <td className="py-3 px-4 text-right text-purple-300 font-black">{totalYatim} Siswa</td>
                  <td className="py-3 px-4 text-right text-blue-300 font-black">{totalLainnya} Siswa</td>
                  <td className="py-3 px-4 text-right text-gold-400 font-black">{activeStudentsCount} Siswa</td>
                  <td className="py-3 px-4 text-center text-emerald-300">
                    {activeStudentsCount > 0 ? ((totalMampu / activeStudentsCount) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </div>

      {/* Main Breakdown: NOMINAL KEUANGAN PER ITEM */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h3 className="text-base font-bold text-slate-800">
              Rekapitulasi Keuangan Per Item (SMP IT & SMA IT)
            </h3>
            <p className="text-xs text-slate-500">
              Sesuai format acuan sheet DASHBOARD Excel
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Filter Tampilan:</span>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white text-xs font-semibold">
              <button
                onClick={() => setUnitFilter('ALL')}
                className={`px-3 py-1.5 rounded-md transition ${
                  unitFilter === 'ALL' ? 'bg-emerald-800 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Seluruh Unit
              </button>
              <button
                onClick={() => setUnitFilter('SMP IT')}
                className={`px-3 py-1.5 rounded-md transition ${
                  unitFilter === 'SMP IT' ? 'bg-emerald-800 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                SMP IT
              </button>
              <button
                onClick={() => setUnitFilter('SMA IT')}
                className={`px-3 py-1.5 rounded-md transition ${
                  unitFilter === 'SMA IT' ? 'bg-emerald-800 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                SMA IT
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-emerald-950 text-white font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4 border-b border-emerald-900 w-12 text-center">No</th>
                <th className="py-3.5 px-4 border-b border-emerald-900">Item Keuangan</th>
                {(unitFilter === 'ALL' || unitFilter === 'SMP IT') && (
                  <>
                    <th className="py-3.5 px-4 border-b border-emerald-900 text-right bg-emerald-900/60">
                      Tagihan SMP
                    </th>
                    <th className="py-3.5 px-4 border-b border-emerald-900 text-right bg-emerald-900/60">
                      Masuk SMP
                    </th>
                    <th className="py-3.5 px-4 border-b border-emerald-900 text-right bg-emerald-900/60">
                      Sisa SMP
                    </th>
                  </>
                )}
                {(unitFilter === 'ALL' || unitFilter === 'SMA IT') && (
                  <>
                    <th className="py-3.5 px-4 border-b border-emerald-900 text-right bg-emerald-850/60">
                      Tagihan SMA
                    </th>
                    <th className="py-3.5 px-4 border-b border-emerald-900 text-right bg-emerald-850/60">
                      Masuk SMA
                    </th>
                    <th className="py-3.5 px-4 border-b border-emerald-900 text-right bg-emerald-850/60">
                      Sisa SMA
                    </th>
                  </>
                )}
                {unitFilter === 'ALL' && (
                  <>
                    <th className="py-3.5 px-4 border-b border-emerald-900 text-right bg-emerald-800">
                      Total Tagihan
                    </th>
                    <th className="py-3.5 px-4 border-b border-emerald-900 text-right bg-emerald-800">
                      Total Masuk
                    </th>
                    <th className="py-3.5 px-4 border-b border-emerald-900 text-right bg-emerald-800">
                      Total Sisa
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {categorySummaries.map((item, idx) => (
                <tr key={item.name} className="hover:bg-emerald-50/40 transition">
                  <td className="py-3 px-4 text-center font-bold text-slate-400">{idx + 1}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{item.name}</td>
                  {(unitFilter === 'ALL' || unitFilter === 'SMP IT') && (
                    <>
                      <td className="py-3 px-4 text-right text-slate-600">{formatRupiah(item.tagihanSMP)}</td>
                      <td className="py-3 px-4 text-right text-emerald-700 font-semibold">{formatRupiah(item.bayarSMP)}</td>
                      <td className="py-3 px-4 text-right text-rose-600 font-semibold">{formatRupiah(item.sisaSMP)}</td>
                    </>
                  )}
                  {(unitFilter === 'ALL' || unitFilter === 'SMA IT') && (
                    <>
                      <td className="py-3 px-4 text-right text-slate-600">{formatRupiah(item.tagihanSMA)}</td>
                      <td className="py-3 px-4 text-right text-emerald-700 font-semibold">{formatRupiah(item.bayarSMA)}</td>
                      <td className="py-3 px-4 text-right text-rose-600 font-semibold">{formatRupiah(item.sisaSMA)}</td>
                    </>
                  )}
                  {unitFilter === 'ALL' && (
                    <>
                      <td className="py-3 px-4 text-right font-bold text-slate-800 bg-slate-50/60">
                        {formatRupiah(item.tagihanTotal)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-800 bg-emerald-50/40">
                        {formatRupiah(item.bayarTotal)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-rose-700 bg-rose-50/30">
                        {formatRupiah(item.sisaTotal)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                <td className="py-3.5 px-4 text-center" colSpan={2}>
                  TOTAL KESELURUHAN
                </td>
                {(unitFilter === 'ALL' || unitFilter === 'SMP IT') && (
                  <>
                    <td className="py-3.5 px-4 text-right">
                      {formatRupiah(categorySummaries.reduce((s, c) => s + c.tagihanSMP, 0))}
                    </td>
                    <td className="py-3.5 px-4 text-right text-emerald-800">
                      {formatRupiah(categorySummaries.reduce((s, c) => s + c.bayarSMP, 0))}
                    </td>
                    <td className="py-3.5 px-4 text-right text-rose-700">
                      {formatRupiah(categorySummaries.reduce((s, c) => s + c.sisaSMP, 0))}
                    </td>
                  </>
                )}
                {(unitFilter === 'ALL' || unitFilter === 'SMA IT') && (
                  <>
                    <td className="py-3.5 px-4 text-right">
                      {formatRupiah(categorySummaries.reduce((s, c) => s + c.tagihanSMA, 0))}
                    </td>
                    <td className="py-3.5 px-4 text-right text-emerald-800">
                      {formatRupiah(categorySummaries.reduce((s, c) => s + c.bayarSMA, 0))}
                    </td>
                    <td className="py-3.5 px-4 text-right text-rose-700">
                      {formatRupiah(categorySummaries.reduce((s, c) => s + c.sisaSMA, 0))}
                    </td>
                  </>
                )}
                {unitFilter === 'ALL' && (
                  <>
                    <td className="py-3.5 px-4 text-right bg-slate-200">
                      {formatRupiah(totalBills)}
                    </td>
                    <td className="py-3.5 px-4 text-right text-emerald-850 bg-emerald-100">
                      {formatRupiah(totalPayments)}
                    </td>
                    <td className="py-3.5 px-4 text-right text-rose-800 bg-rose-100">
                      {formatRupiah(totalArrears)}
                    </td>
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Grid: Monthly SPP Collection Rate & Top Arrears / Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base text-slate-800">
                Pencapaian Infaq Syahriyyah (SPP) Per Bulan
              </h3>
              <p className="text-xs text-slate-500">
                Tingkat kolektibilitas SPP dari Juli hingga Juni
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
              Juli - Juni
            </span>
          </div>

          <div className="space-y-3">
            {monthlySppStats.map((item) => (
              <div key={item.month} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-800 w-24">{item.month}</span>
                  <span className="text-slate-500 text-[11px]">
                    Masuk: <strong className="text-emerald-700">{formatRupiah(item.totalCollected)}</strong> /{' '}
                    Target: {formatRupiah(item.totalTarget)}
                  </span>
                  <span
                    className={`font-bold w-14 text-right ${
                      item.percentage >= 80
                        ? 'text-emerald-600'
                        : item.percentage >= 40
                        ? 'text-amber-600'
                        : 'text-slate-400'
                    }`}
                  >
                    {item.percentage.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      item.percentage >= 80
                        ? 'bg-emerald-500'
                        : item.percentage >= 40
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                    }`}
                    style={{ width: `${Math.min(100, item.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
            <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center justify-between">
              <span>Siswa Tunggakan Terbesar</span>
              <span className="text-[11px] text-rose-600 font-semibold">Top 5</span>
            </h4>

            {topArrears.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Tidak ada data tunggakan.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {topArrears.map((st) => (
                  <div key={st.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{st.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {st.unit} · Kelas {st.grade}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-rose-600">{formatRupiah(st.remaining)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
            <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center justify-between">
              <span>Transaksi Terakhir</span>
              <span className="text-[11px] text-emerald-600 font-semibold">Real-time</span>
            </h4>

            {recentTransactions.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Belum ada transaksi tercatat.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentTransactions.map((tx) => (
                  <div key={tx.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{tx.student?.full_name || 'Siswa'}</p>
                      <p className="text-[11px] text-slate-400">
                        {tx.payment_date} · {tx.payment_method || 'Tunai'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-emerald-700">{formatRupiah(tx.amount)}</p>
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
                        Sukses
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
