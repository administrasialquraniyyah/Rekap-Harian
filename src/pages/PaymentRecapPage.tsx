import React, { useState, useEffect } from 'react';
import {
  TableProperties,
  Search,
  Filter,
  Download,
  Calendar,
  RefreshCw,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { studentService } from '../services/studentService';
import { billingService, SPP_MONTHS } from '../services/billingService';
import { excelService } from '../services/excelService';
import { Student, Bill, UnitType } from '../types/database';

interface RecapRow {
  student_id: string;
  student_name: string;
  nis: string | null;
  unit: UnitType;
  grade: string;
  administrative_status: string;
  spp_nominal: number;
  // Monthly SPP cell value
  sppMonths: Record<string, {
    status: 'Lunas' | 'Belum Lunas' | 'Belum Dibayar' | 'Bebas' | 'Akan Berlangsung';
    displayValue: string;
    paidDate?: string | null;
    remaining?: number;
  }>;
  // Non-SPP categories paid
  paid_perlengkapan: number;
  paid_peralatan: number;
  paid_kegiatan: number;
  paid_pembangunan: number;
  paid_ujian: number;
  paid_lainnya: number;
  phone: string | null;
}

export const PaymentRecapPage: React.FC = () => {
  const { selectedAcademicYearId, selectedAcademicYear, showToast, refreshKey } = useApp();

  const [recapData, setRecapData] = useState<RecapRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [unitFilter, setUnitFilter] = useState<'ALL' | 'SMP IT' | 'SMA IT'>('ALL');
  const [gradeFilter, setGradeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const loadRecap = async () => {
    if (!selectedAcademicYearId) return;
    setIsLoading(true);

    try {
      // 1. Fetch all students enrolled in this academic year
      const students = await studentService.getAllWithEnrollment({
        academicYearId: selectedAcademicYearId
      });

      // 2. Fetch all bills for this academic year
      const bills = await billingService.getBillsForAcademicYear(selectedAcademicYearId);

      // Group bills by student_id
      const billsByStudent: Record<string, Bill[]> = {};
      bills.forEach((b) => {
        if (!billsByStudent[b.student_id]) billsByStudent[b.student_id] = [];
        billsByStudent[b.student_id].push(b);
      });

      // Build rows
      const rows: RecapRow[] = students.map((s) => {
        const enr = s.current_enrollment;
        const sBills = billsByStudent[s.id] || [];

        // Determine monthly SPP nominal
        const sppBills = sBills.filter((b) => b.category?.name.toLowerCase().includes('spp'));
        const sppNominal = sppBills.length > 0 ? sppBills[0].amount : 0;

        // Populate 12 months
        const sppMonthsMap: RecapRow['sppMonths'] = {};

        SPP_MONTHS.forEach((month) => {
          const mBill = sppBills.find((b) => b.billing_period?.toLowerCase() === month.toLowerCase());
          if (!mBill) {
            sppMonthsMap[month] = {
              status: 'Belum Dibayar',
              displayValue: 'Belum Bayar'
            };
          } else if (mBill.calculated_status === 'Bebas') {
            sppMonthsMap[month] = {
              status: 'Bebas',
              displayValue: 'Free'
            };
          } else if (mBill.calculated_status === 'Lunas') {
            // Format payment date as DD/MM/YY
            let dateStr = 'Lunas';
            if (mBill.last_payment_date) {
              const d = new Date(mBill.last_payment_date);
              dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
            }
            sppMonthsMap[month] = {
              status: 'Lunas',
              displayValue: dateStr,
              paidDate: mBill.last_payment_date
            };
          } else if (mBill.calculated_status === 'Belum Lunas') {
            sppMonthsMap[month] = {
              status: 'Belum Lunas',
              displayValue: `Sisa Rp${((mBill.remaining_amount || 0) / 1000).toFixed(0)}k`,
              remaining: mBill.remaining_amount
            };
          } else {
            sppMonthsMap[month] = {
              status: 'Belum Dibayar',
              displayValue: 'Belum Bayar'
            };
          }
        });

        // Non-SPP payments calculation
        const getPaidForCat = (catPattern: string) => {
          const matchBills = sBills.filter((b) => b.category?.name.toLowerCase().includes(catPattern.toLowerCase()));
          return matchBills.reduce((sum, b) => sum + Number(b.total_paid || 0), 0);
        };

        return {
          student_id: s.id,
          student_name: s.full_name,
          nis: s.nis,
          unit: enr?.unit || 'SMP IT',
          grade: enr?.grade || '-',
          administrative_status: enr?.administrative_status || 'Mampu',
          spp_nominal: sppNominal,
          sppMonths: sppMonthsMap,
          paid_perlengkapan: getPaidForCat('Perlengkapan'),
          paid_peralatan: getPaidForCat('Peralatan'),
          paid_kegiatan: getPaidForCat('Kegiatan'),
          paid_pembangunan: getPaidForCat('Pembangunan'),
          paid_ujian: getPaidForCat('Ujian'),
          paid_lainnya: getPaidForCat('Lainnya'),
          phone: s.phone || null,
        };
      });

      setRecapData(rows);
    } catch (err: any) {
      console.error('Error loading recap:', err);
      showToast('Gagal memuat rekap pembayaran: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecap();
  }, [selectedAcademicYearId, refreshKey]);

  // Filter rows
  const filteredRows = recapData.filter((row) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !search ||
      row.student_name.toLowerCase().includes(q) ||
      (row.nis && row.nis.toLowerCase().includes(q)) ||
      (row.phone && row.phone.includes(q));

    const matchesUnit = unitFilter === 'ALL' || row.unit === unitFilter;
    const matchesGrade = gradeFilter === 'ALL' || row.grade === gradeFilter;
    const matchesStatus = statusFilter === 'ALL' || row.administrative_status === statusFilter;

    return matchesSearch && matchesUnit && matchesGrade && matchesStatus;
  });

  const handleExport = () => {
    if (filteredRows.length === 0) {
      showToast('Tidak ada data rekap untuk diexport', 'error');
      return;
    }

    const exportPrepared = filteredRows.map((r) => ({
      student_name: r.student_name,
      unit: r.unit,
      grade: r.grade,
      administrative_status: r.administrative_status,
      spp_nominal: r.spp_nominal,
      spp_juli: r.sppMonths['Juli']?.displayValue,
      spp_agustus: r.sppMonths['Agustus']?.displayValue,
      spp_september: r.sppMonths['September']?.displayValue,
      spp_oktober: r.sppMonths['Oktober']?.displayValue,
      spp_november: r.sppMonths['November']?.displayValue,
      spp_desember: r.sppMonths['Desember']?.displayValue,
      spp_januari: r.sppMonths['Januari']?.displayValue,
      spp_februari: r.sppMonths['Februari']?.displayValue,
      spp_maret: r.sppMonths['Maret']?.displayValue,
      spp_april: r.sppMonths['April']?.displayValue,
      spp_mei: r.sppMonths['Mei']?.displayValue,
      spp_juni: r.sppMonths['Juni']?.displayValue,
      paid_perlengkapan: r.paid_perlengkapan,
      paid_peralatan: r.paid_peralatan,
      paid_kegiatan: r.paid_kegiatan,
      paid_pembangunan: r.paid_pembangunan,
      paid_ujian: r.paid_ujian,
      paid_lainnya: r.paid_lainnya,
      phone: r.phone,
    }));

    excelService.exportRekapPembayaran(exportPrepared, selectedAcademicYear?.name || '2026-2027');
    showToast('Rekap pembayaran berhasil diexport ke format Excel acuan', 'success');
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">
            Rekap Pembayaran Siswa (Juli - Juni)
          </h3>
          <p className="text-xs text-slate-500">
            Tampilan matriks pembayaran identik dengan sheet PEMBAYARAN Excel acuan
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadRecap}
            disabled={isLoading}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm"
          >
            <Download className="w-4 h-4 text-gold-400" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama siswa atau NIS..."
            className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-slate-50/50"
          />
        </div>

        <div>
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value as any)}
            className="w-full py-2 px-3 text-xs font-medium rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
          >
            <option value="ALL">Semua Jenjang</option>
            <option value="SMP IT">SMP IT</option>
            <option value="SMA IT">SMA IT</option>
          </select>
        </div>

        <div>
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="w-full py-2 px-3 text-xs font-medium rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
          >
            <option value="ALL">Semua Kelas</option>
            <option value="VII">VII</option>
            <option value="VIII">VIII</option>
            <option value="IX">IX</option>
            <option value="X">X</option>
            <option value="XI">XI</option>
            <option value="XII">XII</option>
          </select>
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full py-2 px-3 text-xs font-medium rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
          >
            <option value="ALL">Semua Kategori</option>
            <option value="Mampu">Mampu</option>
            <option value="Yatim">Yatim</option>
            <option value="Dhuafa">Dhuafa</option>
            <option value="Beasiswa">Beasiswa</option>
            <option value="Rekomendasi">Rekomendasi</option>
          </select>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-2 text-[11px] font-semibold text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-emerald-100 border border-emerald-400"></span>
          <span>Lunas (Menampilkan Tanggal Transaksi Sebenarnya)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-amber-100 border border-amber-400"></span>
          <span>Belum Lunas (Bayar Parsial)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-rose-50 border border-rose-300"></span>
          <span>Belum Bayar</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-purple-100 border border-purple-400"></span>
          <span>Free (Bebas Biaya / Yatim / Beasiswa)</span>
        </span>
      </div>

      {/* Main Matrix Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-emerald-950 text-white font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3 w-10 text-center sticky left-0 z-20 bg-emerald-950">No</th>
                <th className="py-3 px-4 sticky left-10 z-20 bg-emerald-950 min-w-[180px]">Nama Siswa</th>
                <th className="py-3 px-3 text-center">Jenjang</th>
                <th className="py-3 px-3 text-center">Kelas</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">SPP/Bulan</th>

                {/* 12 Months SPP Columns */}
                {SPP_MONTHS.map((m) => (
                  <th key={m} className="py-3 px-3 text-center min-w-[95px] bg-emerald-900/80 border-l border-emerald-800">
                    {m}
                  </th>
                ))}

                {/* Non SPP Categories */}
                <th className="py-3 px-3 text-right bg-emerald-850/80 border-l border-emerald-800 min-w-[110px]">
                  Perlengkapan
                </th>
                <th className="py-3 px-3 text-right bg-emerald-850/80 min-w-[110px]">Peralatan</th>
                <th className="py-3 px-3 text-right bg-emerald-850/80 min-w-[110px]">Kegiatan</th>
                <th className="py-3 px-3 text-right bg-emerald-850/80 min-w-[110px]">Pembangunan</th>
                <th className="py-3 px-3 text-right bg-emerald-850/80 min-w-[90px]">Ujian</th>
                <th className="py-3 px-3 text-right bg-emerald-850/80 min-w-[90px]">Lainnya</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={24} className="py-16 text-center text-slate-400">
                    Memuat matriks rekap pembayaran...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={24} className="py-16 text-center text-slate-400">
                    Tidak ada siswa ditemukan yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, idx) => (
                  <tr key={row.student_id} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-3 text-center text-slate-400 font-bold sticky left-0 bg-white">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-slate-800 sticky left-10 bg-white">
                      {row.student_name}
                    </td>
                    <td className="py-2.5 px-3 text-center text-slate-600 font-semibold">{row.unit}</td>
                    <td className="py-2.5 px-3 text-center text-slate-700 font-semibold">{row.grade}</td>
                    <td className="py-2.5 px-3">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                        {row.administrative_status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-800">
                      Rp{Number(row.spp_nominal).toLocaleString('id-ID')}
                    </td>

                    {/* 12 Months Cells */}
                    {SPP_MONTHS.map((month) => {
                      const cell = row.sppMonths[month];
                      let cellClass = 'bg-rose-50/60 text-rose-700 font-normal';
                      if (cell.status === 'Lunas') {
                        cellClass = 'bg-emerald-50 text-emerald-800 font-bold';
                      } else if (cell.status === 'Belum Lunas') {
                        cellClass = 'bg-amber-50 text-amber-800 font-bold';
                      } else if (cell.status === 'Bebas') {
                        cellClass = 'bg-purple-50 text-purple-800 font-bold';
                      }

                      return (
                        <td
                          key={month}
                          className={`py-2 px-2 text-center text-[11px] border-l border-slate-100 ${cellClass}`}
                        >
                          {cell.displayValue}
                        </td>
                      );
                    })}

                    {/* Non-SPP Columns */}
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-700 border-l border-slate-100">
                      {row.paid_perlengkapan > 0 ? `Rp${row.paid_perlengkapan.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-700">
                      {row.paid_peralatan > 0 ? `Rp${row.paid_peralatan.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-700">
                      {row.paid_kegiatan > 0 ? `Rp${row.paid_kegiatan.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-700">
                      {row.paid_pembangunan > 0 ? `Rp${row.paid_pembangunan.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-700">
                      {row.paid_ujian > 0 ? `Rp${row.paid_ujian.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-700">
                      {row.paid_lainnya > 0 ? `Rp${row.paid_lainnya.toLocaleString('id-ID')}` : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
