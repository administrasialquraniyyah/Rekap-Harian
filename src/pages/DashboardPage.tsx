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
  Calendar
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { SPP_MONTHS } from '../services/billingService';

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

export const DashboardPage: React.FC = () => {
  const { selectedAcademicYearId, selectedAcademicYear, refreshKey } = useApp();

  const [unitFilter, setUnitFilter] = useState<'ALL' | 'SMP IT' | 'SMA IT'>('ALL');
  const [isLoading, setIsLoading] = useState(true);

  // Stats
  const [activeStudentsCount, setActiveStudentsCount] = useState(0);
  const [totalBills, setTotalBills] = useState(0);
  const [totalPayments, setTotalPayments] = useState(0);
  const [totalArrears, setTotalArrears] = useState(0);
  const [paidStudentsCount, setPaidStudentsCount] = useState(0);
  const [arrearsStudentsCount, setArrearsStudentsCount] = useState(0);

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
      if (!isSupabaseConfigured) {
        // Fallback demo statistics
        setActiveStudentsCount(509);
        setTotalBills(4689325000);
        setTotalPayments(3268412000);
        setTotalArrears(1420913000);
        setPaidStudentsCount(215);
        setArrearsStudentsCount(294);
        setIsLoading(false);
        return;
      }

      // 1. Fetch active students in this academic year
      const { data: enrollments, error: enrErr } = await supabase
        .from('student_enrollments')
        .select(`
          id,
          unit,
          grade,
          student:students(
            id,
            full_name,
            nis,
            student_status
          )
        `)
        .eq('academic_year_id', selectedAcademicYearId);

      if (enrErr) throw enrErr;

      const activeEnr = (enrollments || []).filter(
        (e: any) => e.student && e.student.student_status === 'aktif'
      );
      setActiveStudentsCount(activeEnr.length);

      // Map student_id to unit
      const studentUnitMap = new Map<string, string>();
      activeEnr.forEach((e: any) => studentUnitMap.set(e.student.id, e.unit));

      // 2. Fetch all bills for this academic year
      const { data: bills, error: billsErr } = await supabase
        .from('bills')
        .select(`
          id,
          student_id,
          category_id,
          billing_period,
          amount,
          status,
          category:billing_categories(name, category_type),
          allocations:payment_allocations(
            allocated_amount,
            payment:payments(status, payment_date)
          )
        `)
        .eq('academic_year_id', selectedAcademicYearId);

      if (billsErr) throw billsErr;

      let sumBills = 0;
      let sumPaid = 0;

      // Group by student for arrears tracking
      const studentBalanceMap = new Map<string, { studentId: string; totalBills: number; totalPaid: number }>();

      // Categories map: Perlengkapan, Peralatan, Kegiatan, Pembangunan, Ujian, SPP, Lainnya
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

      // Monthly SPP target & collected
      const sppMonthMap: Record<string, { target: number; collected: number }> = {};
      SPP_MONTHS.forEach((m) => {
        sppMonthMap[m] = { target: 0, collected: 0 };
      });

      for (const bill of bills || []) {
        const studentUnit = studentUnitMap.get(bill.student_id) || 'SMP IT';
        const billAmount = Number(bill.amount || 0);

        // Valid payments only
        const validAllocations = (bill.allocations || []).filter(
          (a: any) => a.payment && a.payment.status === 'valid'
        );
        const paidAmount = validAllocations.reduce((sum: number, a: any) => sum + Number(a.allocated_amount || 0), 0);

        if (bill.status !== 'Bebas') {
          sumBills += billAmount;
          sumPaid += paidAmount;

          // Track student balance
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

        // Categorize
        const catObj: any = Array.isArray(bill.category) ? bill.category[0] : bill.category;
        let catName = catObj?.name || 'Lainnya';
        if (catName.includes('Syahriyyah') || catName.includes('SPP')) catName = 'SPP';
        else if (!catMap[catName]) catName = 'Lainnya';

        if (studentUnit === 'SMP IT') {
          if (bill.status !== 'Bebas') catMap[catName].smpTagihan += billAmount;
          catMap[catName].smpBayar += paidAmount;
        } else {
          if (bill.status !== 'Bebas') catMap[catName].smaTagihan += billAmount;
          catMap[catName].smaBayar += paidAmount;
        }

        // Monthly SPP performance
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

      // Calculate paid vs arrears students
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

      // Build category summaries table
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

      // Monthly SPP stats
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

      // 3. Top arrears students details
      studentArrearsList.sort((a, b) => b.remaining - a.remaining);
      const topFiveIds = studentArrearsList.slice(0, 5).map((s) => s.studentId);

      if (topFiveIds.length > 0) {
        const { data: topStudentsData } = await supabase
          .from('students')
          .select(`
            id,
            full_name,
            nis,
            student_enrollments(unit, grade)
          `)
          .in('id', topFiveIds);

        const mergedTop = (topStudentsData || []).map((st: any) => {
          const matchBal = studentArrearsList.find((s) => s.studentId === st.id);
          const enr = st.student_enrollments?.[0];
          return {
            id: st.id,
            name: st.full_name,
            nis: st.nis,
            unit: enr?.unit || 'SMP IT',
            grade: enr?.grade || '-',
            remaining: matchBal?.remaining || 0,
          };
        }).sort((a: any, b: any) => b.remaining - a.remaining);

        setTopArrears(mergedTop);
      } else {
        setTopArrears([]);
      }

      // 4. Fetch recent payments
      const { data: recentPmts } = await supabase
        .from('payments')
        .select(`
          id,
          transaction_number,
          payment_date,
          amount,
          payment_method,
          status,
          student:students(full_name),
          allocations:payment_allocations(
            bill:bills(billing_period, category:billing_categories(name))
          )
        `)
        .eq('status', 'valid')
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentTransactions(recentPmts || []);

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
        {/* Total Siswa Aktif */}
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

        {/* Total Tagihan */}
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

        {/* Total Pembayaran Diterima */}
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

        {/* Total Sisa Tagihan (Tunggakan) */}
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

      {/* Main Breakdown: NOMINAL KEUANGAN PER ITEM (Exact structure from Excel DASHBOARD) */}
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
            {/* Grand Totals */}
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
        {/* Monthly SPP Collection Rate (2 Cols) */}
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
                {/* Progress bar */}
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

        {/* Right Col: Top Arrears & Recent Payments */}
        <div className="space-y-6">
          {/* Top Arrears Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
            <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center justify-between">
              <span>Siswa Tunggakan Terbesar</span>
              <span className="text-[11px] text-rose-600 font-semibold">Top 5</span>
            </h4>

            {topArrears.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Tidak ada data tunggakan.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {topArrears.map((st, idx) => (
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

          {/* Recent Payments Card */}
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
