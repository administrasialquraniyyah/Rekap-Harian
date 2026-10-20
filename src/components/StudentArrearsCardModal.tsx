import React, { useState } from 'react';
import {
  X,
  Printer,
  Camera,
  Copy,
  Check,
  GraduationCap,
  Calendar,
  Phone,
  AlertTriangle,
  CheckCircle2,
  Receipt,
  Building2,
  CreditCard,
  Share2
} from 'lucide-react';
import { StudentCrossYearArrears } from '../types/database';
import html2canvas from 'html2canvas';
import logoImg from '../assets/logo.png';

interface StudentArrearsCardModalProps {
  studentArrears: StudentCrossYearArrears;
  onClose: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const StudentArrearsCardModal: React.FC<StudentArrearsCardModalProps> = ({
  studentArrears,
  onClose,
  showToast,
}) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
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
    let text = `*SURAT PEMBERITAHUAN TUNGGAKAN SISWA*\n`;
    text += `*YAYASAN AL-QUR'ANIYYAH*\n`;
    text += `_SMP IT & SMA IT Al-Qur'aniyyah_\n`;
    text += `========================================\n\n`;
    text += `Kepada Yth.\n`;
    text += `Orang Tua / Wali dari Ananda:\n`;
    text += `Nama Siswa : *${student.full_name}*\n`;
    text += `NIS        : ${student.nis || '-'}\n`;
    text += `Jenjang/Kls: ${studentArrears.current_unit || 'SMP IT'} · Kelas ${studentArrears.current_grade || '-'}\n\n`;
    text += `Dengan ini kami sampaikan rincian kewajiban pembayaran yang masih tercatat pada sistem keuangan:\n\n`;

    studentArrears.years.forEach((y) => {
      const unpaidItems = y.bills_detail.filter((b) => b.remaining > 0);
      if (unpaidItems.length > 0) {
        text += `📌 *Tahun Ajaran ${y.academic_year_name} (Kelas ${y.grade})*\n`;
        unpaidItems.forEach((b) => {
          text += ` • ${b.category_name}${b.billing_period ? ` (${b.billing_period})` : ''} : Rp${b.remaining.toLocaleString('id-ID')}\n`;
        });
        text += `   _Subtotal: Rp${y.remaining_arrears.toLocaleString('id-ID')}_\n\n`;
      }
    });

    text += `----------------------------------------\n`;
    text += `*TOTAL SISA TUNGGAKAN: Rp${grandTotal.toLocaleString('id-ID')}*\n`;
    text += `----------------------------------------\n\n`;
    text += `*Pembayaran dapat disalurkan melalui transfer:*\n`;
    text += `Bank Syariah Indonesia (BSI)\n`;
    text += `No. Rekening : *7110256118*\n`;
    text += `Atas Nama    : *Yayasan Al-Qur'aniyyah*\n\n`;
    text += `Konfirmasi Bukti Transfer: *085717235374* (Bendahara: Nasrulloh)\n\n`;
    text += `Mohon kirimkan bukti transfer setelah melakukan pembayaran. Atas perhatian dan kerjasamanya kami ucapkan terima kasih. Jazakumullahu khairan. 🙏\n\n`;
    text += `_Bendahara Yayasan Al-Qur'aniyyah - Nasrulloh_`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast('Teks rincian berhasil disalin untuk WhatsApp!', 'success');
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-slate-100 rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-300 max-h-[95vh] flex flex-col overflow-hidden my-auto">
        
