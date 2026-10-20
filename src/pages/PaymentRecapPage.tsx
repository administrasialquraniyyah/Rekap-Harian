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
  AlertCircle,
  AlertTriangle,
  FileSpreadsheet,
  Edit3,
  X,
  Save,
  Check,
  HelpCircle
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { studentService } from '../services/studentService';
import { billingService, SPP_MONTHS } from '../services/billingService';
import { paymentService } from '../services/paymentService';
import { excelService } from '../services/excelService';
import { localStore } from '../services/dataStore';
import { Student, Bill, UnitType, BillStatus } from '../types/database';

interface SppCellData {
  status: 'Lunas' | 'Belum Lunas' | 'Belum Dibayar' | 'Bebas' | 'Akan Berlangsung';
  displayValue: string;
  paidDate?: string | null;
  remaining?: number;
  billId?: string;
  amount?: number;
}

interface RecapRow {
  student_id: string;
  student_name: string;
  nis: string | null;
  unit: UnitType;
  grade: string;
  administrative_status: string;
  spp_nominal: number;
  sppMonths: Record<string, SppCellData>;
  paid_perlengkapan: number;
  paid_peralatan: number;
  paid_kegiatan: number;
  paid_pembangunan: number;
  paid_ujian: number;
  paid_lainnya: number;
  phone: string | null;
}

