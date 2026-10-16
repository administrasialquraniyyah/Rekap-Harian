import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Download,
  ArrowRight,
  Database,
  Calendar,
  Layers
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { localStore } from '../services/dataStore';
import { SPP_MONTHS } from '../services/billingService';
import * as XLSX from 'xlsx';

interface MatchedPaymentItem {
  studentName: string;
  studentId?: string;
  matched: boolean;
  itemType: 'SPP' | 'Non-SPP';
  categoryOrMonth: string;
  paymentDate: string;
  amount: number;
}

export const ImportPaymentsPage: React.FC = () => {
  const { selectedAcademicYearId, selectedAcademicYear, showToast, triggerRefresh } = useApp();

  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewItems, setPreviewItems] = useState<MatchedPaymentItem[]>([]);
  const [importSummary, setImportSummary] = useState<{
    totalMatched: number;
    totalUnmatched: number;
    totalAmount: number;
  } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setIsProcessing(true);
    setImportSummary(null);

    try {
      const buffer = await uploadedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { cellDates: true });
      const students = localStore.getStudents();

      // Check if file has 'PEMBAYARAN' sheet (standard Excel template)
      const bayarSheet = workbook.Sheets['PEMBAYARAN'] || workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(bayarSheet, { header: 1, defval: null });

      if (rows.length < 2) {
        throw new Error('File Excel tidak memiliki baris data');
      }

      const header = (rows[0] || []).map((h: any) => String(h || '').trim());
      const headerUpper = header.map((h: string) => h.toUpperCase());

      const nameColIdx = headerUpper.findIndex((h: string) => h.includes('NAMA'));
      if (nameColIdx === -1) {
        throw new Error("Kolom 'NAMA' atau 'NAMA SISWA' tidak ditemukan pada baris pertama file Excel.");
      }

      const matchedList: MatchedPaymentItem[] = [];

      // Check if format is matrix format (sheet PEMBAYARAN with Juli..Juni columns)
      const monthIndices: { month: string; idx: number }[] = [];
      SPP_MONTHS.forEach((m) => {
        const mIdx = headerUpper.findIndex((h: string) => h === m.toUpperCase());
        if (mIdx !== -1) monthIndices.push({ month: m, idx: mIdx });
      });

      const nonSppCatCols = ['PERLENGKAPAN', 'PERALATAN', 'KEGIATAN', 'PEMBANGUNAN', 'UJIAN', 'LAINNYA', 'BUKU PAKET'];
      const catIndices: { name: string; idx: number }[] = [];
      nonSppCatCols.forEach((cat) => {
        const cIdx = headerUpper.findIndex((h: string) => h.includes(cat));
        if (cIdx !== -1) catIndices.push({ name: cat === 'LAINNYA' ? 'Lainnya' : (cat.charAt(0) + cat.slice(1).toLowerCase()), idx: cIdx });
      });

      if (monthIndices.length > 0 || catIndices.length > 0) {
        // MATRIX FORMAT
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          const rawName = row[nameColIdx];
          if (!rawName) continue;
          const nameStr = String(rawName).trim();

          // Match student
          const matchedStudent = students.find(
            (s) => s.full_name.toLowerCase().trim() === nameStr.toLowerCase()
          );

          // 1. Process SPP months
          for (const mItem of monthIndices) {
            const cellVal = row[mItem.idx];
            if (cellVal && cellVal !== 'Belum Dibayar' && cellVal !== 'Akan Berlangsung') {
              let dateStr = '2026-08-28';
              let isPaid = false;

              if (cellVal instanceof Date) {
                dateStr = cellVal.toISOString().split('T')[0];
                isPaid = true;
              } else if (typeof cellVal === 'number' && cellVal > 10000) {
                const d = XLSX.SSF.parse_date_code(cellVal);
                dateStr = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
                isPaid = true;
              } else if (typeof cellVal === 'string' && /\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(cellVal)) {
                dateStr = cellVal.replace(/\//g, '-');
                isPaid = true;
              }

              if (isPaid) {
                matchedList.push({
                  studentName: nameStr,
                  studentId: matchedStudent?.id,
                  matched: Boolean(matchedStudent),
                  itemType: 'SPP',
                  categoryOrMonth: mItem.month,
                  paymentDate: dateStr,
                  amount: 1335000,
                });
              }
            }
          }

          // 2. Process Non-SPP categories
          for (const cItem of catIndices) {
            const cellVal = Number(row[cItem.idx] || 0);
            if (cellVal > 0) {
              matchedList.push({
                studentName: nameStr,
                studentId: matchedStudent?.id,
                matched: Boolean(matchedStudent),
                itemType: 'Non-SPP',
                categoryOrMonth: cItem.name,
                paymentDate: new Date().toISOString().split('T')[0],
                amount: cellVal,
              });
            }
          }
        }
      } else {
        // LIST FORMAT (Rows of: Nama, Tagihan/Bulan, Tanggal, Nominal)
        const dateIdx = headerUpper.findIndex((h: string) => h.includes('TANGGAL') || h.includes('DATE'));
        const nominalIdx = headerUpper.findIndex((h: string) => h.includes('NOMINAL') || h.includes('JUMLAH') || h.includes('BAYAR'));
        const tagihanIdx = headerUpper.findIndex((h: string) => h.includes('TAGIHAN') || h.includes('BULAN') || h.includes('ITEM'));

        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          const rawName = row[nameColIdx];
          if (!rawName) continue;
          const nameStr = String(rawName).trim();
          const matchedStudent = students.find(
            (s) => s.full_name.toLowerCase().trim() === nameStr.toLowerCase()
          );

          const tagihanStr = tagihanIdx !== -1 ? String(row[tagihanIdx] || 'SPP').trim() : 'SPP';
          const nominalVal = nominalIdx !== -1 ? Number(row[nominalIdx] || 1335000) : 1335000;
          let dateStr = new Date().toISOString().split('T')[0];

          if (dateIdx !== -1 && row[dateIdx]) {
            const dVal = row[dateIdx];
            if (dVal instanceof Date) {
              dateStr = dVal.toISOString().split('T')[0];
            } else if (typeof dVal === 'number' && dVal > 10000) {
              const d = XLSX.SSF.parse_date_code(dVal);
              dateStr = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
            } else if (typeof dVal === 'string') {
              dateStr = dVal.replace(/\//g, '-');
            }
          }

          const isSpp = SPP_MONTHS.some((m) => tagihanStr.toLowerCase().includes(m.toLowerCase()));
          const matchedMonth = SPP_MONTHS.find((m) => tagihanStr.toLowerCase().includes(m.toLowerCase())) || 'Oktober';

          matchedList.push({
            studentName: nameStr,
            studentId: matchedStudent?.id,
            matched: Boolean(matchedStudent),
            itemType: isSpp ? 'SPP' : 'Non-SPP',
            categoryOrMonth: isSpp ? matchedMonth : tagihanStr,
            paymentDate: dateStr,
            amount: nominalVal,
          });
        }
      }

      setPreviewItems(matchedList);

      const matchedCount = matchedList.filter((m) => m.matched).length;
      const unmatchedCount = matchedList.filter((m) => !m.matched).length;
      const sumAmount = matchedList.reduce((sum, m) => sum + m.amount, 0);

      setImportSummary({
        totalMatched: matchedCount,
        totalUnmatched: unmatchedCount,
        totalAmount: sumAmount,
      });

      showToast(`Berhasil membaca ${matchedList.length} transaksi dari file Excel`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast('Gagal memproses file: ' + err.message, 'error');
      setPreviewItems([]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyToRecap = () => {
    if (previewItems.length === 0 || !selectedAcademicYearId) {
      showToast('Tidak ada data yang dapat diimpor', 'error');
      return;
    }

    let appliedCount = 0;

    for (const item of previewItems) {
      if (!item.matched || !item.studentId) continue;

      if (item.itemType === 'SPP') {
        localStore.updateSppCell(item.studentId, selectedAcademicYearId, item.categoryOrMonth, {
          status: 'Lunas',
          paymentDate: item.paymentDate,
          amount: item.amount,
        });
        appliedCount++;
      } else {
        localStore.updateNonSppCell(
          item.studentId,
          selectedAcademicYearId,
          item.categoryOrMonth,
          item.amount,
          item.paymentDate
        );
        appliedCount++;
      }
    }

    showToast(`Sukses menerapkan ${appliedCount} pembayaran ke rekapitulasi!`, 'success');
    triggerRefresh();
    setPreviewItems([]);
    setFile(null);
  };

  const downloadSampleTemplate = () => {
    const sampleRows = [
      { 'Nama Siswa': 'Aditya Ramadhan', 'Bulan / Tagihan': 'September', 'Tanggal Bayar': '2026-09-10', 'Nominal': 1335000 },
      { 'Nama Siswa': 'Aditya Ramadhan', 'Bulan / Tagihan': 'Oktober', 'Tanggal Bayar': '2026-10-08', 'Nominal': 1335000 },
      { 'Nama Siswa': 'Ahmad Omar Rafly Lubis', 'Bulan / Tagihan': 'Buku Paket', 'Tanggal Bayar': '2026-10-15', 'Nominal': 450000 },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Pembayaran');
    XLSX.writeFile(wb, 'Format_Import_Pembayaran.xlsx');
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
            Layanan Import Transaksi Otomatis
          </span>
          <h3 className="text-xl font-black text-slate-800 mt-1">
            Import Pembayaran Siswa Dari Excel
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Unggah file Excel berisi nama siswa, tanggal bayar, bulan SPP, atau biaya buku/lainnya. Sistem akan langsung memperbarui tabel Rekap Pembayaran secara otomatis.
          </p>
        </div>

        <button
          onClick={downloadSampleTemplate}
          className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition"
        >
          <Download className="w-4 h-4 text-emerald-700" />
          <span>Unduh Contoh Format Excel</span>
        </button>
      </div>

      {/* Upload Zone */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="border-2 border-dashed border-emerald-300 rounded-2xl p-8 text-center hover:border-emerald-600 transition bg-emerald-50/20">
          <input
            type="file"
            id="paymentExcelUpload"
            accept=".xlsx, .xls"
            onChange={handleFileUpload}
            className="hidden"
          />
          <label
            htmlFor="paymentExcelUpload"
            className="cursor-pointer flex flex-col items-center justify-center gap-2"
          >
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shadow-xs">
              <Upload className="w-6 h-6" />
            </div>
            <p className="font-bold text-sm text-slate-800 mt-2">
              {file ? file.name : 'Pilih atau Drag File Excel Pembayaran di Sini'}
            </p>
            <p className="text-xs text-slate-500 max-w-md">
              Bisa berupa file matriks acuan <code>Administrasi_SMP_SMA_2026-2027.xlsx</code> (sheet PEMBAYARAN) atau file Excel daftar setoran baru.
            </p>
          </label>
        </div>

        {isProcessing && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-600 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-700" />
            <span>Mencocokkan nama siswa dan mengurai tanggal transaksi...</span>
          </div>
        )}

        {/* Summary Card */}
        {importSummary && (
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <p className="text-slate-500">Siswa Cocok</p>
                <p className="font-black text-emerald-800 text-base">{importSummary.totalMatched}</p>
              </div>
              <div>
                <p className="text-slate-500">Tidak Dikenal</p>
                <p className="font-black text-rose-600 text-base">{importSummary.totalUnmatched}</p>
              </div>
              <div>
                <p className="text-slate-500">Total Nilai Transaksi</p>
                <p className="font-black text-slate-800 text-base">
                  Rp{importSummary.totalAmount.toLocaleString('id-ID')}
                </p>
              </div>
            </div>

            <button
              onClick={handleApplyToRecap}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-800 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition"
            >
              <CheckCircle2 className="w-4 h-4 text-gold-400" />
              <span>Terapkan Pembayaran ke Rekap</span>
            </button>
          </div>
        )}

        {/* Preview Table */}
        {previewItems.length > 0 && (
          <div className="space-y-3 pt-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500">
              Preview Baris Pembayaran ({previewItems.length} Transaksi)
            </h4>

            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">No</th>
                    <th className="py-2.5 px-3">Nama Siswa di Excel</th>
                    <th className="py-2.5 px-3 text-center">Status Pencocokan</th>
                    <th className="py-2.5 px-3">Item / Bulan</th>
                    <th className="py-2.5 px-3 text-center">Tanggal Bayar</th>
                    <th className="py-2.5 px-3 text-right">Nominal (Rp)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {previewItems.slice(0, 50).map((item, idx) => (
                    <tr key={idx} className={item.matched ? 'hover:bg-slate-50/60' : 'bg-rose-50/30'}>
                      <td className="py-2 px-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                      <td className="py-2 px-3 font-bold text-slate-800">{item.studentName}</td>
                      <td className="py-2 px-3 text-center">
                        {item.matched ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            ✓ Cocok
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                            Nama Tidak Ditemukan
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-700">
                        {item.categoryOrMonth}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-600">
                        {item.paymentDate}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-emerald-700">
                        Rp{item.amount.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewItems.length > 50 && (
              <p className="text-[11px] text-slate-400 text-center">
                Menampilkan 50 dari {previewItems.length} transaksi pada preview.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
