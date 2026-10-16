import { supabase } from '../lib/supabase';
import { Bill, BillingCategory, BillStatus } from '../types/database';

export const SPP_MONTHS = [
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'
];

export const billingService = {
  async getCategories(): Promise<BillingCategory[]> {
    const { data, error } = await supabase
      .from('billing_categories')
      .select('*')
      .eq('is_active', true)
      .order('order_index', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async addCategory(name: string, categoryType: 'monthly' | 'one_time', orderIndex: number = 0): Promise<BillingCategory> {
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

      // Latest payment date
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
  },

  async getBillsForAcademicYear(academicYearId: string): Promise<Bill[]> {
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
      .eq('academic_year_id', academicYearId);

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
  },

  async createBill(billData: Omit<Bill, 'id' | 'created_at' | 'updated_at'>): Promise<Bill> {
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

    const { error } = await supabase.from('bills').insert(bills);
    if (error) throw error;
  }
};
