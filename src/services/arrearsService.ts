import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { StudentCrossYearArrears, StudentYearlyArrears, BillStatus, Student, StudentEnrollment, Bill } from '../types/database';
import { localStore } from './dataStore';
import { isUpcomingSPPMonth } from './billingService';

export const arrearsService = {
  async getCrossYearArrears(filters: {
    studentId?: string;
    academicYearId?: string | 'ALL';
    unit?: string | 'ALL';
    grade?: string | 'ALL';
    search?: string;
  } = {}): Promise<StudentCrossYearArrears[]> {
    if (!isSupabaseConfigured) {
      let students = localStore.getStudents();
      const allEnrollments = localStore.getEnrollments();
      const allYears = localStore.getAcademicYears();
      const allBills = localStore.getBills();
      const allCategories = localStore.getCategories();
      const allPayments = localStore.getPayments();
      const allAllocations = localStore.getAllocations();

      if (filters.studentId) {
        students = students.filter((s) => s.id === filters.studentId);
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        students = students.filter(
          (s) =>
            s.full_name.toLowerCase().includes(q) ||
            (s.nis && s.nis.toLowerCase().includes(q))
        );
      }

      const result: StudentCrossYearArrears[] = [];

      for (const st of students) {
        const enrollments = allEnrollments.filter((e) => e.student_id === st.id);
        const currentEnr = enrollments[0];

        if (filters.unit && filters.unit !== 'ALL' && currentEnr?.unit !== filters.unit) continue;
        if (filters.grade && filters.grade !== 'ALL' && currentEnr?.grade !== filters.grade) continue;

        // Student's bills
        let studentBills = allBills.filter((b) => b.student_id === st.id);
        if (filters.academicYearId && filters.academicYearId !== 'ALL') {
          studentBills = studentBills.filter((b) => b.academic_year_id === filters.academicYearId);
        }

        // Group by year
        const yearsMap = new Map<string, StudentYearlyArrears>();

        for (const yr of allYears) {
          if (filters.academicYearId && filters.academicYearId !== 'ALL' && yr.id !== filters.academicYearId) {
            continue;
          }

          const yBills = studentBills.filter((b) => b.academic_year_id === yr.id);
          if (yBills.length === 0 && !enrollments.some((e) => e.academic_year_id === yr.id)) {
            continue;
          }

          const enrForYr = enrollments.find((e) => e.academic_year_id === yr.id) || currentEnr;

          const billsDetail = yBills.map((b) => {
            const cat = allCategories.find((c) => c.id === b.category_id);
            const bAllocs = allAllocations.filter((a) => a.bill_id === b.id);
            const paid = bAllocs
              .filter((a) => allPayments.find((p) => p.id === a.payment_id)?.status === 'valid')
              .reduce((sum, a) => sum + Number(a.allocated_amount), 0);

            const amt = Number(b.amount || 0);
            const rem = Math.max(0, amt - paid);

            const isYearActive = yr.status === 'active';
            let st: BillStatus = 'Belum Dibayar';
            if (b.status === 'Bebas') st = 'Bebas';
            else if (paid >= amt && amt > 0) st = 'Lunas';
            else if (paid > 0) st = 'Belum Lunas';
            else if (b.status === 'Akan Berlangsung' && isYearActive && paid === 0) st = 'Akan Berlangsung';

            return {
              bill_id: b.id,
              category_name: cat?.name || 'Tagihan',
              billing_period: b.billing_period,
              amount: amt,
              paid: paid,
              remaining: (st === 'Bebas' || st === 'Akan Berlangsung') ? 0 : rem,
              status: st,
            };
          });

          const totalBills = billsDetail.reduce((sum, b) => sum + ((b.status === 'Bebas' || b.status === 'Akan Berlangsung') ? 0 : b.amount), 0);
          const totalPaid = billsDetail.reduce((sum, b) => sum + b.paid, 0);
          const totalRem = billsDetail.reduce((sum, b) => sum + b.remaining, 0);

          yearsMap.set(yr.id, {
            academic_year_id: yr.id,
            academic_year_name: yr.name,
            grade: enrForYr?.grade || '-',
            unit: enrForYr?.unit || 'SMP IT',
            total_bills: totalBills,
            total_paid: totalPaid,
            remaining_arrears: totalRem,
            unpaid_bills_count: billsDetail.filter((b) => b.remaining > 0).length,
            bills_detail: billsDetail,
          });
        }

        const years = Array.from(yearsMap.values());
        const grandTotalBills = years.reduce((s, y) => s + y.total_bills, 0);
        const grandTotalPaid = years.reduce((s, y) => s + y.total_paid, 0);
        const grandTotalArrears = years.reduce((s, y) => s + y.remaining_arrears, 0);

        result.push({
          student: {
            ...st,
            current_enrollment: currentEnr,
          },
          current_unit: currentEnr?.unit,
          current_grade: currentEnr?.grade,
          years,
          grand_total_bills: grandTotalBills,
          grand_total_paid: grandTotalPaid,
          grand_total_arrears: grandTotalArrears,
        });
      }

      return result;
    }

    try {
      let allStudentsData: any[] = [];
      let sPage = 0;
      const sPageSize = 1000;
      let sHasMore = true;

      while (sHasMore) {
        const from = sPage * sPageSize;
        const to = from + sPageSize - 1;

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

        studentQuery = studentQuery.range(from, to);
        const { data: students, error: studentError } = await studentQuery;
        if (studentError) throw studentError;

        if (students && students.length > 0) {
          allStudentsData = allStudentsData.concat(students);
          if (students.length < sPageSize) {
            sHasMore = false;
          } else {
            sPage++;
          }
        } else {
          sHasMore = false;
        }
      }

      const students = allStudentsData;

      let allBillsData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        let bQ = supabase
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
            academic_year:academic_years(id, name, status, start_date),
            allocations:payment_allocations(
              allocated_amount,
              payment:payments(status)
            )
          `)
          .range(from, to);

        if (filters.studentId) {
          bQ = bQ.eq('student_id', filters.studentId);
        }
        if (filters.academicYearId && filters.academicYearId !== 'ALL') {
          bQ = bQ.eq('academic_year_id', filters.academicYearId);
        }

        const { data: bBatch, error: billsError } = await bQ;
        if (billsError) throw billsError;

        if (bBatch && bBatch.length > 0) {
          allBillsData = allBillsData.concat(bBatch);
          if (bBatch.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }

      const bills = allBillsData;

      const billsByStudentYear: Record<string, Record<string, any[]>> = {};

      for (const bill of bills || []) {
        const sId = bill.student_id;
        const yId = bill.academic_year_id;
        if (!billsByStudentYear[sId]) billsByStudentYear[sId] = {};
        if (!billsByStudentYear[sId][yId]) billsByStudentYear[sId][yId] = [];

        const validPaid = (bill.allocations || [])
          .filter((a: any) => a.payment?.status === 'valid')
          .reduce((sum: number, a: any) => sum + Number(a.allocated_amount || 0), 0);

        const billAmount = Number(bill.amount || 0);
        const remaining = Math.max(0, billAmount - validPaid);

        const catObj: any = Array.isArray(bill.category) ? bill.category[0] : bill.category;
        const catName = catObj?.name || 'Tagihan';
        const isSpp = catName.toLowerCase().includes('spp') || catName.toLowerCase().includes('syahriyyah');
        const academicYearObj: any = Array.isArray(bill.academic_year) ? bill.academic_year[0] : bill.academic_year;
        const isUpcoming = isSpp && isUpcomingSPPMonth(bill.billing_period, academicYearObj);

        let calcStatus: BillStatus = 'Belum Dibayar';
        if (bill.status === 'Bebas') {
          calcStatus = 'Bebas';
        } else if (validPaid >= billAmount && billAmount > 0) {
          calcStatus = 'Lunas';
        } else if (validPaid > 0) {
          calcStatus = 'Belum Lunas';
        } else if (isUpcoming) {
          calcStatus = 'Akan Berlangsung';
        }

        billsByStudentYear[sId][yId].push({
          bill_id: bill.id,
          category_name: catName,
          billing_period: bill.billing_period,
          amount: billAmount,
          paid: validPaid,
          remaining: (calcStatus === 'Bebas' || calcStatus === 'Akan Berlangsung') ? 0 : remaining,
          status: calcStatus
        });
      }

      const result: StudentCrossYearArrears[] = [];

      for (const student of students || []) {
        const enrollments = student.student_enrollments || [];
        const studentBillsMap = billsByStudentYear[student.id] || {};

        const sortedEnrollments = [...enrollments].sort((a: any, b: any) => 
          new Date(b.academic_years?.start_date || 0).getTime() - new Date(a.academic_years?.start_date || 0).getTime()
        );
        const currentEnrollment = sortedEnrollments[0];

        if (filters.unit && filters.unit !== 'ALL') {
          if (currentEnrollment?.unit !== filters.unit) continue;
        }
        if (filters.grade && filters.grade !== 'ALL') {
          if (currentEnrollment?.grade !== filters.grade) continue;
        }

        const yearsMap = new Map<string, StudentYearlyArrears>();

        for (const enr of enrollments) {
          const yId = enr.academic_year_id;
          if (filters.academicYearId && filters.academicYearId !== 'ALL' && yId !== filters.academicYearId) {
            continue;
          }

          const bList = studentBillsMap[yId] || [];
          const totalBills = bList.reduce((sum: number, b: any) => sum + ((b.status === 'Bebas' || b.status === 'Akan Berlangsung') ? 0 : b.amount), 0);
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
    } catch {
      return this.getCrossYearArrears(filters);
    }
  }
};
