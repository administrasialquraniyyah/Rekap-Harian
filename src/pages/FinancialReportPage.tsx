import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Calendar,
  Download,
  Filter,
  FileSpreadsheet,
  TrendingUp,
  Receipt,
  Users,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { SPP_MONTHS } from '../services/billingService';
import * as XLSX from 'xlsx';

export const FinancialReportPage: React.FC = () => {
  const { selectedAcademicYearId, selectedAcademicYear, showToast, refreshKey } = useApp();

  const [activeReportTab, setActiveReportTab] = useState<'monthly' | 'categories' | 'units'>('monthly');
  const [isLoading, setIsLoading] = useState(true);

  // Monthly income report
  const [monthlyData, setMonthlyData] = useState<{
    month: string;
    targetAmount: number;
    receivedAmount: number;
    remainingAmount: number;
    percentage: number;
  }[]>([]);

  // Category income report
  const [categoryData, setCategoryData] = useState<{
    categoryName: string;
    totalBills: number;
    totalReceived: number;
    remaining: number;
    percentage: number;
  }[]>([]);

  // Unit breakdown report
  const [unitData, setUnitData] = useState<{
    unit: string;
    studentCount: number;
    totalBills: number;
    totalReceived: number;
    totalArrears: number;
  }[]>([]);

  const loadReports = async () => {
    if (!selectedAcademicYearId) return;
    setIsLoading(true);

    try {
      // 1. Fetch bills with valid payments
      const { data: bills, error: bErr } = await supabase
        .from('bills')
        .select(`
          id,
          student_id,
          category_id,
          billing_period,
          amount,
          status,
          category:billing_categories(name),
          allocations:payment_allocations(
            allocated_amount,
            payment:payments(status, payment_date)
          )
        `)
        .eq('academic_year_id', selectedAcademicYearId);

      if (bErr) throw bErr;

      // 2. Fetch enrollments
      const { data: enrollments } = await supabase
        .from('student_enrollments')
        .select('student_id, unit, grade')
        .eq('academic_year_id', selectedAcademicYearId);

      const studentUnitMap = new Map<string, string>();
      (enrollments || []).forEach((e) => studentUnitMap.set(e.student_id, e.unit));

      // Process Monthly SPP
      const mStats: Record<string, { target: number; received: number }> = {};
      SPP_MONTHS.forEach((m) => {
        mStats[m] = { target: 0, received: 0 };
      });

      // Process Categories
      const cStats: Record<string, { bills: number; received: number }> = {};

      // Process Units
      const uStats: Record<string, { count: Set<string>; bills: number; received: number }> = {
        'SMP IT': { count: new Set(), bills: 0, received: 0 },
        'SMA IT': { count: new Set(), bills: 0, received: 0 },
      };

      for (const bill of bills || []) {
        const bAmt = Number(bill.amount || 0);
        const validPaid = (bill.allocations || [])
          .filter((a: any) => a.payment?.status === 'valid')
          .reduce((sum: number, a: any) => sum + Number(a.allocated_amount || 0), 0);

        const catObj: any = Array.isArray(bill.category) ? bill.category[0] : bill.category;
        const catName = catObj?.name || 'Lainnya';
        const unit = studentUnitMap.get(bill.student_id) || 'SMP IT';

        // Monthly
        if (bill.billing_period && mStats[bill.billing_period]) {
          if (bill.status !== 'Bebas') {
            mStats[bill.billing_period].target += bAmt;
          }
          mStats[bill.billing_period].received += validPaid;
        }

        // Category
        if (!cStats[catName]) cStats[catName] = { bills: 0, received: 0 };
        if (bill.status !== 'Bebas') cStats[catName].bills += bAmt;
        cStats[catName].received += validPaid;

        // Unit
        if (!uStats[unit]) uStats[unit] = { count: new Set(), bills: 0, received: 0 };
        uStats[unit].count.add(bill.student_id);
        if (bill.status !== 'Bebas') uStats[unit].bills += bAmt;
        uStats[unit].received += validPaid;
      }

      // Build Monthly Array
      const builtMonthly = SPP_MONTHS.map((m) => {
        const item = mStats[m];
        const rem = Math.max(0, item.target - item.received);
        const pct = item.target > 0 ? (item.received / item.target) * 100 : 0;
        return {
          month: m,
          targetAmount: item.target,
          receivedAmount: item.received,
          remainingAmount: rem,
          percentage: pct,
        };
      });
      setMonthlyData(builtMonthly);

      // Build Category Array
      const builtCategories = Object.keys(cStats).map((cName) => {
        const item = cStats[cName];
        const rem = Math.max(0, item.bills - item.received);
        const pct = item.bills > 0 ? (item.received / item.bills) * 100 : 0;
        return {
          categoryName: cName,
          totalBills: item.bills,
          totalReceived: item.received,
          remaining: rem,
          percentage: pct,
        };
      });
      setCategoryData(builtCategories);

      // Build Unit Array
      const builtUnits = Object.keys(uStats).map((uName) => {
        const item = uStats[uName];
        const rem = Math.max(0, item.bills - item.received);
        return {
          unit: uName,
          studentCount: item.count.size,
          totalBills: item.bills,
          totalReceived: item.received,
          totalArrears: rem,
        };
      });
      setUnitData(builtUnits);
    } catch (err: any) {
      console.error(err);
      showToast('Gagal memuat laporan: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [selectedAcademicYearId, refreshKey]);

  const handleExportCurrentTab = () => {
    let filename = `Laporan_Keuangan_${selectedAcademicYear?.name.replace('/', '-')}`;
    let rows: any[] = [];

    if (activeReportTab === 'monthly') {
      filename += '_Bulanan_SPP';
      rows = monthlyData.map((m, idx) => ({
        'NO': idx + 1,
        'BULAN': m.month,
        'TARGET TAGIHAN (Rp)': m.targetAmount,
        'DITERIMA (Rp)': m.receivedAmount,
        'TERTUNGGAK (Rp)': m.remainingAmount,
        'PERSENTASE (%)': m.percentage.toFixed(2) + '%',
      }));
    } else if (activeReportTab === 'categories') {
      filename += '_Per_Kategori';
      rows = categoryData.map((c, idx) => ({
        'NO': idx + 1,
        'KATEGORI PEMBIAYAAN': c.categoryName,
        'TOTAL TAGIHAN (Rp)': c.totalBills,
        'TOTAL PEMBAYARAN (Rp)': c.totalReceived,
        'SISA TUNGGAKAN (Rp)': c.remaining,
        'PERSENTASE (%)': c.percentage.toFixed(2) + '%',
      }));
    } else {
      filename += '_Per_Jenjang';
      rows = unitData.map((u, idx) => ({
        'NO': idx + 1,
        'JENJANG': u.unit,
        'JUMLAH SISWA': u.studentCount,
        'TOTAL TAGIHAN (Rp)': u.totalBills,
        'TOTAL PEMASUKAN (Rp)': u.totalReceived,
        'TOTAL TUNGGAKAN (Rp)': u.totalArrears,
      }));
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan');
    XLSX.writeFile(workbook, `${filename}.xlsx`);
    showToast('Laporan berhasil diexport ke Excel', 'success');
  };

  return (
    <div className="space-y-5 pb-12">
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Laporan Keuangan & Rekapitulasi</h3>
          <p className="text-xs text-slate-500">
            Laporan penerimaan dana per bulan, kategori pembiayaan, dan komparasi antar jenjang
          </p>
        </div>

        <button
          onClick={handleExportCurrentTab}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm"
        >
          <Download className="w-4 h-4 text-gold-400" />
          <span>Export Laporan Excel</span>
        </button>
      </div>

      {/* Report Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveReportTab('monthly')}
          className={`py-3 px-4 font-bold text-xs border-b-2 transition ${
            activeReportTab === 'monthly'
              ? 'border-emerald-800 text-emerald-900 bg-emerald-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Laporan Pemasukan SPP Per Bulan
        </button>
        <button
          onClick={() => setActiveReportTab('categories')}
          className={`py-3 px-4 font-bold text-xs border-b-2 transition ${
            activeReportTab === 'categories'
              ? 'border-emerald-800 text-emerald-900 bg-emerald-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Laporan Per Kategori Pembiayaan
        </button>
        <button
          onClick={() => setActiveReportTab('units')}
          className={`py-3 px-4 font-bold text-xs border-b-2 transition ${
            activeReportTab === 'units'
              ? 'border-emerald-800 text-emerald-900 bg-emerald-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Rekapitulasi Unit SMP IT & SMA IT
        </button>
      </div>

      {/* Tab 1: Monthly SPP */}
      {activeReportTab === 'monthly' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <th className="py-3 px-4 w-12 text-center">No</th>
                <th className="py-3 px-4">Bulan</th>
                <th className="py-3 px-4 text-right">Target SPP</th>
                <th className="py-3 px-4 text-right">Pemasukan Diterima</th>
                <th className="py-3 px-4 text-right">Tertunggak</th>
                <th className="py-3 px-4 text-center">Realisasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {monthlyData.map((m, idx) => (
                <tr key={m.month} className="hover:bg-slate-50/60">
                  <td className="py-3 px-4 text-center text-slate-400 font-bold">{idx + 1}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{m.month}</td>
                  <td className="py-3 px-4 text-right text-slate-700">
                    Rp{m.targetAmount.toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-emerald-700">
                    Rp{m.receivedAmount.toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-rose-600">
                    Rp{m.remainingAmount.toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                        m.percentage >= 80
                          ? 'bg-emerald-100 text-emerald-800'
                          : m.percentage >= 40
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {m.percentage.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                <td className="py-3 px-4 text-center" colSpan={2}>
                  TOTAL SPP (JULI - JUNI)
                </td>
                <td className="py-3 px-4 text-right">
                  Rp{monthlyData.reduce((s, m) => s + m.targetAmount, 0).toLocaleString('id-ID')}
                </td>
                <td className="py-3 px-4 text-right text-emerald-800">
                  Rp{monthlyData.reduce((s, m) => s + m.receivedAmount, 0).toLocaleString('id-ID')}
                </td>
                <td className="py-3 px-4 text-right text-rose-700">
                  Rp{monthlyData.reduce((s, m) => s + m.remainingAmount, 0).toLocaleString('id-ID')}
                </td>
                <td className="py-3 px-4 text-center">
                  {(
                    (monthlyData.reduce((s, m) => s + m.receivedAmount, 0) /
                      (monthlyData.reduce((s, m) => s + m.targetAmount, 0) || 1)) *
                    100
                  ).toFixed(1)}
                  %
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Tab 2: Categories */}
      {activeReportTab === 'categories' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <th className="py-3 px-4 w-12 text-center">No</th>
                <th className="py-3 px-4">Kategori Tagihan</th>
                <th className="py-3 px-4 text-right">Total Tagihan</th>
                <th className="py-3 px-4 text-right">Pemasukan Diterima</th>
                <th className="py-3 px-4 text-right">Sisa Tagihan</th>
                <th className="py-3 px-4 text-center">Persentase</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {categoryData.map((c, idx) => (
                <tr key={c.categoryName} className="hover:bg-slate-50/60">
                  <td className="py-3 px-4 text-center text-slate-400 font-bold">{idx + 1}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{c.categoryName}</td>
                  <td className="py-3 px-4 text-right text-slate-700">
                    Rp{c.totalBills.toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-emerald-700">
                    Rp{c.totalReceived.toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-rose-600">
                    Rp{c.remaining.toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="font-bold text-slate-700">{c.percentage.toFixed(1)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                <td className="py-3 px-4 text-center" colSpan={2}>
                  TOTAL SELURUH KATEGORI
                </td>
                <td className="py-3 px-4 text-right">
                  Rp{categoryData.reduce((s, c) => s + c.totalBills, 0).toLocaleString('id-ID')}
                </td>
                <td className="py-3 px-4 text-right text-emerald-800">
                  Rp{categoryData.reduce((s, c) => s + c.totalReceived, 0).toLocaleString('id-ID')}
                </td>
                <td className="py-3 px-4 text-right text-rose-700">
                  Rp{categoryData.reduce((s, c) => s + c.remaining, 0).toLocaleString('id-ID')}
                </td>
                <td className="py-3 px-4 text-center">-</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Tab 3: Units */}
      {activeReportTab === 'units' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <th className="py-3 px-4 w-12 text-center">No</th>
                <th className="py-3 px-4">Jenjang Unit</th>
                <th className="py-3 px-4 text-center">Jumlah Siswa</th>
                <th className="py-3 px-4 text-right">Total Tagihan</th>
                <th className="py-3 px-4 text-right">Total Pemasukan</th>
                <th className="py-3 px-4 text-right">Total Tunggakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {unitData.map((u, idx) => (
                <tr key={u.unit} className="hover:bg-slate-50/60">
                  <td className="py-3 px-4 text-center text-slate-400 font-bold">{idx + 1}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{u.unit}</td>
                  <td className="py-3 px-4 text-center font-bold text-slate-700">{u.studentCount} siswa</td>
                  <td className="py-3 px-4 text-right text-slate-700">
                    Rp{u.totalBills.toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-emerald-700">
                    Rp{u.totalReceived.toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-rose-600">
                    Rp{u.totalArrears.toLocaleString('id-ID')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