        {/* Top Control Bar (Hidden on print) */}
        <div className="bg-white px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 no-print">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
              Card Siap Screenshot & Cetak PDF
            </span>
            <h4 className="text-sm sm:text-base font-bold text-slate-800 mt-0.5">
              Rincian Tunggakan: <span className="text-emerald-900">{student.full_name}</span>
            </h4>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Toggle view: All vs Unpaid only */}
            <button
              onClick={() => setOnlyUnpaid(!onlyUnpaid)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                onlyUnpaid
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              title="Filter tampilan item tagihan"
            >
              {onlyUnpaid ? '⚠️ Hanya Belum Lunas' : '📋 Semua Item Tagihan'}
            </button>

            {/* Copy WA Message */}
            <button
              onClick={handleCopyWhatsApp}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition border border-slate-200"
              title="Salin ringkasan pesan rapi untuk WhatsApp"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Tersalin' : 'Salin WA'}</span>
            </button>

            {/* Download as Image (PNG) */}
            <button
              onClick={handleDownloadImage}
              disabled={isCapturing}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs disabled:opacity-50"
              title="Download gambar kartu kualitas tinggi untuk dikirim langsung ke WhatsApp"
            >
              <Camera className={`w-3.5 h-3.5 ${isCapturing ? 'animate-spin' : ''}`} />
              <span>{isCapturing ? 'Memproses...' : 'Download Gambar (PNG)'}</span>
            </button>

            {/* Print / Export PDF */}
            <button
              onClick={handlePrintPdf}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs"
              title="Cetak langsung ke printer atau Simpan sebagai PDF A4"
            >
              <Printer className="w-3.5 h-3.5 text-gold-300" />
              <span>Cetak / PDF</span>
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Card Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-200/60">
          
          {/* THE OFFICIAL CARD (TARGET FOR SCREENSHOT & PRINT) */}
          <div
            id="student-arrears-printable-card"
            className="bg-white max-w-3xl w-full mx-auto p-6 sm:p-8 rounded-2xl border border-slate-300 shadow-md relative overflow-hidden"
          >
            {/* Watermark Stamp (Lunas / Belum Lunas) */}
            <div className="absolute right-8 top-28 pointer-events-none opacity-20 rotate-[-15deg] select-none">
              <div
                className={`border-4 border-dashed rounded-2xl px-6 py-2 text-2xl font-black uppercase tracking-widest ${
                  isLunas ? 'border-emerald-600 text-emerald-600' : 'border-rose-600 text-rose-600'
                }`}
              >
                {isLunas ? 'LUNAS' : 'BELUM LUNAS'}
              </div>
            </div>

            {/* Kop Surat Resmi */}
            <div className="border-b-2 border-emerald-900 pb-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-16 h-16 shrink-0 flex items-center justify-center">
                    <img
                      src={logoImg}
                      alt="Logo Al-Qur'aniyyah"
                      className="w-16 h-16 object-contain"
                      crossOrigin="anonymous"
                    />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-emerald-950 uppercase tracking-wide leading-tight">
                      Yayasan Pendidikan Islam Al-Qur'aniyyah
                    </h2>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-800 leading-tight">
                      Pondok Pesantren · SMP IT &amp; SMA IT Al-Qur'aniyyah
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Pondok Aren, Tangerang Selatan · Sistem Rekapitulasi Keuangan Santri Lintas Tahun
                    </p>
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-500 hidden sm:block">
                  <p className="font-semibold text-slate-700">Tanggal Dokumen:</p>
                  <p className="font-bold text-slate-800">{todayFormatted}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Dok. Keuangan Resmi</p>
                </div>
              </div>

              {/* Decorative green and gold lines */}
              <div className="w-full flex h-1 mt-3 rounded-full overflow-hidden">
                <div className="w-3/4 bg-emerald-800"></div>
                <div className="w-1/4 bg-amber-500"></div>
              </div>
            </div>

            {/* Document Title */}
            <div className="text-center my-4">
              <h4 className="text-sm sm:text-base font-black text-slate-800 uppercase tracking-wider">
                Kartu Rincian Kewajiban & Tunggakan Siswa
              </h4>
              <p className="text-[11px] text-slate-500 font-medium">
                Rekapitulasi Riwayat Pembayaran Tagihan Sekolah Lintas Tahun Ajaran
              </p>
            </div>

            {/* Student Metadata Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Nama Santri/Siswa</span>
                  <span className="font-bold text-slate-800 text-sm">{student.full_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">NIS / No. Rekening</span>
                  <span className="font-mono font-bold text-slate-700">{student.nis || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Jenjang / Kelas</span>
                  <span className="font-bold text-emerald-900">
                    {studentArrears.current_unit || 'SMP IT'} · Kelas {studentArrears.current_grade || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">No. WhatsApp / Wali</span>
                  <span className="font-bold text-slate-700 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-emerald-700" />
                    <span>{student.phone || '-'}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Grand Summary KPI Boxes */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Seluruh Tagihan</p>
                <p className="text-sm sm:text-base font-black text-slate-800 mt-0.5">
                  Rp{studentArrears.grand_total_bills.toLocaleString('id-ID')}
                </p>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Total Telah Dibayar</p>
                <p className="text-sm sm:text-base font-black text-emerald-700 mt-0.5">
                  Rp{studentArrears.grand_total_paid.toLocaleString('id-ID')}
                </p>
              </div>

              <div
                className={`rounded-xl p-3 text-center border ${
                  isLunas ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-300'
                }`}
              >
                <p
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    isLunas ? 'text-emerald-800' : 'text-rose-800'
                  }`}
                >
                  Sisa Total Tunggakan
                </p>
                <p
                  className={`text-base sm:text-lg font-black mt-0.5 ${
                    isLunas ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  Rp{grandTotal.toLocaleString('id-ID')}
                </p>
              </div>
            </div>

            {/* Itemized Breakdown per Academic Year */}
            <div className="space-y-5 mb-6">
              {studentArrears.years.map((year) => {
                const displayedBills = onlyUnpaid
                  ? year.bills_detail.filter((b) => b.remaining > 0)
                  : year.bills_detail;

                if (displayedBills.length === 0) return null;

                return (
                  <div
                    key={year.academic_year_id}
                    className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs"
                  >
                    {/* Header per Tahun Ajaran */}
                    <div className="bg-gradient-to-r from-slate-100 to-slate-50 px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-emerald-800" />
                        <span className="font-bold text-xs text-slate-800">
                          Tahun Ajaran {year.academic_year_name} (Kelas {year.grade})
                        </span>
                        <span className="text-[10px] bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                          {year.unit}
                        </span>
                      </div>

                      <div className="text-xs flex items-center gap-3">
                        <span className="text-slate-500 text-[11px]">
                          Terbayar: <strong>Rp{year.total_paid.toLocaleString('id-ID')}</strong>
                        </span>
                        <span
                          className={`font-black px-2 py-0.5 rounded text-[11px] ${
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
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-200 text-[10px] uppercase">
                          <th className="py-2 px-3 w-8 text-center">No</th>
                          <th className="py-2 px-3">Item Tagihan</th>
                          <th className="py-2 px-3 text-right">Nominal Tagihan</th>
                          <th className="py-2 px-3 text-right">Telah Dibayar</th>
                          <th className="py-2 px-3 text-right">Sisa Belum Bayar</th>
                          <th className="py-2 px-3 text-center w-24">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {displayedBills.map((b, bIdx) => (
                          <tr
                            key={b.bill_id}
                            className={
                              b.remaining > 0
                                ? 'bg-rose-50/20 hover:bg-rose-50/40'
                                : 'bg-white hover:bg-slate-50/50'
                            }
                          >
                            <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">
                              {bIdx + 1}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-800">
                              {b.category_name}
                              {b.billing_period ? (
                                <span className="font-semibold text-emerald-900 ml-1">
                                  ({b.billing_period})
                                </span>
                              ) : null}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-600">
                              Rp{b.amount.toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-right text-emerald-700 font-semibold">
                              Rp{b.paid.toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-right font-black text-rose-600">
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
                );
              })}
            </div>

            {/* Informasi Rekening & Konfirmasi Transfer */}
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-800 text-gold-400 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="text-xs">
                    <p className="font-black text-emerald-950">Rekening Resmi Pembayaran Sekolah:</p>
                    <p className="text-slate-700 mt-0.5">
                      Bank: <strong>Bank Syariah Indonesia (BSI)</strong> · No. Rek: <strong className="font-mono text-emerald-950 bg-emerald-100/70 px-1.5 py-0.5 rounded text-xs">7110256118</strong>
                    </p>
                    <p className="text-slate-600">
                      Atas Nama: <strong>Yayasan Al-Qur'aniyyah</strong>
                    </p>
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-500 border-t sm:border-t-0 sm:border-l border-emerald-200 pt-2 sm:pt-0 sm:pl-4">
                  <p className="font-semibold text-emerald-950">Konfirmasi Bukti Transfer:</p>
                  <p className="font-bold text-slate-800 text-xs flex items-center justify-end gap-1">
                    <Phone className="w-3 h-3 text-emerald-700" />
                    <span>0857-1723-5374</span>
                  </p>
                  <p className="text-emerald-900 font-bold text-[11px] mt-0.5">Bendahara: Nasrulloh</p>
                </div>
              </div>
            </div>

            {/* Tanda Tangan & Footer Pengesahan */}
            <div className="pt-3 border-t border-slate-200 flex items-end justify-between text-xs">
              <div className="text-[10px] text-slate-400 space-y-0.5 max-w-xs">
                <p>• Catatan: Simpan kartu ini sebagai bukti rincian tagihan resmi.</p>
                <p>• Dokumen ini dicetak otomatis dari Sistem Keuangan SIMKA Al-Qur'aniyyah.</p>
              </div>

              <div className="text-center w-52">
                <p className="text-[11px] text-slate-600 mb-1">
                  Jakarta, {todayFormatted}
                </p>
                <p className="text-[11px] font-semibold text-slate-700">
                  Bendahara Keuangan,
                </p>
                {/* Spacer for signature */}
                <div className="h-14 flex items-center justify-center">
                  <span className="text-[10px] text-slate-300 italic">
                    [Tervalidasi Sistem]
                  </span>
                </div>
                <p className="font-bold text-slate-900 text-xs border-t border-slate-300 pt-1">
                  Nasrulloh
                </p>
                <p className="text-[10px] text-slate-500 font-medium">
                  Bendahara Al-Qur'aniyyah
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Bottom Modal Actions */}
        <div className="bg-white px-5 py-3 border-t border-slate-200 flex items-center justify-between shrink-0 no-print">
          <p className="text-xs text-slate-500">
            💡 <em>Tip: Anda dapat langsung mengambil screenshot bagian kartu di atas atau klik tombol Download Gambar / Cetak PDF.</em>
          </p>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};
