import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Search,
  Plus,
  Filter,
  CheckCircle,
  AlertCircle,
  Clock,
  X,
  Calendar,
  Layers
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { billingService, SPP_MONTHS } from '../services/billingService';
import { studentService } from '../services/studentService';
import { Bill, BillingCategory, Student, BillStatus } from '../types/database';

export const BillsPage: React.FC = () => {
  const { selectedAcademicYearId, selectedAcademicYear, showToast, refreshKey } = useApp();

  const [bills, setBills] = useState<Bill[]>([]);
  const [categories, setCategories] = useState<BillingCategory[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal Add Bill
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [billType, setBillType] = useState<'single' | 'monthly_spp'>('single');
  const [formData, setFormData] = useState({
    student_id: '',
    category_id: '',
    billing_period: '',
    amount: '',
    due_date: '',
    description: '',
  });

  const loadData = async () => {
    if (!selectedAcademicYearId) return;
    setIsLoading(true);
    try {
      const [bData, cData, sData] = await Promise.all([
        billingService.getBillsForAcademicYear(selectedAcademicYearId),
        billingService.getCategories(),
        studentService.getAllWithEnrollment({ academicYearId: selectedAcademicYearId })
      ]);
      setBills(bData);
      setCategories(cData);
      setStudents(sData);
      if (cData.length > 0 && !formData.category_id) {
        setFormData((prev) => ({ ...prev, category_id: cData[0].id }));
      }
    } catch (err: any) {
      console.error('Error loading bills:', err);
      showToast('Gagal memuat tagihan: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedAcademicYearId, refreshKey]);

  const handleOpenAdd = () => {
    setFormData({
      student_id: students.length > 0 ? students[0].id : '',
      category_id: categories.length > 0 ? categories[0].id : '',
      billing_period: '',
      amount: '',
      due_date: '',
      description: '',
    });
    setIsModalOpen(true);
  };

  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.student_id || !selectedAcademicYearId) {
      showToast('Pilih siswa terlebih dahulu', 'error');
      return;
    }

    try {
      if (billType === 'monthly_spp') {
        const sppCat = categories.find((c) => c.name.toLowerCase().includes('spp')) || categories[0];
        await billingService.generateMonthlySPPForStudent(
          formData.student_id,
          selectedAcademicYearId,
          sppCat.id,
          Number(formData.amount || 0)
        );
        showToast('Tagihan 12 bulan SPP berhasil dibuat', 'success');
      } else {
        await billingService.createBill({
          student_id: formData.student_id,
          academic_year_id: selectedAcademicYearId,
          category_id: formData.category_id,
          billing_period: formData.billing_period.trim() || null,
          amount: Number(formData.amount || 0),
          due_date: formData.due_date || null,
          status: 'Belum Dibayar',
          description: formData.description.trim() || null,
        });
        showToast('Tagihan berhasil ditambahkan', 'success');
      }

      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast('Gagal membuat tagihan: ' + err.message, 'error');
    }
  };

  // Filter bills
  const filteredBills = bills.filter((b) => {
    const studentName = b.student?.full_name?.toLowerCase() || '';
    const studentNis = b.student?.nis?.toLowerCase() || '';
    const catName = b.category?.name || '';
    const period = b.billing_period || '';

    const matchesSearch =
      !search ||
      studentName.includes(search.toLowerCase()) ||
      studentNis.includes(search.toLowerCase()) ||
      catName.toLowerCase().includes(search.toLowerCase()) ||
      period.toLowerCase().includes(search.toLowerCase());

    const matchesCat = categoryFilter === 'ALL' || b.category_id === categoryFilter;
    const matchesStatus = statusFilter === 'ALL' || b.calculated_status === statusFilter;

    return matchesSearch && matchesCat && matchesStatus;
  });

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Daftar Tagihan Siswa</h3>
          <p className="text-xs text-slate-500">
            Kelola tagihan bulanan (SPP) dan tagihan satu kali untuk T.A. {selectedAcademicYear?.name || '2026/2027'}
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-semibold transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Tagihan Baru</span>
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari siswa atau nama tagihan..."
            className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-slate-50/50"
          />
        </div>

        <div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full py-2 px-3 text-xs font-medium rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
          >
            <option value="ALL">Semua Kategori Tagihan</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full py-2 px-3 text-xs font-medium rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-white"
          >
            <option value="ALL">Semua Status</option>
            <option value="Belum Dibayar">Belum Dibayar</option>
            <option value="Belum Lunas">Belum Lunas</option>
            <option value="Lunas">Lunas</option>
            <option value="Bebas">Bebas / Free</option>
          </select>
        </div>
      </div>

      {/* Bills Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <th className="py-3.5 px-4 w-12 text-center">No</th>
                <th className="py-3.5 px-4">Nama Siswa</th>
                <th className="py-3.5 px-4">Jenis Tagihan</th>
                <th className="py-3.5 px-4">Periode</th>
                <th className="py-3.5 px-4 text-right">Nominal Tagihan</th>
                <th className="py-3.5 px-4 text-right">Sudah Dibayar</th>
                <th className="py-3.5 px-4 text-right">Sisa Tagihan</th>
                <th className="py-3.5 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Memuat tagihan...
                  </td>
                </tr>
              ) : filteredBills.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Tidak ada tagihan yang ditemukan.
                  </td>
                </tr>
              ) : (
                filteredBills.slice(0, 100).map((bill, idx) => (
                  <tr key={bill.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 text-center text-slate-400 font-bold">{idx + 1}</td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {bill.student?.full_name || 'Siswa'}
                      {bill.student?.nis && (
                        <span className="block text-[10px] text-slate-400 font-normal">
                          NIS: {bill.student.nis}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {bill.category?.name || 'Tagihan'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {bill.billing_period || '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-800">
                      Rp{Number(bill.amount).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                      Rp{Number(bill.total_paid || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-rose-600">
                      Rp{Number(bill.remaining_amount || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          bill.calculated_status === 'Lunas' || bill.calculated_status === 'Bebas'
                            ? 'bg-emerald-100 text-emerald-800'
                            : bill.calculated_status === 'Belum Lunas'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {bill.calculated_status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add Bill */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h4 className="text-base font-bold text-slate-800">Buat Tagihan Siswa</h4>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBill} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Siswa *</label>
                <select
                  required
                  value={formData.student_id}
                  onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                >
                  <option value="">-- Pilih Siswa --</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.current_enrollment?.unit || 'SMP IT'} - {s.current_enrollment?.grade || 'VII'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-4 py-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="billType"
                    checked={billType === 'single'}
                    onChange={() => setBillType('single')}
                    className="text-emerald-700"
                  />
                  <span>Tagihan Satu Kali / Per Kegiatan</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="billType"
                    checked={billType === 'monthly_spp'}
                    onChange={() => setBillType('monthly_spp')}
                    className="text-emerald-700"
                  />
                  <span>Generate SPP 12 Bulan (Juli-Juni)</span>
                </label>
              </div>

              {billType === 'single' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Kategori Tagihan</label>
                      <select
                        value={formData.category_id}
                        onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                        className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Periode / Bulan (Opsional)</label>
                      <input
                        type="text"
                        placeholder="Contoh: Agustus, atau kosongkan"
                        value={formData.billing_period}
                        onChange={(e) => setFormData({ ...formData, billing_period: e.target.value })}
                        className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nominal Tagihan (Rp) *</label>
                    <input
                      type="number"
                      required
                      placeholder="Contioh: 2900000"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-300"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Keterangan</label>
                    <input
                      type="text"
                      placeholder="Contoh: Tagihan Perlengkapan Santri Baru"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tarif SPP Bulanan (Rp) *</label>
                  <input
                    type="number"
                    required
                    placeholder="Contoh: 1335000"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-300"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Akan membuat otomatis 12 tagihan dari bulan Juli hingga Juni untuk tahun ajaran aktif.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-700 rounded-xl transition shadow-sm"
                >
                  Simpan Tagihan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
