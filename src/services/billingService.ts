import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Bill, BillingCategory, BillStatus } from '../types/database';
import { localStore } from './dataStore';

export const SPP_MONTHS = [
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'
];

export const billingService = {
  async getCategories(): Promise<BillingCategory[]> {
    if (!isSupabaseConfigured) {
      return localStore.getCategories();
    }
    try {
      const { data, error } = await supabase
        .from('billing_categories')
        .select('*')
        .eq('is_active', true)
        .order('order_index', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch {
      return localStore.getCategories();
    }
  },

  async addCategory(name: string, categoryType: 'monthly' | 'one_time', orderIndex: number = 0): Promise<BillingCategory> {
    if (!isSupabaseConfigured) {
      const newCat: BillingCategory = {
        id: `cat-${Date.now()}`,
        name,
        category_type: categoryType,
        order_index: orderIndex,
        is_active: true,
      };
      localStore.addCategory(newCat);
      return newCat;
    }

    const { data, error } = await supabase
      .from('billing_categories')
      .insert([{
        name,
        category_type: categoryType,
        order_index: orderIndex,
        is_active: true
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getBillsByStudent(studentId: string, academicYearId?: string): Promise<Bill[]> {
    if (!isSupabaseConfigured) {
      const allBills = localStore.getBills().filter((b) => b.student_id === studentId);
      const filtered = academicYearId ? allBills.filter((b) => b.academic_year_id === academicYearId) : allBills;
      const categories = localStore.getCategories();
      const years = localStore.getAcademicYears();
      const payments = localStore.getPayments();
      const allocations = localStore.getAllocations();

      return filtered.map((b) => {
        const cat = categories.find((c) => c.id === b.category_id);
        const yr = years.find((y) => y.id === b.academic_year_id);
        const bAllocs = allocations.filter((a) => a.bill_id === b.id);
        const validPaid = bAllocs
          .filter((a) => payments.find((p) => p.id === a.payment_id)?.status === 'valid')
          .reduce((sum, a) => sum + Number(a.allocated_amount), 0);

        let lastDate: string | null = null;
        if (bAllocs.length > 0) {
          const matchPmts = payments.filter((p) => bAllocs.some((a) => a.payment_id === p.id && p.status === 'valid'));
          if (matchPmts.length > 0) {
            matchPmts.sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());
            lastDate = matchPmts[0].payment_date;
          }
        }

        let calculatedStatus: BillStatus = 'Belum Dibayar';
        if (b.status === 'Bebas') calculatedStatus = 'Bebas';
        else if (validPaid >= Number(b.amount) && Number(b.amount) > 0) calculatedStatus = 'Lunas';
        else if (validPaid > 0) calculatedStatus = 'Belum Lunas';

        return {
          ...b,
          category: cat,
          academic_year: yr,
          total_paid: validPaid,
          remaining_amount: Math.max(0, Number(b.amount) - validPaid),
          calculated_status: calculatedStatus,
          last_payment_date: lastDate,
        };
      });
    }

    try {
      let query = supabase
        .from('bills')
        .select(`
          *,
          category:billing_categories(*),
          academic_year:academic_years(*),
          allocations:payment_allocations(
            id,
            allocated_amount,
            payment:payments(
              id,
              transaction_number,
              payment_date,
              status
            )
          )
        `)
        .eq('student_id', studentId);

      if (academicYearId) {
        query = query.eq('academic_year_id', academicYearId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((bill: any) => {
        const validAllocations = (bill.allocations || []).filter(
          (a: any) => a.payment && a.payment.status === 'valid'
        );
        const totalPaid = validAllocations.reduce((sum: number, a: any) => sum + Number(a.allocated_amount || 0), 0);
        const remainingAmount = Math.max(0, Number(bill.amount) - totalPaid);

        let lastPaymentDate: string | null = null;
        if (validAllocations.length > 0) {
          const sorted = [...validAllocations].sort((a: any, b: any) => 
            new Date(b.payment.payment_date).getTime() - new Date(a.payment.payment_date).getTime()
          );
          lastPaymentDate = sorted[0].payment.payment_date;
        }

        let calculatedStatus: BillStatus = 'Belum Dibayar';
        if (bill.status === 'Bebas') {
          calculatedStatus = 'Bebas';
        } else if (totalPaid >= Number(bill.amount) && Number(bill.amount) > 0) {
          calculatedStatus = 'Lunas';
        } else if (totalPaid > 0) {
          calculatedStatus = 'Belum Lunas';
        }

        return {
          ...bill,
          total_paid: totalPaid,
          remaining_amount: remainingAmount,
          calculated_status: calculatedStatus,
          last_payment_date: lastPaymentDate
        };
      });
    } catch {
      return this.getBillsByStudent(studentId, academicYearId);
    }
  },

  async getBillsForAcademicYear(academicYearId: string): Promise<Bill[]> {
    if (!isSupabaseConfigured) {
      const allBills = localStore.getBills().filter((b) => b.academic_year_id === academicYearId);
      const categories = localStore.getCategories();
      const students = localStore.getStudents();
      const payments = localStore.getPayments();
      const allocations = localStore.getAllocations();

      return allBills.map((b) => {
        const cat = categories.find((c) => c.id === b.category_id);
        const std = students.find((s) => s.id === b.student_id);
        const bAllocs = allocations.filter((a) => a.bill_id === b.id);
        const validPaid = bAllocs
          .filter((a) => payments.find((p) => p.id === a.payment_id)?.status === 'valid')
          .reduce((sum, a) => sum + Number(a.allocated_amount), 0);

        let lastDate: string | null = null;
        if (bAllocs.length > 0) {
          const matchPmts = payments.filter((p) => bAllocs.some((a) => a.payment_id === p.id && p.status === 'valid'));
          if (matchPmts.length > 0) {
            matchPmts.sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());
            lastDate = matchPmts[0].payment_date;
          }
        }

        let calculatedStatus: BillStatus = 'Belum Dibayar';
        if (b.status === 'Bebas') calculatedStatus = 'Bebas';
        else if (validPaid >= Number(b.amount) && Number(b.amount) > 0) calculatedStatus = 'Lunas';
        else if (validPaid > 0) calculatedStatus = 'Belum Lunas';

        return {
          ...b,
          category: cat,
          student: std,
          total_paid: validPaid,
          remaining_amount: Math.max(0, Number(b.amount) - validPaid),
          calculated_status: calculatedStatus,
          last_payment_date: lastDate,
        };
      });
    }

    try {
      const { data, error } = await supabase
        .from('bills')
        .select(`
          *,
          category:billing_categories(*),
          student:students(*),
          allocations:payment_allocations(
            id,
            allocated_amount,
            payment:payments(
              id,
              transaction_number,
              payment_date,
              status
            )
          )
        `)
        .eq('academic_year_id', academicYearId)
        .range(0, 19999);

      if (error) throw error;

      return (data || []).map((bill: any) => {
        const validAllocations = (bill.allocations || []).filter(
          (a: any) => a.payment && a.payment.status === 'valid'
        );
        const totalPaid = validAllocations.reduce((sum: number, a: any) => sum + Number(a.allocated_amount || 0), 0);
        const remainingAmount = Math.max(0, Number(bill.amount) - totalPaid);

        let lastPaymentDate: string | null = null;
        if (validAllocations.length > 0) {
          const sorted = [...validAllocations].sort((a: any, b: any) => 
            new Date(b.payment.payment_date).getTime() - new Date(a.payment.payment_date).getTime()
          );
          lastPaymentDate = sorted[0].payment.payment_date;
        }

        let calculatedStatus: BillStatus = 'Belum Dibayar';
        if (bill.status === 'Bebas') {
          calculatedStatus = 'Bebas';
        } else if (totalPaid >= Number(bill.amount) && Number(bill.amount) > 0) {
          calculatedStatus = 'Lunas';
        } else if (totalPaid > 0) {
          calculatedStatus = 'Belum Lunas';
        }

        return {
          ...bill,
          total_paid: totalPaid,
          remaining_amount: remainingAmount,
          calculated_status: calculatedStatus,
          last_payment_date: lastPaymentDate
        };
      });
    } catch {
      return this.getBillsForAcademicYear(academicYearId);
    }
  },

  async createBill(billData: Omit<Bill, 'id' | 'created_at' | 'updated_at'>): Promise<Bill> {
    if (!isSupabaseConfigured) {
      const newBill: Bill = {
        id: `bill-${Date.now()}`,
        ...billData,
        created_at: new Date().toISOString(),
      };
      localStore.saveBill(newBill);
      return newBill;
    }

    const { data, error } = await supabase
      .from('bills')
      .insert([billData])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async generateMonthlySPPForStudent(
    studentId: string,
    academicYearId: string,
    categoryId: string,
    monthlyAmount: number,
    isFree: boolean = false
  ): Promise<void> {
    const bills = SPP_MONTHS.map((month) => ({
      student_id: studentId,
      academic_year_id: academicYearId,
      category_id: categoryId,
      billing_period: month,
      amount: monthlyAmount,
      status: isFree ? ('Bebas' as BillStatus) : ('Belum Dibayar' as BillStatus),
      description: `SPP Bulan ${month}`,
    }));

    if (!isSupabaseConfigured) {
      const created = bills.map((b) => ({
        id: `bill-${Math.random().toString(36).substring(2, 9)}`,
        ...b,
        created_at: new Date().toISOString(),
      }));
      localStore.saveBills(created);
      return;
    }

    const { error } = await supabase.from('bills').insert(bills);
    if (error) throw error;
  }
};