export const PaymentRecapPage: React.FC = () => {
  const { selectedAcademicYearId, selectedAcademicYear, showToast, refreshKey, triggerRefresh } = useApp();

  const [recapData, setRecapData] = useState<RecapRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active month setting (default to Oktober as in T.A. 2026/2027)
  const [activeMonthLimit, setActiveMonthLimit] = useState<string>('Oktober');

  // Filters
  const [search, setSearch] = useState('');
  const [unitFilter, setUnitFilter] = useState<'ALL' | 'SMP IT' | 'SMA IT'>('ALL');
  const [gradeFilter, setGradeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [unpaidMonthFilter, setUnpaidMonthFilter] = useState<string>('ALL');

  // Export Unpaid SPP Modal State
  const [showUnpaidExportModal, setShowUnpaidExportModal] = useState<boolean>(false);
  const [modalMonthTarget, setModalMonthTarget] = useState<string>('Oktober');
  const [modalUnitTarget, setModalUnitTarget] = useState<'ALL' | 'SMP IT' | 'SMA IT'>('ALL');
  const [modalGradeTarget, setModalGradeTarget] = useState<string>('ALL');
  const [modalAccumulatePrevious, setModalAccumulatePrevious] = useState<boolean>(true);

  // Modal In-Cell Edit for SPP Month
  const [editingSpp, setEditingSpp] = useState<{
    student_id: string;
    student_name: string;
    month: string;
    spp_nominal: number;
    current_status: string;
    current_date: string;
    paid_amount: string;
  } | null>(null);

  // Modal In-Cell Edit for Non-SPP Category
  const [editingNonSpp, setEditingNonSpp] = useState<{
    student_id: string;
    student_name: string;
    category_name: string;
    current_paid: number;
    input_amount: string;
    payment_date: string;
  } | null>(null);

  const loadRecap = async () => {
    if (!selectedAcademicYearId) return;
    setIsLoading(true);

    try {
      const students = await studentService.getAllWithEnrollment({
        academicYearId: selectedAcademicYearId
      });

      const bills = await billingService.getBillsForAcademicYear(selectedAcademicYearId);

      const billsByStudent: Record<string, Bill[]> = {};
      bills.forEach((b) => {
        if (!billsByStudent[b.student_id]) billsByStudent[b.student_id] = [];
        billsByStudent[b.student_id].push(b);
      });

      const activeMonthIndex = SPP_MONTHS.indexOf(activeMonthLimit);

      const rows: RecapRow[] = students.map((s) => {
        const enr = s.current_enrollment;
        const sBills = billsByStudent[s.id] || [];

        const sppBills = sBills.filter((b) => b.category?.name.toLowerCase().includes('spp'));
        const sppNominal = sppBills.length > 0 ? sppBills[0].amount : 1335000;

        const sppMonthsMap: RecapRow['sppMonths'] = {};

        SPP_MONTHS.forEach((month, mIdx) => {
          const mBill = sppBills.find((b) => b.billing_period?.toLowerCase() === month.toLowerCase());
          const isUpcoming = mIdx > activeMonthIndex;

          if (!mBill) {
            sppMonthsMap[month] = {
              status: isUpcoming ? 'Akan Berlangsung' : 'Belum Dibayar',
              displayValue: isUpcoming ? 'Akan Berlangsung' : 'Belum Bayar',
              amount: sppNominal,
            };
          } else if (mBill.calculated_status === 'Bebas') {
            sppMonthsMap[month] = {
              status: 'Bebas',
              displayValue: 'Free',
              billId: mBill.id,
              amount: mBill.amount,
            };
          } else if (mBill.calculated_status === 'Lunas') {
            let dateStr = 'Lunas';
            if (mBill.last_payment_date) {
              const d = new Date(mBill.last_payment_date);
              dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
            }
            sppMonthsMap[month] = {
              status: 'Lunas',
              displayValue: dateStr,
              paidDate: mBill.last_payment_date,
              billId: mBill.id,
              amount: mBill.amount,
            };
          } else if (mBill.calculated_status === 'Belum Lunas') {
            sppMonthsMap[month] = {
              status: 'Belum Lunas',
              displayValue: `Sisa Rp${((mBill.remaining_amount || 0) / 1000).toFixed(0)}k`,
              remaining: mBill.remaining_amount,
              billId: mBill.id,
              amount: mBill.amount,
            };
          } else {
            // Unpaid
            sppMonthsMap[month] = {
              status: isUpcoming ? 'Akan Berlangsung' : 'Belum Dibayar',
              displayValue: isUpcoming ? 'Akan Berlangsung' : 'Belum Bayar',
              billId: mBill.id,
              amount: mBill.amount,
            };
          }
        });

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
  }, [selectedAcademicYearId, activeMonthLimit, refreshKey]);

  // Handle cell click on SPP Month
  const handleCellClickSpp = (row: RecapRow, month: string) => {
    const cell = row.sppMonths[month];
    const todayStr = new Date().toISOString().split('T')[0];

    setEditingSpp({
      student_id: row.student_id,
      student_name: row.student_name,
      month: month,
      spp_nominal: cell?.amount || row.spp_nominal,
      current_status: cell?.status || 'Belum Dibayar',
      current_date: cell?.paidDate || todayStr,
      paid_amount: String(cell?.amount || row.spp_nominal),
    });
  };

  // Save SPP In-Cell Edit
  // Save SPP In-Cell Edit
  const handleSaveSppEdit = async (status: BillStatus) => {
    if (!editingSpp || !selectedAcademicYearId) return;

    try {
      await paymentService.updateSppCell(editingSpp.student_id, selectedAcademicYearId, editingSpp.month, {
        status: status,
        paymentDate: editingSpp.current_date,
        amount: Number(editingSpp.paid_amount || editingSpp.spp_nominal),
      });

      showToast(`SPP ${editingSpp.month} untuk ${editingSpp.student_name} berhasil diperbarui!`, 'success');
      setEditingSpp(null);
      await loadRecap();
      triggerRefresh();
    } catch (err: any) {
      showToast('Gagal mengupdate cell: ' + err.message, 'error');
    }
  };

  // Handle cell click on Non-SPP (Perlengkapan, Peralatan, Kegiatan, etc.)
  const handleCellClickNonSpp = (row: RecapRow, categoryName: string, currentVal: number) => {
    const todayStr = new Date().toISOString().split('T')[0];
    setEditingNonSpp({
      student_id: row.student_id,
      student_name: row.student_name,
      category_name: categoryName,
      current_paid: currentVal,
      input_amount: String(currentVal || ''),
      payment_date: todayStr,
    });
  };

  // Save Non-SPP In-Cell Edit
  const handleSaveNonSppEdit = async () => {
    if (!editingNonSpp || !selectedAcademicYearId) return;

    try {
      const nominal = Number(editingNonSpp.input_amount || 0);
      await paymentService.updateNonSppCell(
        editingNonSpp.student_id,
        selectedAcademicYearId,
        editingNonSpp.category_name,
        nominal,
        editingNonSpp.payment_date
      );

      showToast(`Pembayaran ${editingNonSpp.category_name} untuk ${editingNonSpp.student_name} berhasil diupdate!`, 'success');
      setEditingNonSpp(null);
      await loadRecap();
      triggerRefresh();
    } catch (err: any) {
      showToast('Gagal menyimpan: ' + err.message, 'error');
    }
  };

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

    // Filter by unpaid SPP month
    let matchesUnpaidMonth = true;
    if (unpaidMonthFilter !== 'ALL') {
      const cell = row.sppMonths[unpaidMonthFilter];
      matchesUnpaidMonth = cell?.status === 'Belum Dibayar' || cell?.status === 'Belum Lunas';
    }

    return matchesSearch && matchesUnit && matchesGrade && matchesStatus && matchesUnpaidMonth;
  });

  const handleExportUnpaid = (
    targetMonth: string,
    targetUnit: string = 'ALL',
    targetGrade: string = 'ALL',
    accumulatePrevious: boolean = true
  ) => {
    const targetIdx = SPP_MONTHS.indexOf(targetMonth);
    const monthsToCheck = (accumulatePrevious && targetIdx !== -1)
      ? SPP_MONTHS.slice(0, targetIdx + 1)
      : [targetMonth];

    const listWithUnpaidDetails = recapData
      .map((r) => {
        const mUnit = targetUnit === 'ALL' || r.unit === targetUnit;
        const mGrade = targetGrade === 'ALL' || r.grade === targetGrade;
        if (!mUnit || !mGrade) return null;

        const unpaidMonths = monthsToCheck.filter((m) => {
          const cell = r.sppMonths[m];
          return cell?.status === 'Belum Dibayar' || cell?.status === 'Belum Lunas';
        });

        if (unpaidMonths.length === 0) return null;

        const totalArrears = unpaidMonths.reduce((sum, m) => {
          const cell = r.sppMonths[m];
          return sum + (cell?.amount || r.spp_nominal);
        }, 0);

        return {
          name: r.student_name,
          nis: r.nis,
          unit: r.unit,
          grade: r.grade,
          phone: r.phone,
          spp_nominal: r.spp_nominal,
          unpaid_months: unpaidMonths,
          unpaid_count: unpaidMonths.length,
          total_arrears: totalArrears,
          target_month: targetMonth,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (listWithUnpaidDetails.length === 0) {
      showToast(`Tidak ditemukan siswa yang menunggak SPP s.d. bulan ${targetMonth} untuk filter ini`, 'info');
      return;
    }

    excelService.exportUnpaidSppExcel(
      listWithUnpaidDetails,
      targetMonth,
      selectedAcademicYear?.name || '2026/2027'
    );
    showToast(`Berhasil mendownload Excel tagihan ${listWithUnpaidDetails.length} siswa menunggak s.d. bulan ${targetMonth}`, 'success');
  };

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
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-slate-800">
              Rekap Pembayaran Siswa (Juli - Juni)
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wide">
              ⚡ Klik Sel Untuk Edit Langsung
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Klik sel mana saja untuk mengisi tanggal pembayaran atau nominal, persis seperti mengisi di Excel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Active Month Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1 text-xs">
            <Calendar className="w-3.5 h-3.5 text-emerald-700" />
            <span className="text-slate-600 font-semibold">Bulan Berjalan:</span>
            <select
              value={activeMonthLimit}
              onChange={(e) => setActiveMonthLimit(e.target.value)}
              className="bg-transparent font-bold text-emerald-900 focus:outline-none cursor-pointer"
              title="Bulan setelahnya akan berstatus 'Akan Berlangsung' dan tidak dihitung tunggakan"
            >
              {SPP_MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={loadRecap}
            disabled={isLoading}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setShowUnpaidExportModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs"
            title="Export Excel Siswa yang belum bayar SPP per bulan tertentu"
          >
            <AlertCircle className="w-4 h-4 text-amber-200" />
            <span>Export Belum Bayar SPP</span>
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm"
          >
            <Download className="w-4 h-4 text-gold-400" />
            <span>Export Matriks Lengkap</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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

        <div>
          <select
            value={unpaidMonthFilter}
            onChange={(e) => setUnpaidMonthFilter(e.target.value)}
            className={`w-full py-2 px-3 text-xs font-bold rounded-xl border focus:outline-none focus:ring-2 focus:ring-amber-500 ${
              unpaidMonthFilter !== 'ALL'
                ? 'bg-amber-50 border-amber-300 text-amber-900 ring-1 ring-amber-300'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            <option value="ALL">Semua Status SPP</option>
            {SPP_MONTHS.map((m) => (
              <option key={m} value={m}>
                ⚠️ Belum Bayar SPP {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Indicator Banner when filtering by unpaid month */}
      {unpaidMonthFilter !== 'ALL' && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded-md">
                  Filter Aktif
                </span>
                <p className="text-sm font-bold text-amber-950">
                  Daftar Siswa Belum Bayar SPP Bulan {unpaidMonthFilter}
                </p>
              </div>
              <p className="text-xs text-amber-800 mt-0.5">
                Ditemukan <strong className="text-amber-950 underline">{filteredRows.length} siswa</strong> belum bayar. Data ini siap diexport ke Excel dengan nama, kelas, jenjang, dan nomor telepon orang tua.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => handleExportUnpaid(unpaidMonthFilter, unitFilter, gradeFilter, true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl shadow-xs transition"
            >
              <Download className="w-4 h-4 text-amber-200" />
              <span>Download Excel Tagihan SPP ({filteredRows.length} Siswa)</span>
            </button>
            <button
              onClick={() => setUnpaidMonthFilter('ALL')}
              className="px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-200/50 rounded-xl transition"
            >
              Reset Filter
            </button>
          </div>
        </div>
      )}

      {/* Legend & Hint */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-2 text-[11px] font-semibold text-slate-500">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-emerald-100 border border-emerald-400"></span>
            <span>Lunas (Tanggal Bayar)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-rose-50 border border-rose-300"></span>
            <span>Belum Bayar (Bulan Berjalan)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-slate-100 border border-slate-300"></span>
            <span>Akan Berlangsung (Bulan Belum Aktif - Bukan Tunggakan)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-purple-100 border border-purple-400"></span>
            <span>Free (Bebas / Yatim)</span>
          </span>
        </div>

        <span className="text-emerald-800 font-bold hidden md:inline">
          💡 Klik pada kotak mana pun untuk mengubah status atau menginput tanggal
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

                    {/* 12 Months Cells - CLICK TO EDIT DIRECTLY */}
                    {SPP_MONTHS.map((month) => {
                      const cell = row.sppMonths[month];
                      let cellClass = 'bg-rose-50/70 text-rose-700 font-normal hover:bg-rose-100 hover:ring-2 hover:ring-rose-400';
                      if (cell.status === 'Lunas') {
                        cellClass = 'bg-emerald-50 text-emerald-800 font-bold hover:bg-emerald-100 hover:ring-2 hover:ring-emerald-400';
                      } else if (cell.status === 'Belum Lunas') {
                        cellClass = 'bg-amber-50 text-amber-800 font-bold hover:bg-amber-100 hover:ring-2 hover:ring-amber-400';
                      } else if (cell.status === 'Bebas') {
                        cellClass = 'bg-purple-50 text-purple-800 font-bold hover:bg-purple-100 hover:ring-2 hover:ring-purple-400';
                      } else if (cell.status === 'Akan Berlangsung') {
                        cellClass = 'bg-slate-50/80 text-slate-400 font-normal italic hover:bg-slate-100 hover:ring-2 hover:ring-slate-300';
                      }

                      return (
                        <td
                          key={month}
                          onClick={() => handleCellClickSpp(row, month)}
                          title={`Klik untuk edit pembayaran SP ${month} - ${row.student_name}`}
                          className={`py-2 px-2 text-center text-[11px] border-l border-slate-100 cursor-pointer transition select-none ${cellClass}`}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span>{cell.displayValue}</span>
                          </div>
                        </td>
                      );
                    })}

                    {/* Non-SPP Columns - CLICK TO EDIT DIRECTLY */}
                    <td
                      onClick={() => handleCellClickNonSpp(row, 'Perlengkapan', row.paid_perlengkapan)}
                      title={`Klik untuk ubah pembayaran Perlengkapan`}
                      className="py-2.5 px-3 text-right font-semibold text-slate-700 border-l border-slate-100 cursor-pointer hover:bg-emerald-50 hover:ring-2 hover:ring-emerald-400 transition"
                    >
                      {row.paid_perlengkapan > 0 ? `Rp${row.paid_perlengkapan.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td
                      onClick={() => handleCellClickNonSpp(row, 'Peralatan', row.paid_peralatan)}
                      title={`Klik untuk ubah pembayaran Peralatan`}
                      className="py-2.5 px-3 text-right font-semibold text-slate-700 cursor-pointer hover:bg-emerald-50 hover:ring-2 hover:ring-emerald-400 transition"
                    >
                      {row.paid_peralatan > 0 ? `Rp${row.paid_peralatan.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td
                      onClick={() => handleCellClickNonSpp(row, 'Kegiatan', row.paid_kegiatan)}
                      title={`Klik untuk ubah pembayaran Kegiatan`}
                      className="py-2.5 px-3 text-right font-semibold text-slate-700 cursor-pointer hover:bg-emerald-50 hover:ring-2 hover:ring-emerald-400 transition"
                    >
                      {row.paid_kegiatan > 0 ? `Rp${row.paid_kegiatan.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td
                      onClick={() => handleCellClickNonSpp(row, 'Pembangunan', row.paid_pembangunan)}
                      title={`Klik untuk ubah pembayaran Pembangunan`}
                      className="py-2.5 px-3 text-right font-semibold text-slate-700 cursor-pointer hover:bg-emerald-50 hover:ring-2 hover:ring-emerald-400 transition"
                    >
                      {row.paid_pembangunan > 0 ? `Rp${row.paid_pembangunan.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td
                      onClick={() => handleCellClickNonSpp(row, 'Ujian', row.paid_ujian)}
                      title={`Klik untuk ubah pembayaran Ujian`}
                      className="py-2.5 px-3 text-right font-semibold text-slate-700 cursor-pointer hover:bg-emerald-50 hover:ring-2 hover:ring-emerald-400 transition"
                    >
                      {row.paid_ujian > 0 ? `Rp${row.paid_ujian.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td
                      onClick={() => handleCellClickNonSpp(row, 'Lainnya', row.paid_lainnya)}
                      title={`Klik untuk ubah pembayaran Lainnya`}
                      className="py-2.5 px-3 text-right font-semibold text-slate-700 cursor-pointer hover:bg-emerald-50 hover:ring-2 hover:ring-emerald-400 transition"
                    >
                      {row.paid_lainnya > 0 ? `Rp${row.paid_lainnya.toLocaleString('id-ID')}` : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL IN-CELL EDIT: SPP MONTH */}
      {editingSpp && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  Edit Pembayaran Sel
                </span>
                <h4 className="text-base font-bold text-slate-800 mt-1">
                  {editingSpp.student_name}
                </h4>
                <p className="text-xs text-slate-500 font-medium">
                  Tagihan: <strong>SPP Bulan {editingSpp.month}</strong> (Tarif: Rp{editingSpp.spp_nominal.toLocaleString('id-ID')})
                </p>
              </div>
              <button
                onClick={() => setEditingSpp(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tanggal Pembayaran (Muncul Pada Sel) *
                </label>
                <input
                  type="date"
                  value={editingSpp.current_date}
                  onChange={(e) => setEditingSpp({ ...editingSpp, current_date: e.target.value })}
                  className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nominal Dibayar (Rp)
                </label>
                <input
                  type="number"
                  value={editingSpp.paid_amount}
                  onChange={(e) => setEditingSpp({ ...editingSpp, paid_amount: e.target.value })}
                  placeholder={String(editingSpp.spp_nominal)}
                  className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Jika sama dengan tarif (Rp{editingSpp.spp_nominal.toLocaleString('id-ID')}), status menjadi Lunas.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveSppEdit('Lunas')}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-xs"
                >
                  <Check className="w-4 h-4 text-gold-400" />
                  <span>Simpan Lunas (Tampilkan Tanggal)</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveSppEdit('Bebas')}
                    className="py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 font-bold text-xs rounded-xl border border-purple-200 transition"
                  >
                    Tandai Free / Bebas
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveSppEdit('Belum Dibayar')}
                    className="py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition"
                  >
                    Reset Belum Bayar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IN-CELL EDIT: NON-SPP CATEGORY */}
      {editingNonSpp && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  Edit Pembayaran Langsung
                </span>
                <h4 className="text-base font-bold text-slate-800 mt-1">
                  {editingNonSpp.student_name}
                </h4>
                <p className="text-xs text-slate-500 font-medium">
                  Item: <strong>{editingNonSpp.category_name}</strong>
                </p>
              </div>
              <button
                onClick={() => setEditingNonSpp(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nominal Pembayaran Diterima (Rp) *
                </label>
                <input
                  type="number"
                  value={editingNonSpp.input_amount}
                  onChange={(e) => setEditingNonSpp({ ...editingNonSpp, input_amount: e.target.value })}
                  placeholder="Contoh: 2900000"
                  className="w-full text-sm font-black px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tanggal Pembayaran
                </label>
                <input
                  type="date"
                  value={editingNonSpp.payment_date}
                  onChange={(e) => setEditingNonSpp({ ...editingNonSpp, payment_date: e.target.value })}
                  className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setEditingNonSpp({ ...editingNonSpp, input_amount: '0' })}
                  className="px-3 py-2 text-rose-600 hover:bg-rose-50 text-xs font-semibold rounded-xl transition"
                >
                  Reset Rp0
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingNonSpp(null)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 text-xs font-semibold rounded-xl transition"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNonSppEdit}
                    className="px-5 py-2 bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
                  >
                    Simpan Nilai
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EXPORT SISWA BELUM BAYAR SPP */}
      {showUnpaidExportModal && (() => {
        const targetIdx = SPP_MONTHS.indexOf(modalMonthTarget);
        const monthsToCheck = (modalAccumulatePrevious && targetIdx !== -1)
          ? SPP_MONTHS.slice(0, targetIdx + 1)
          : [modalMonthTarget];

        const matchingStudents = recapData
          .map((r) => {
            const mUnit = modalUnitTarget === 'ALL' || r.unit === modalUnitTarget;
            const mGrade = modalGradeTarget === 'ALL' || r.grade === modalGradeTarget;
            if (!mUnit || !mGrade) return null;

            const unpaidMonths = monthsToCheck.filter((m) => {
              const cell = r.sppMonths[m];
              return cell?.status === 'Belum Dibayar' || cell?.status === 'Belum Lunas';
            });

            if (unpaidMonths.length === 0) return null;

            const totalArrears = unpaidMonths.reduce((sum, m) => {
              const cell = r.sppMonths[m];
              return sum + (cell?.amount || r.spp_nominal);
            }, 0);

            return {
              name: r.student_name,
              nis: r.nis,
              unit: r.unit,
              grade: r.grade,
              phone: r.phone,
              spp_nominal: r.spp_nominal,
              unpaid_months: unpaidMonths,
              unpaid_count: unpaidMonths.length,
              total_arrears: totalArrears,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);

        const modalMatchingCount = matchingStudents.length;
        const totalUnpaidMonthsCount = matchingStudents.reduce((sum, s) => sum + s.unpaid_count, 0);
        const totalUnpaidNominalSum = matchingStudents.reduce((sum, s) => sum + s.total_arrears, 0);

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-800">
                      Export Tagihan Tunggakan SPP
                    </h4>
                    <p className="text-xs text-slate-500">
                      Download file Excel daftar tagihan siswa beserta akumulasi bulan tertunggak
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowUnpaidExportModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="py-4 space-y-4">
                {/* Target Bulan */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Pilih Posisi Bulan SPP Yang Ditagihkan *
                  </label>
                  <select
                    value={modalMonthTarget}
                    onChange={(e) => setModalMonthTarget(e.target.value)}
                    className="w-full text-sm font-bold px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  >
                    {SPP_MONTHS.map((m) => (
                      <option key={m} value={m}>
                        Bulan SPP: {m}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filter Jenjang & Kelas */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Jenjang
                    </label>
                    <select
                      value={modalUnitTarget}
                      onChange={(e) => setModalUnitTarget(e.target.value as any)}
                      className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    >
                      <option value="ALL">Semua Jenjang</option>
                      <option value="SMP IT">SMP IT</option>
                      <option value="SMA IT">SMA IT</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Kelas
                    </label>
                    <select
                      value={modalGradeTarget}
                      onChange={(e) => setModalGradeTarget(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
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
                </div>

                {/* Akumulasi Bulan Sebelumnya Toggle */}
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="accumulatePrev"
                    checked={modalAccumulatePrevious}
                    onChange={(e) => setModalAccumulatePrevious(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-emerald-800 rounded focus:ring-emerald-700 cursor-pointer"
                  />
                  <label htmlFor="accumulatePrev" className="text-xs text-amber-950 font-medium cursor-pointer">
                    <span className="font-bold block text-slate-800">
                      Akumulasikan dengan tunggakan bulan-bulan sebelumnya (Rekomendasi)
                    </span>
                    <span className="text-[11px] text-slate-600 block mt-0.5">
                      Siswa yang menunggak di bulan {modalMonthTarget} maupun bulan sebelumnya ({monthsToCheck.join(', ')}) akan dihitung total akumulasi tagihannya di Excel.
                    </span>
                  </label>
                </div>

                {/* Real-time Statistics Summary */}
                <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block uppercase">Siswa Menunggak</span>
                    <span className="text-base font-black text-rose-600">{modalMatchingCount} Siswa</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block uppercase">Bulan Tertunggak</span>
                    <span className="text-base font-black text-slate-800">{totalUnpaidMonthsCount} Bulan</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block uppercase">Total Tagihan SPP</span>
                    <span className="text-sm font-black text-emerald-800">
                      Rp{totalUnpaidNominalSum.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                {/* Preview sample students */}
                {matchingStudents.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                      Contoh Siswa Terfilter ({matchingStudents.length} siswa siap diexport):
                    </p>
                    <div className="max-h-28 overflow-y-auto space-y-1 pr-1 text-xs">
                      {matchingStudents.slice(0, 4).map((s, idx) => (
                        <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-slate-800">{s.name}</span>
                            <span className="text-[10px] text-slate-500 ml-1.5">({s.unit} · Kelas {s.grade})</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded font-bold mr-1.5">
                              {s.unpaid_months.join(', ')}
                            </span>
                            <span className="font-black text-slate-700">
                              Rp{s.total_arrears.toLocaleString('id-ID')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUnpaidExportModal(false)}
                  className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 text-xs font-semibold rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={modalMatchingCount === 0}
                  onClick={() => {
                    handleExportUnpaid(modalMonthTarget, modalUnitTarget, modalGradeTarget, modalAccumulatePrevious);
                    setShowUnpaidExportModal(false);
                  }}
                  className={`flex items-center gap-2 px-5 py-2.5 text-white font-bold text-xs rounded-xl shadow-xs transition ${
                    modalMatchingCount > 0
                      ? 'bg-amber-600 hover:bg-amber-700 cursor-pointer'
                      : 'bg-slate-300 cursor-not-allowed'
                  }`}
                >
                  <Download className="w-4 h-4" />
                  <span>Download Excel Tagihan SPP ({modalMatchingCount} Siswa)</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
