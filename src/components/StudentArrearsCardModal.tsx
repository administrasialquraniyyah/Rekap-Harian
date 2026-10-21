import React, { useState } from 'react';
import {
  X,
  Printer,
  Camera,
  Copy,
  Check,
  Calendar,
  Phone,
  Building2,
  Layers,
  ListOrdered
} from 'lucide-react';
import { StudentCrossYearArrears } from '../types/database';
import html2canvas from 'html2canvas';
import logoImg from '../assets/logo.png';

interface StudentArrearsCardModalProps {
  studentArrears: StudentCrossYearArrears;
  onClose: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const SPP_MONTH_ORDER = [
  'juli', 'agustus', 'september', 'oktober', 'november', 'desember',
  'januari', 'februari', 'maret', 'april', 'mei', 'juni'
];

const SHORT_MONTHS: Record<string, string> = {
  juli: 'Jul',
  agustus: 'Ags',
  september: 'Sep',
  oktober: 'Okt',
  november: 'Nov',
  desember: 'Des',
  januari: 'Jan',
  februari: 'Feb',
  maret: 'Mar',
  april: 'Apr',
  mei: 'Mei',
  juni: 'Jun'
};

export const StudentArrearsCardModal: React.FC<StudentArrearsCardModalProps> = ({
  studentArrears,
  onClose,
  showToast,
}) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>('compact');
  const [copied, setCopied] = useState(false);

  const student = studentArrears.student;
  const grandTotal = studentArrears.grand_total_arrears;
  const isLunas = grandTotal === 0;

