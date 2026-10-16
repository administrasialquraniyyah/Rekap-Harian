import { supabase } from '../lib/supabase';
import { StudentCrossYearArrears, StudentYearlyArrears, BillStatus } from '../types/database';

export const arrearsService = {
  async getCrossYearArrears(filters: {
    studentId?: string;
    academicYearId?: string | 'ALL';
    unit?: string | 'ALL';
    grade?: string | 'ALL';
    search?: string;
  } = {}): Promise<StudentCrossYearArrears[]> {
    // 1. Fetch students with their enrollments and academic years
    let studentQuery = supabase
      .from('students')
      .select(`
        *,
        student_enrollments(
          id,
          unit,
          grade,
          administrative_status,
          academic_year_id,
          academic_years(
            id,
            name,
            status,
            start_date
          )
        )
      `)
      .order('full_name', { ascending: true });

    if (filters.studentId) {
      studentQuery = studentQuery.eq('id', filters.studentId);
    }

    if (filters.search) {
      const term = `%${filters.search}%`;
      studentQuery = studentQuery.or(`full_name.ilike.${term},nis.ilike.${term}`);
    }

    const { data: students, error: studentError } = await studentQuery;
    if (studentError) throw studentError;

    // 2. Fetch all bills with valid payment allocations
    let billsQuery = supabase
      .from('bills')
      .select(`
        id,
        student_id,
        academic_year_id,
        category_id,
        billing_period,
        amount,
        status,
        category:billing_categories(id, name, category_type),
        academic_year:academic_years(id, name, start_date),
        allocations:payment_allocations(
          allocated_amount,
          payment:payments(status)
        )
      `);

    if (filters.studentId) {
      billsQuery = billsQuery.eq('student_id', filters.studentId);
    }
    if (filters.academicYearId && filters.academicYearId !== 'ALL') {
      billsQuery = billsQuery.eq('academic_year_id', filters.academicYearId);
    }

    const { data: bills, error: billsError } = await billsQuery;
    if (billsError) throw billsError;

    // Group bills by student_id and academic_year_id
    const billsByStudentYear: Record<string, Record<string, any[]>> = {};

    for (const bill of bills || []) {
      const sId = bill.student_id;
      const yId = bill.academic_year_id;
      if (!billsByStudentYear[sId]) billsByStudentYear[sId] = {};
      if (!billsByStudentYear[sId][yId]) billsByStudentYear[sId][yId] = [];

      // Calculate paid
      const validPaid = (bill.allocations || [])
        .filter((a: any) => a.payment?.status === 'valid')
        .reduce((sum: number, a: any) => sum + Number(a.allocated_amount || 0), 0);

      const billAmount = Number(bill.amount || 0);
      const remaining = Math.max(0, billAmount - validPaid);

      let calcStatus: BillStatus = 'Belum Dibayar';
      if (bill.status === 'Bebas') {
        calcStatus = 'Bebas';
      } else if (validPaid >= billAmount && billAmount > 0) {
        calcStatus = 'Lunas';
      } else if (validPaid > 0) {
        calcStatus = 'Belum Lunas';
      }

      const catObj: any = Array.isArray(bill.category) ? bill.category[0] : bill.category;
      billsByStudentYear[sId][yId].push({
        bill_id: bill.id,
        category_name: catObj?.name || 'Tagihan',
        billing_period: bill.billing_period,
        amount: billAmount,
        paid: validPaid,
        remaining: calcStatus === 'Bebas' ? 0 : remaining,
        status: calcStatus
      });
    }

    const result: StudentCrossYearArrears[] = [];

    for (const student of students || []) {
      const enrollments = student.student_enrollments || [];
      const studentBillsMap = billsByStudentYear[student.id] || {};

      // Determine latest/current enrollment
      const sortedEnrollments = [...enrollments].sort((a: any, b: any) => 
        new Date(b.academic_years?.start_date || 0).getTime() - new Date(a.academic_years?.start_date || 0).getTime()
      );
      const currentEnrollment = sortedEnrollments[0];

      // Filter by unit / grade if requested
      if (filters.unit && filters.unit !== 'ALL') {
        if (currentEnrollment?.unit !== filters.unit) continue;
      }
      if (filters.grade && filters.grade !== 'ALL') {
        if (currentEnrollment?.grade !== filters.grade) continue;
      }

      // Collect years
      const yearsMap = new Map<string, StudentYearlyArrears>();

      // First include enrolled years
      for (const enr of enrollments) {
        const yId = enr.academic_year_id;
        if (filters.academicYearId && filters.academicYearId !== 'ALL' && yId !== filters.academicYearId) {
          continue;
        }

        const bList = studentBillsMap[yId] || [];
        const totalBills = bList.reduce((sum: number, b: any) => sum + (b.status === 'Bebas' ? 0 : b.amount), 0);
        const totalPaid = bList.reduce((sum: number, b: any) => sum + b.paid, 0);
        const remainingArrears = bList.reduce((sum: number, b: any) => sum + b.remaining, 0);
        const unpaidBills = bList.filter((b: any) => b.remaining > 0);

        yearsMap.set(yId, {
          academic_year_id: yId,
          academic_year_name: enr.academic_years?.name || 'Tahun Ajaran',
          grade: enr.grade,
          unit: enr.unit,
          total_bills: totalBills,
          total_paid: totalPaid,
          remaining_arrears: remainingArrears,
          unpaid_bills_count: unpaidBills.length,
          bills_detail: bList
        });
      }

      // Also include any year with bills even if enrollment record wasn't joined
      for (const yId of Object.keys(studentBillsMap)) {
        if (filters.academicYearId && filters.academicYearId !== 'ALL' && yId !== filters.academicYearId) {
          continue;
        }
        if (!yearsMap.has(yId)) {
          const bList = studentBillsMap[yId] || [];
          const totalBills = bList.reduce((sum: number, b: any) => sum + (b.status === 'Bebas' ? 0 : b.amount), 0);
          const totalPaid = bList.reduce((sum: number, b: any) => sum + b.paid, 0);
          const remainingArrears = bList.reduce((sum: number, b: any) => sum + b.remaining, 0);
          const unpaidBills = bList.filter((b: any) => b.remaining > 0);

          yearsMap.set(yId, {
            academic_year_id: yId,
            academic_year_name: bList[0]?.academic_year?.name || 'Tahun Ajaran',
            grade: currentEnrollment?.grade || '-',
            unit: currentEnrollment?.unit || 'SMP IT',
            total_bills: totalBills,
            total_paid: totalPaid,
            remaining_arrears: remainingArrears,
            unpaid_bills_count: unpaidBills.length,
            bills_detail: bList
          });
        }
      }

      const years = Array.from(yearsMap.values());
      const grandTotalBills = years.reduce((sum, y) => sum + y.total_bills, 0);
      const grandTotalPaid = years.reduce((sum, y) => sum + y.total_paid, 0);
      const grandTotalArrears = years.reduce((sum, y) => sum + y.remaining_arrears, 0);

      result.push({
        student: {
          ...student,
          current_enrollment: currentEnrollment
        },
        current_unit: currentEnrollment?.unit,
        current_grade: currentEnrollment?.grade,
        years,
        grand_total_bills: grandTotalBills,
        grand_total_paid: grandTotalPaid,
        grand_total_arrears: grandTotalArrears
      });
    }

    return result;
  }
};
