import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Search,
  Filter,
  Download,
  Calendar,
  Eye,
  CheckCircle2,
  X,
  FileSpreadsheet,
  ChevronRight,
  TrendingDown,
  Layers
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { arrearsService } from '../services/arrearsService';
import { excelService } from '../services/excelService';
import { StudentCrossYearArrears, StudentYearlyArrears } from '../types/database';

export const CrossYearArrearsPage: React.FC = () => {
  const { academicYears, selectedAcademicYearId, showToast, refreshKey } = useApp();

  const [arrearsData, setArrearsData] = useState<StudentCrossYearArrears[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [academicYearFilter, setAcademicYearFilter] = useState<string>('ALL'); // 'ALL' = Semua Tahun Ajaran!
  const [unitFilter, setUnitFilter] = useState<'ALL' | 'SMP IT' | 'SMA IT'>('ALL');
  const [gradeFilter, setGradeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'menunggak' | 'lunas'>('menunggak');
  const [search, setSearch] = useState('');

  // Modal Detail Rincian Tunggakan
  const [selectedStudentArrears, setSelectedStudentArrears] = useState<StudentCrossYearArrears | null>(null);

  const loadArrears = async () => {
    setIsLoading(true);
    try {
      const data = await arrearsService.getCrossYearArrears({
        academicYearId: academicYearFilter === 'ALL' ? 'ALL' : academicYearFilter,
        unit: unitFilter,
        grade: gradeFilter,
        search: search.trim() || undefined,
      });

      setArrearsData(data);
    } catch (err: any) {
      console.error('Error loading arrears:', err);
      showToast('Gagal memuat rekap tunggakan: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadArrears();
  }, [academicYearFilter, unitFilter, gradeFilter, search, refreshKey]);

  // Filter by payment status (Menunggak vs Lunas)
  const filteredData = arrearsData.filter((item) => {
    if (statusFilter === 'menunggak') return item.grand_total_arrears > 0;
    if (statusFilter === 'lunas') return item.grand_total_arrears === 0;
    return true;
  });

  // Calculate summary metrics
  const totalArrearsSum = filteredData.reduce((sum, item) => sum + item.grand_total_arrears, 0);
  const totalStudentsWithArrears = filteredData.filter((i) => i.grand_total_arrears > 0).length;

  const handleExport = () => {
    if (filteredData.length === 0) {
      showToast('Tidak ada data tunggakan untuk diexport', 'error');
      return;
    }

    const exportRows = filteredData.map((item) => {
      const yearNames = item.years.map((y) => `${y.academic_year_name} (Rp${y.remaining_arrears.toLocaleString('id-ID')})`).join('; ');
      return {
        nis: item.student.nis,
        student_name: item.student.full_name,
        unit: item.current_unit || '-',
        grade: item.current_grade || '-',
        academic_years: yearNames || 'T.A. Aktif',
        total_bills: item.grand_total_bills,
        total_paid: item.grand_total_paid,
        total_arrears: item.grand_total_arrears,
        details: item.years.map((y) => `${y.academic_year_name}: ${y.unpaid_bills_count} tagihan tertunggak`).join(', ')
      };
    });

    excelService.exportRekapTunggakan(exportRows, `Rekap_Tunggakan_${academicYearFilter === 'ALL' ? 'Semua_Tahun' : 'Tahun_Tertentu'}`);
    showToast('Rekap tunggakan berhasil diexport ke Excel', 'success');
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full">
            Fitur Utama Lintas Tahun
          </span>
          <h3 className="text-lg font-bold text-slate-800 mt-1">
            Rekap Tunggakan Siswa Lintas Tahun Ajaran
          </h3>
          <p className="text-xs text-slate-500">
            Perhitungan akurat sisa tagihan dari tahun-tahun sebelumnya tanpa duplikasi
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm"
          >
            <Download className="w-4 h-4 text-gold-400" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Nilai Tunggakan</p>
          <h4 className="text-2xl font-black text-rose-600 mt-1">
            Rp{totalArrearsSum.toLocaleString('id-ID')}
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">Akumulasi seluruh siswa tertampil</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Jumlah Siswa Menunggak</p>
          <h4 className="text-2xl font-black text-slate-800 mt-1">
            {totalStudentsWithArrears} <span className="text-xs font-normal text-slate-500">siswa</span>
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">Memiliki sisa tagihan &gt; Rp0</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Mode Periode</p>
          <h4 className="text-lg font-black text-emerald-800 mt-1 flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600" />
            <span>{academicYearFilter === 'ALL' ? 'Semua Tahun Ajaran' : 'Tahun Ajaran Dipilih'}</span>
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">Riwayat otomatis terhubung</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Search */}
        <div className="relative lg:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama siswa atau NIS..."
            className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-slate-50/50"
          />
        </div>

        {/* Academic Year Choice: INCLUDING 'SEMUA TAHUN AJARAN' */}
        <div>
          <select
            value={academicYearFilter}
            onChange={(e) => setAcademicYearFilter(e.target.value)}
            className="w-full py-2 px-3 text-xs font-bold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-emerald-50 text-emerald-950"
          >
            <option value="ALL">★ Semua Tahun Ajaran (Lintas Tahun)</option>
            {academicYears.map((y) => (
              <option key={y.id} value={y.id}>
                T.A. {y.name}
              </option>
            ))}
          </select>
        </div>

        {/* Jenjang */}
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

        {/* Status Pembayaran */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full py-2 px-3 text-xs font-medium rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
          >
            <option value="menunggak">Hanya Yang Menunggak</option>
            <option value="ALL">Semua (Termasuk Lunas)</option>
            <option value="lunas">Hanya Yang Lunas</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <th className="py-3.5 px-4 w-12 text-center">No</th>
                <th className="py-3.5 px-4">Nama Siswa</th>
                <th className="py-3.5 px-4">NIS</th>
                <th className="py-3.5 px-4">Jenjang & Kelas</th>
                <th className="py-3.5 px-4">Rincian Per Tahun Ajaran</th>
                <th className="py-3.5 px-4 text-right">Total Tagihan</th>
                <th className="py-3.5 px-4 text-right">Total Pembayaran</th>
                <th className="py-3.5 px-4 text-right">Total Tunggakan</th>
                <th className="py-3.5 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400">
                    Memuat data tunggakan lintas tahun...
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400">
                    Tidak ditemukan data siswa dengan kriteria filter tersebut.
                  </td>
                </tr>
              ) : (
                filteredData.map((item, idx) => (
                  <tr key={item.student.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 text-center text-slate-400 font-bold">{idx + 1}</td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {item.student.full_name}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                      {item.student.nis || '-'}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {item.current_unit || 'SMP IT'} · Kelas {item.current_grade || '-'}
                    </td>
                    <td className="py-3 px-4">
                      {/* Breakdown pills per academic year */}
                      <div className="flex flex-wrap gap-1.5">
                        {item.years.map((y) => (
                          <span
                            key={y.academic_year_id}
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              y.remaining_arrears > 0
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            <span>{y.academic_year_name}:</span>
                            <span>Rp{y.remaining_arrears.toLocaleString('id-ID')}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-800">
                      Rp{item.grand_total_bills.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                      Rp{item.grand_total_paid.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-rose-600 text-sm">
                      Rp{item.grand_total_arrears.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setSelectedStudentArrears(item)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Lihat Rincian</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Detail Asal Tunggakan Setiap Tahun */}
      {selectedStudentArrears && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  Rincian Asal Tunggakan Lintas Tahun
                </span>
                <h4 className="text-lg font-black text-slate-800 mt-1">
                  {selectedStudentArrears.student.full_name}
                </h4>
                <p className="text-xs text-slate-500">
                  NIS: {selectedStudentArrears.student.nis || '-'} · Kelas {selectedStudentArrears.current_grade || '-'} ({selectedStudentArrears.current_unit || 'SMP IT'})
                </p>
              </div>
              <button
                onClick={() => setSelectedStudentArrears(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Total Arrears Banner */}
            <div className="my-4 p-4 bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-200 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-rose-800 uppercase tracking-wide">
                  Total Seluruh Tunggakan Siswa
                </p>
                <p className="text-2xl font-black text-rose-700 mt-0.5">
                  Rp{selectedStudentArrears.grand_total_arrears.toLocaleString('id-ID')}
                </p>
              </div>
              <div className="text-right text-xs">
                <p className="text-slate-500">Total Tagihan: <strong>Rp{selectedStudentArrears.grand_total_bills.toLocaleString('id-ID')}</strong></p>
                <p className="text-emerald-700 font-semibold">Total Terbayar: <strong>Rp{selectedStudentArrears.grand_total_paid.toLocaleString('id-ID')}</strong></p>
              </div>
            </div>

            {/* Breakdown per year */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {selectedStudentArrears.years.map((year) => (
                <div key={year.academic_year_id} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-xs text-slate-800">
                        Tahun Ajaran {year.academic_year_name} (Kelas {year.grade})
                      </h5>
                      <p className="text-[11px] text-slate-500">
                        {year.unpaid_bills_count} tagihan belum lunas
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-rose-600">
                        Tunggakan: Rp{year.remaining_arrears.toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>

                  {/* List of bills in this year */}
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-white text-slate-400 font-bold border-b border-slate-100 text-[10px] uppercase">
                        <th className="py-2 px-3">Item Tagihan</th>
                        <th className="py-2 px-3 text-right">Nominal</th>
                        <th className="py-2 px-3 text-right">Terbayar</th>
                        <th className="py-2 px-3 text-right">Sisa Tunggakan</th>
                        <th className="py-2 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {year.bills_detail.map((b) => (
                        <tr key={b.bill_id} className={b.remaining > 0 ? 'bg-rose-50/20' : 'bg-white'}>
                          <td className="py-2 px-3 font-semibold text-slate-800">
                            {b.category_name} {b.billing_period ? `(${b.billing_period})` : ''}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-600">
                            Rp{b.amount.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2 px-3 text-right text-emerald-700 font-medium">
                            Rp{b.paid.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-rose-600">
                            Rp{b.remaining.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                b.status === 'Lunas' || b.status === 'Bebas'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : b.status === 'Belum Lunas'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {b.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedStudentArrears(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                Tutup Rincian
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