  // Format today's date in Indonesian
  const todayFormatted = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date());

  // Download High-Res Screenshot as PNG
  const handleDownloadImage = async () => {
    const cardElement = document.getElementById('student-arrears-printable-card');
    if (!cardElement) return;

    setIsCapturing(true);
    try {
      const canvas = await html2canvas(cardElement, {
        scale: 2, // High resolution for crisp text & borders
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const cleanName = student.full_name.replace(/[^a-zA-Z0-9]/g, '_');
      link.download = `Kartu_Tunggakan_${cleanName}.png`;
      link.href = dataUrl;
      link.click();
      showToast('Gambar kartu tunggakan berhasil didownload (PNG)!', 'success');
    } catch (err: any) {
      console.error('Failed to capture card:', err);
      showToast('Gagal membuat gambar kartu: ' + err.message, 'error');
    } finally {
      setIsCapturing(false);
    }
  };

  // Print or Save as PDF
  const handlePrintPdf = () => {
    window.print();
  };

  // Copy structured message for WhatsApp
  const handleCopyWhatsApp = () => {
    let text = `*SURAT RINCIAN TUNGGAKAN SISWA*\n`;
    text += `*YAYASAN AL-QUR'ANIYYAH*\n`;
    text += `_SMP IT & SMA IT Al-Qur'aniyyah_\n`;
    text += `----------------------------------------\n`;
    text += `Nama Siswa : *${student.full_name}*\n`;
    text += `NIS        : ${student.nis || '-'}\n`;
    text += `Jenjang/Kls: ${studentArrears.current_unit || 'SMP IT'} · Kelas ${studentArrears.current_grade || '-'}\n`;
    text += `----------------------------------------\n\n`;
    text += `Rincian kewajiban yang masih tercatat:\n`;

    studentArrears.years.forEach((y) => {
      const unpaidItems = y.bills_detail.filter((b) => b.remaining > 0);
      if (unpaidItems.length > 0) {
        text += `\n📌 *TA ${y.academic_year_name} (Kelas ${y.grade})*\n`;
        unpaidItems.forEach((b) => {
          text += ` • ${b.category_name}${b.billing_period ? ` (${b.billing_period})` : ''}: Rp${b.remaining.toLocaleString('id-ID')}\n`;
        });
        text += `   _Subtotal: Rp${y.remaining_arrears.toLocaleString('id-ID')}_\n`;
      }
    });

    text += `\n========================================\n`;
    text += `*TOTAL SISA TUNGGAKAN: Rp${grandTotal.toLocaleString('id-ID')}*\n`;
    text += `========================================\n\n`;
    text += `*Rekening Pembayaran Sekolah:*\n`;
    text += `Bank Syariah Indonesia (BSI)\n`;
    text += `No. Rek : *7110256118*\n`;
    text += `A.n.    : *Yayasan Al-Qur'aniyyah*\n`;
    text += `Konfirmasi Bukti Transfer: *0857-1723-5374* (Ust. Nasrulloh)\n\n`;
    text += `Jazakumullahu khairan. 🙏`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast('Teks rincian berhasil disalin untuk WhatsApp!', 'success');
    setTimeout(() => setCopied(false), 3000);
  };

  const isSpp = (b: { category_name: string }) => {
    const name = b.category_name.toLowerCase();
    return name.includes('spp') || name.includes('syahriyyah');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-slate-100 rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-300 max-h-[96vh] flex flex-col overflow-hidden my-auto">
        
        {/* Top Control Bar (Hidden on print) */}
        <div className="bg-white px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0 no-print">
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-slate-800">
              Kartu Rincian: <span className="text-emerald-900">{student.full_name}</span>
            </h4>
            <p className="text-[10px] text-slate-400">Siap Screenshot WhatsApp &amp; Cetak PDF 1 Halaman</p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* View Mode: Compact vs Detailed */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                onClick={() => setViewMode('compact')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition ${
                  viewMode === 'compact'
                    ? 'bg-white text-emerald-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Tampilan ringkas 1 halaman (SPP 1 baris + tracker bulanan)"
              >
                <Layers className="w-3 h-3 text-emerald-700" />
                <span>Ringkas (1 Lembar)</span>
              </button>
              <button
                onClick={() => setViewMode('detailed')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition ${
                  viewMode === 'detailed'
                    ? 'bg-white text-emerald-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Tampilkan semua bulan satu per satu"
              >
                <ListOrdered className="w-3 h-3 text-emerald-700" />
                <span>Rinci Per Bulan</span>
              </button>
            </div>

            {/* Toggle view: All vs Unpaid only */}
            <button
              onClick={() => setOnlyUnpaid(!onlyUnpaid)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition border ${
                onlyUnpaid
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title="Filter tampilan: Hanya yang belum lunas"
            >
              {onlyUnpaid ? '⚠️ Hanya Menunggak' : 'Semua Tagihan'}
            </button>

            {/* Copy WA Message */}
            <button
              onClick={handleCopyWhatsApp}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-bold transition border border-slate-200"
              title="Salin ringkasan pesan singkat untuk WhatsApp"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Tersalin' : 'Salin WA'}</span>
            </button>

            {/* Download as Image (PNG) */}
            <button
              onClick={handleDownloadImage}
              disabled={isCapturing}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold transition shadow-2xs disabled:opacity-50"
              title="Download gambar kartu proporsional untuk dikirim ke WhatsApp"
            >
              <Camera className={`w-3.5 h-3.5 ${isCapturing ? 'animate-spin' : ''}`} />
              <span>{isCapturing ? 'Proses...' : 'Download PNG'}</span>
            </button>

            {/* Print / Export PDF */}
            <button
              onClick={handlePrintPdf}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-[11px] font-bold transition shadow-2xs"
              title="Cetak langsung atau simpan sebagai PDF A4"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / PDF</span>
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition"
              title="Tutup Modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Card Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 bg-slate-200/50">
          
          {/* THE OFFICIAL CARD (TARGET FOR SCREENSHOT & PRINT) */}
          <div
            id="student-arrears-printable-card"
            className="bg-white max-w-2xl w-full mx-auto p-5 sm:p-6 rounded-2xl border border-slate-300 shadow-sm relative overflow-hidden text-slate-800"
          >
            {/* Watermark Stamp (Lunas / Belum Lunas) */}
            <div className="absolute right-6 top-20 pointer-events-none opacity-15 rotate-[-12deg] select-none">
              <div
                className={`border-3 border-dashed rounded-xl px-4 py-1.5 text-xl font-black uppercase tracking-widest ${
                  isLunas ? 'border-emerald-600 text-emerald-600' : 'border-rose-600 text-rose-600'
                }`}
              >
                {isLunas ? 'LUNAS' : 'BELUM LUNAS'}
              </div>
            </div>

            {/* Kop Surat Ramping (Tidak Menumpuk) */}
            <div className="border-b border-emerald-900/40 pb-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src={logoImg}
                    alt="Logo Al-Qur'aniyyah"
                    className="w-12 h-12 object-contain shrink-0"
                    crossOrigin="anonymous"
                  />
                  <div>
                    <h2 className="text-xs sm:text-sm font-black text-emerald-950 uppercase tracking-wide leading-tight">
                      Yayasan Pendidikan Islam Al-Qur'aniyyah
                    </h2>
                    <p className="text-[11px] font-semibold text-slate-600 leading-tight mt-0.5">
                      Pondok Pesantren · SMP IT &amp; SMA IT Al-Qur'aniyyah · Pondok Aren, Tangsel
                    </p>
                  </div>
                </div>

                <div className="text-right text-[10px] text-slate-500 shrink-0">
                  <p className="font-semibold text-slate-700">Tanggal Dokumen:</p>
                  <p className="font-bold text-slate-800 text-[11px]">{todayFormatted}</p>
                </div>
              </div>

              {/* Decorative green and gold line */}
              <div className="w-full flex h-0.5 mt-2 rounded-full overflow-hidden">
                <div className="w-3/4 bg-emerald-800"></div>
                <div className="w-1/4 bg-amber-500"></div>
              </div>
            </div>

            {/* Document Title (Single Clean Line) */}
            <div className="text-center my-2.5">
              <h4 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wider">
                Kartu Rincian Kewajiban &amp; Tunggakan Siswa
              </h4>
            </div>

            {/* Student Biodata & Financial Summary (Unified Sleek Box) */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                
                {/* Left: Student Identity */}
                <div className="sm:col-span-7 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Santri:</span>
                    <span className="font-bold text-slate-900 text-xs sm:text-sm">{student.full_name}</span>
                    {student.nis && (
                      <span className="text-[10px] font-mono text-slate-500 bg-white border border-slate-200 px-1.5 py-0.2 rounded">
                        NIS: {student.nis}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                    <span>
                      Kelas: <strong className="text-emerald-900 font-semibold">{studentArrears.current_unit || 'SMP IT'} · Kelas {studentArrears.current_grade || '-'}</strong>
                    </span>
                    {student.phone && (
                      <span className="flex items-center gap-1 text-slate-500">
                        <Phone className="w-2.5 h-2.5 text-emerald-700" />
                        <span>{student.phone}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Financial 3 KPI Mini-Cards */}
                <div className="sm:col-span-5 grid grid-cols-3 gap-1.5">
                  <div className="bg-white border border-slate-200 rounded-lg p-1.5 text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Tagihan</p>
                    <p className="text-[11px] font-bold text-slate-800 truncate" title={`Rp${studentArrears.grand_total_bills.toLocaleString('id-ID')}`}>
                      Rp{studentArrears.grand_total_bills.toLocaleString('id-ID')}
                    </p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg p-1.5 text-center">
                    <p className="text-[9px] font-bold text-emerald-700 uppercase">Terbayar</p>
                    <p className="text-[11px] font-bold text-emerald-700 truncate" title={`Rp${studentArrears.grand_total_paid.toLocaleString('id-ID')}`}>
                      Rp{studentArrears.grand_total_paid.toLocaleString('id-ID')}
                    </p>
                  </div>
                  <div className={`rounded-lg p-1.5 text-center border ${isLunas ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-300'}`}>
                    <p className={`text-[9px] font-bold uppercase ${isLunas ? 'text-emerald-700' : 'text-rose-700'}`}>Tunggakan</p>
                    <p className={`text-[11px] font-black truncate ${isLunas ? 'text-emerald-700' : 'text-rose-700'}`} title={`Rp${grandTotal.toLocaleString('id-ID')}`}>
                      Rp{grandTotal.toLocaleString('id-ID')}
                    </p>
                  </div>
                </div>

              </div>
            </div>

            {/* Itemized Breakdown per Academic Year */}
            <div className="space-y-3 mb-3">
              {studentArrears.years.map((year) => {
                // Separate and sort bills
                const sppBills = year.bills_detail
                  .filter(isSpp)
                  .sort((a, b) => {
                    const idxA = SPP_MONTH_ORDER.indexOf(a.billing_period?.toLowerCase() || '');
                    const idxB = SPP_MONTH_ORDER.indexOf(b.billing_period?.toLowerCase() || '');
                    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
                  });

                const nonSppBills = year.bills_detail
                  .filter((b) => !isSpp(b))
                  .sort((a, b) => a.category_name.localeCompare(b.category_name));

                // Compact summary of SPP
                const totalSppAmount = sppBills.reduce((s, b) => s + b.amount, 0);
                const totalSppPaid = sppBills.reduce((s, b) => s + b.paid, 0);
                const totalSppRemaining = sppBills.reduce((s, b) => s + b.remaining, 0);
                const sppLunasCount = sppBills.filter((b) => b.status === 'Lunas' || b.status === 'Bebas').length;
                const sppUnpaidCount = sppBills.filter((b) => b.remaining > 0).length;

                // Determine display rows based on viewMode & onlyUnpaid
                let rowsToDisplay: Array<{
                  key: string;
                  name: string;
                  period?: string | null;
                  amount: number;
                  paid: number;
                  remaining: number;
                  status: string;
                  isSppSummary?: boolean;
                  sppList?: typeof sppBills;
                }> = [];

                if (viewMode === 'compact') {
                  // If compact mode: aggregate SPP into 1 row
                  if (sppBills.length > 0) {
                    const shouldShowSpp = !onlyUnpaid || totalSppRemaining > 0;
                    if (shouldShowSpp) {
                      let sppStatusText = 'Belum Lunas';
                      if (totalSppRemaining === 0) {
                        sppStatusText = sppLunasCount === 12 ? 'Lunas' : `Lunas (${sppLunasCount} Bln)`;
                      } else if (sppUnpaidCount > 0) {
                        sppStatusText = `Nunggak ${sppUnpaidCount} Bln`;
                      }

                      rowsToDisplay.push({
                        key: 'spp-summary',
                        name: `SPP Bulanan (${sppBills.length} Bulan)`,
                        amount: totalSppAmount,
                        paid: totalSppPaid,
                        remaining: totalSppRemaining,
                        status: sppStatusText,
                        isSppSummary: true,
                        sppList: sppBills,
                      });
                    }
                  }

                  // Non-SPP items
                  nonSppBills.forEach((b) => {
                    if (!onlyUnpaid || b.remaining > 0) {
                      rowsToDisplay.push({
                        key: b.bill_id,
                        name: b.category_name,
                        period: b.billing_period,
                        amount: b.amount,
                        paid: b.paid,
                        remaining: b.remaining,
                        status: b.status,
                      });
                    }
                  });
                } else {
                  // Detailed mode: sort SPP first then non-SPP
                  const allSorted = [...sppBills, ...nonSppBills];
                  allSorted.forEach((b) => {
                    if (!onlyUnpaid || b.remaining > 0) {
                      rowsToDisplay.push({
                        key: b.bill_id,
                        name: b.category_name,
                        period: b.billing_period,
                        amount: b.amount,
                        paid: b.paid,
                        remaining: b.remaining,
                        status: b.status,
                      });
                    }
                  });
                }

                if (rowsToDisplay.length === 0) return null;

                return (
                  <div
                    key={year.academic_year_id}
                    className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs"
                  >
                    {/* Header per Tahun Ajaran */}
                    <div className="bg-slate-100/80 px-3 py-1.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-emerald-800" />
                        <span className="font-bold text-[11px] text-slate-800">
                          Tahun Ajaran {year.academic_year_name} (Kelas {year.grade})
                        </span>
                        <span className="text-[9px] bg-white border border-slate-200 text-slate-600 px-1.5 py-0.2 rounded font-medium">
                          {year.unit}
                        </span>
                      </div>

                      <div className="text-[10px] flex items-center gap-2">
                        <span className="text-slate-500">
                          Terbayar: <strong>Rp{year.total_paid.toLocaleString('id-ID')}</strong>
                        </span>
                        <span
                          className={`font-bold px-1.5 py-0.2 rounded ${
                            year.remaining_arrears > 0
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          Tunggakan: Rp{year.remaining_arrears.toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>

                    {/* Table of Bills */}
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-[9px] uppercase tracking-wider">
                          <th className="py-1.5 px-2.5 w-6 text-center">No</th>
                          <th className="py-1.5 px-2.5">Item Tagihan</th>
                          <th className="py-1.5 px-2 text-right">Nominal</th>
                          <th className="py-1.5 px-2 text-right">Terbayar</th>
                          <th className="py-1.5 px-2 text-right">Sisa Belum Bayar</th>
                          <th className="py-1.5 px-2.5 text-center w-24">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {rowsToDisplay.map((r, idx) => (
                          <tr
                            key={r.key}
                            className={
                              r.remaining > 0
                                ? 'bg-rose-50/20 hover:bg-rose-50/40'
                                : 'bg-white hover:bg-slate-50/50'
                            }
                          >
                            <td className="py-1.5 px-2.5 text-center text-slate-400 font-mono text-[10px]">
                              {idx + 1}
                            </td>
                            <td className="py-1.5 px-2.5">
                              <span className="font-bold text-slate-800">{r.name}</span>
                              {r.period && (
                                <span className="font-semibold text-emerald-900 ml-1">
                                  ({r.period})
                                </span>
                              )}

                              {/* SPP Compact Months Chip Tracker */}
                              {r.isSppSummary && r.sppList && (
                                <div className="flex flex-wrap items-center gap-1 mt-1">
                                  {r.sppList.map((sb) => {
                                    const mKey = (sb.billing_period || '').toLowerCase();
                                    const shortName = SHORT_MONTHS[mKey] || sb.billing_period || 'Bln';
                                    const isPaid = sb.status === 'Lunas' || sb.status === 'Bebas';
                                    const isDue = sb.remaining > 0;

                                    return (
                                      <span
                                        key={sb.bill_id}
                                        title={`${sb.billing_period}: ${sb.status} (${sb.remaining > 0 ? `Sisa: Rp${sb.remaining.toLocaleString('id-ID')}` : 'Rp0'})`}
                                        className={`inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8.5px] font-bold border ${
                                          isPaid
                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                            : isDue
                                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                                            : 'bg-slate-100 text-slate-500 border-slate-200'
                                        }`}
                                      >
                                        <span>{shortName}</span>
                                        <span>{isPaid ? '✓' : isDue ? '✕' : '•'}</span>
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-right text-slate-600">
                              Rp{r.amount.toLocaleString('id-ID')}
                            </td>
                            <td className="py-1.5 px-2 text-right text-emerald-700 font-semibold">
                              Rp{r.paid.toLocaleString('id-ID')}
                            </td>
                            <td className="py-1.5 px-2 text-right font-bold text-rose-600">
                              Rp{r.remaining.toLocaleString('id-ID')}
                            </td>
                            <td className="py-1.5 px-2.5 text-center">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  r.status === 'Lunas' || r.status.startsWith('Lunas') || r.status === 'Bebas'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : r.status === 'Belum Lunas'
                                    ? 'bg-amber-100 text-amber-800'
                                    : r.status === 'Akan Berlangsung'
                                    ? 'bg-slate-100 text-slate-600'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>

            {/* Informasi Rekening Bank (Sleek Horizontal Bar, Tidak Menumpuk) */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-emerald-50/80 border border-emerald-200/80 rounded-xl text-xs mb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-emerald-800 text-amber-300 flex items-center justify-center font-bold text-[10px] shrink-0">
                  BSI
                </div>
                <span className="text-slate-700 text-[11px]">
                  Bank BSI: <strong className="font-mono text-emerald-950 font-bold bg-white px-1.5 py-0.5 rounded border border-emerald-200">7110256118</strong> a.n. <strong>Yayasan Al-Qur'aniyyah</strong>
                </span>
              </div>
              <div className="flex items-center gap-1 text-slate-600 text-[11px]">
                <Phone className="w-3 h-3 text-emerald-700 shrink-0" />
                <span>Konfirmasi WA: <strong className="text-slate-800 font-bold">0857-1723-5374</strong> (Ust. Nasrulloh)</span>
              </div>
            </div>

            {/* Tanda Tangan & Footer Pengesahan */}
            <div className="pt-2 border-t border-slate-200 flex items-end justify-between text-xs">
              <div className="text-[9.5px] text-slate-400 max-w-xs leading-tight">
                <p>* Dokumen resmi Sistem Keuangan SIMKA Al-Qur'aniyyah. Simpan sebagai bukti rincian tagihan resmi.</p>
              </div>

              <div className="text-center w-44">
                <p className="text-[10px] text-slate-600 mb-0.5">
                  Tangerang Selatan, {todayFormatted}
                </p>
                <p className="text-[10px] font-semibold text-slate-700">
                  Bendahara Keuangan,
                </p>
                {/* Spacer for signature */}
                <div className="h-10 flex items-center justify-center">
                  <span className="text-[9px] text-slate-300 italic select-none">
                    [Tervalidasi Sistem]
                  </span>
                </div>
                <p className="font-bold text-slate-900 text-[11px] border-t border-slate-300 pt-0.5">
                  Nasrulloh
                </p>
                <p className="text-[9px] text-slate-500 font-medium">
                  Bendahara Al-Qur'aniyyah
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Bottom Modal Actions */}
        <div className="bg-white px-4 py-2.5 border-t border-slate-200 flex items-center justify-between shrink-0 no-print">
          <p className="text-[11px] text-slate-500">
            💡 <em>Mode Ringkas merangkum 12 bulan SPP agar pas 1 lembar tanpa baris bertumpuk.</em>
          </p>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};
