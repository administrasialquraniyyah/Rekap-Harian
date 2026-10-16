import { supabase } from '../lib/supabase';
import { Payment, PaymentAllocation, BillStatus } from '../types/database';

export interface CreatePaymentInput {
  student_id: string;
  payment_date: string;
  amount: number;
  payment_method?: string;
  notes?: string;
  created_by?: string;
  allocations: {
    bill_id: string;
    allocated_amount: number;
  }[];
}

export const paymentService = {
  async recordPayment(input: CreatePaymentInput): Promise<Payment> {
    // 1. Validate allocations sum
    const totalAllocated = input.allocations.reduce((sum, a) => sum + Number(a.allocated_amount), 0);
    if (totalAllocated > input.amount) {
      throw new Error(`Total alokasi (Rp${totalAllocated.toLocaleString('id-ID')}) melebihi nominal pembayaran (Rp${input.amount.toLocaleString('id-ID')})`);
    }

    // 2. Generate transaction number
    const dateStr = input.payment_date.replace(/-/g, '');
    const randomHex = Math.random().toString(36).substring(2, 7).toUpperCase();
    const transactionNumber = `TRX-${dateStr}-${randomHex}`;

    // 3. Insert payment
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert([{
        transaction_number: transactionNumber,
        student_id: input.student_id,
        payment_date: input.payment_date,
        amount: input.amount,
        payment_method: input.payment_method || 'Tunai',
        notes: input.notes || null,
        created_by: input.created_by || 'Petugas Keuangan',
        status: 'valid'
      }])
      .select()
      .single();

    if (paymentError) throw paymentError;

    // 4. Insert allocations
    const allocationRows = input.allocations.map((a) => ({
      payment_id: payment.id,
      bill_id: a.bill_id,
      allocated_amount: a.allocated_amount
    }));

    const { error: allocError } = await supabase
      .from('payment_allocations')
      .insert(allocationRows);

    if (allocError) throw allocError;

    // 5. Update bills status
    for (const alloc of input.allocations) {
      // Calculate current total paid for this bill
      const { data: allBillAllocations } = await supabase
        .from('payment_allocations')
        .select(`
          allocated_amount,
          payment:payments(status)
        `)
        .eq('bill_id', alloc.bill_id);

      const validPaid = (allBillAllocations || [])
        .filter((a: any) => a.payment?.status === 'valid')
        .reduce((sum: number, a: any) => sum + Number(a.allocated_amount || 0), 0);

      // Fetch bill original amount
      const { data: bill } = await supabase
        .from('bills')
        .select('amount, status')
        .eq('id', alloc.bill_id)
        .single();

      if (bill) {
        let newStatus: BillStatus = 'Belum Dibayar';
        if (bill.status === 'Bebas') {
          newStatus = 'Bebas';
        } else if (validPaid >= Number(bill.amount)) {
          newStatus = 'Lunas';
        } else if (validPaid > 0) {
          newStatus = 'Belum Lunas';
        }

        await supabase
          .from('bills')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', alloc.bill_id);
      }
    }

    // 6. Record audit log
    await supabase.from('audit_logs').insert([{
      user_id: input.created_by || 'system',
      action: 'CREATE',
      entity_type: 'payment',
      entity_id: payment.id,
      new_data: {
        payment,
        allocations: allocationRows
      }
    }]);

    return payment;
  },

  async cancelPayment(paymentId: string, reason: string, cancelledBy?: string): Promise<void> {
    // 1. Fetch payment and its allocations
    const { data: payment, error: pError } = await supabase
      .from('payments')
      .select('*, allocations:payment_allocations(*)')
      .eq('id', paymentId)
      .single();

    if (pError || !payment) throw new Error('Pembayaran tidak ditemukan');

    if (payment.status === 'cancelled') {
      throw new Error('Pembayaran ini sudah dibatalkan sebelumnya');
    }

    // 2. Mark payment as cancelled
    const { error: cancelError } = await supabase
      .from('payments')
      .update({
        status: 'cancelled',
        notes: payment.notes ? `${payment.notes} [Dibatalkan: ${reason}]` : `[Dibatalkan: ${reason}]`,
        updated_at: new Date().toISOString()
      })
      .eq('id', paymentId);

    if (cancelError) throw cancelError;

    // 3. Recalculate affected bills status
    for (const alloc of payment.allocations || []) {
      const { data: allBillAllocations } = await supabase
        .from('payment_allocations')
        .select(`
          allocated_amount,
          payment:payments(status)
        `)
        .eq('bill_id', alloc.bill_id);

      const validPaid = (allBillAllocations || [])
        .filter((a: any) => a.payment?.status === 'valid')
        .reduce((sum: number, a: any) => sum + Number(a.allocated_amount || 0), 0);

      const { data: bill } = await supabase
        .from('bills')
        .select('amount, status')
        .eq('id', alloc.bill_id)
        .single();

      if (bill && bill.status !== 'Bebas') {
        let newStatus: BillStatus = 'Belum Dibayar';
        if (validPaid >= Number(bill.amount)) {
          newStatus = 'Lunas';
        } else if (validPaid > 0) {
          newStatus = 'Belum Lunas';
        }

        await supabase
          .from('bills')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', alloc.bill_id);
      }
    }

    // 4. Log cancellation audit
    await supabase.from('audit_logs').insert([{
      user_id: cancelledBy || 'system',
      action: 'CANCEL',
      entity_type: 'payment',
      entity_id: paymentId,
      old_data: payment,
      new_data: { reason, status: 'cancelled' }
    }]);
  },

  async getRecentPayments(limit: number = 20, academicYearId?: string): Promise<Payment[]> {
    let query = supabase
      .from('payments')
      .select(`
        *,
        student:students(
          id,
          nis,
          full_name,
          student_enrollments(
            unit,
            grade,
            academic_year_id
          )
        ),
        allocations:payment_allocations(
          id,
          allocated_amount,
          bill:bills(
            id,
            billing_period,
            academic_year_id,
            category:billing_categories(name)
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    const { data, error } = await query;
    if (error) throw error;

    let payments = data || [];
    if (academicYearId) {
      payments = payments.filter((p: any) => {
        return (p.allocations || []).some(
          (a: any) => a.bill?.academic_year_id === academicYearId
        );
      });
    }

    return payments;
  }
};
