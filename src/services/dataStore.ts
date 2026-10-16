import initialData from '../data/initialExcelData.json';
import {
  Student,
  StudentEnrollment,
  AcademicYear,
  BillingCategory,
  Bill,
  Payment,
  PaymentAllocation,
  BillStatus
} from '../types/database';

const STORAGE_KEY = 'al_quraniyyah_finance_v1';

interface LocalState {
  academic_years: AcademicYear[];
  categories: BillingCategory[];
  students: Student[];
  enrollments: StudentEnrollment[];
  bills: Bill[];
  payments: Payment[];
  payment_allocations: PaymentAllocation[];
}

function loadState(): LocalState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to load from localStorage', e);
  }

  // Initial state from real Excel parsed data!
  const state: LocalState = {
    academic_years: initialData.academic_years as AcademicYear[],
    categories: initialData.categories as BillingCategory[],
    students: initialData.students as Student[],
    enrollments: initialData.enrollments as StudentEnrollment[],
    bills: initialData.bills as Bill[],
    payments: initialData.payments as Payment[],
    payment_allocations: initialData.payment_allocations as PaymentAllocation[],
  };

  saveState(state);
  return state;
}

function saveState(state: LocalState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // If quota exceeded or disabled, continue in memory
    console.warn('LocalStorage save error:', e);
  }
}

// In-memory working copy
let currentState: LocalState = loadState();

export const localStore = {
  getState(): LocalState {
    return currentState;
  },

  getAcademicYears(): AcademicYear[] {
    return currentState.academic_years;
  },

  saveAcademicYear(year: AcademicYear) {
    const idx = currentState.academic_years.findIndex((y) => y.id === year.id);
    if (idx >= 0) {
      currentState.academic_years[idx] = year;
    } else {
      currentState.academic_years.push(year);
    }
    saveState(currentState);
  },

  getCategories(): BillingCategory[] {
    return currentState.categories;
  },

  addCategory(cat: BillingCategory) {
    currentState.categories.push(cat);
    saveState(currentState);
  },

  getStudents(): Student[] {
    return currentState.students;
  },

  getEnrollments(): StudentEnrollment[] {
    return currentState.enrollments;
  },

  saveStudent(student: Student, enrollment?: StudentEnrollment) {
    const sIdx = currentState.students.findIndex((s) => s.id === student.id);
    if (sIdx >= 0) {
      currentState.students[sIdx] = student;
    } else {
      currentState.students.push(student);
    }

    if (enrollment) {
      const eIdx = currentState.enrollments.findIndex(
        (e) => e.student_id === enrollment.student_id && e.academic_year_id === enrollment.academic_year_id
      );
      if (eIdx >= 0) {
        currentState.enrollments[eIdx] = enrollment;
      } else {
        currentState.enrollments.push(enrollment);
      }
    }
    saveState(currentState);
  },

  getBills(): Bill[] {
    return currentState.bills;
  },

  saveBill(bill: Bill) {
    const idx = currentState.bills.findIndex((b) => b.id === bill.id);
    if (idx >= 0) {
      currentState.bills[idx] = bill;
    } else {
      currentState.bills.push(bill);
    }
    saveState(currentState);
  },

  saveBills(newBills: Bill[]) {
    currentState.bills.push(...newBills);
    saveState(currentState);
  },

  getPayments(): Payment[] {
    return currentState.payments;
  },

  getAllocations(): PaymentAllocation[] {
    return currentState.payment_allocations;
  },

  recordPayment(payment: Payment, allocations: PaymentAllocation[]) {
    currentState.payments.unshift(payment);
    currentState.payment_allocations.push(...allocations);

    // Update bill statuses
    for (const alloc of allocations) {
      const bIdx = currentState.bills.findIndex((b) => b.id === alloc.bill_id);
      if (bIdx >= 0) {
        const b = currentState.bills[bIdx];
        const validAllocations = currentState.payment_allocations.filter(
          (a) => a.bill_id === b.id && currentState.payments.find((p) => p.id === a.payment_id)?.status === 'valid'
        );
        const totalPaid = validAllocations.reduce((sum, a) => sum + Number(a.allocated_amount), 0);
        if (b.status !== 'Bebas') {
          if (totalPaid >= Number(b.amount)) {
            b.status = 'Lunas';
          } else if (totalPaid > 0) {
            b.status = 'Belum Lunas';
          } else {
            b.status = 'Belum Dibayar';
          }
        }
      }
    }
    saveState(currentState);
  },

  cancelPayment(paymentId: string, reason: string) {
    const pIdx = currentState.payments.findIndex((p) => p.id === paymentId);
    if (pIdx >= 0) {
      currentState.payments[pIdx].status = 'cancelled';
      currentState.payments[pIdx].notes = `[Dibatalkan: ${reason}] ${currentState.payments[pIdx].notes || ''}`;

      // Recalculate affected bills
      const affectedAllocations = currentState.payment_allocations.filter((a) => a.payment_id === paymentId);
      for (const alloc of affectedAllocations) {
        const bIdx = currentState.bills.findIndex((b) => b.id === alloc.bill_id);
        if (bIdx >= 0) {
          const b = currentState.bills[bIdx];
          const validAllocations = currentState.payment_allocations.filter(
            (a) => a.bill_id === b.id && currentState.payments.find((p) => p.id === a.payment_id)?.status === 'valid'
          );
          const totalPaid = validAllocations.reduce((sum, a) => sum + Number(a.allocated_amount), 0);
          if (b.status !== 'Bebas') {
            if (totalPaid >= Number(b.amount)) {
              b.status = 'Lunas';
            } else if (totalPaid > 0) {
              b.status = 'Belum Lunas';
            } else {
              b.status = 'Belum Dibayar';
            }
          }
        }
      }
      saveState(currentState);
    }
  },

  resetToInitialExcel() {
    currentState = {
      academic_years: initialData.academic_years as AcademicYear[],
      categories: initialData.categories as BillingCategory[],
      students: initialData.students as Student[],
      enrollments: initialData.enrollments as StudentEnrollment[],
      bills: initialData.bills as Bill[],
      payments: initialData.payments as Payment[],
      payment_allocations: initialData.payment_allocations as PaymentAllocation[],
    };
    saveState(currentState);
  }
};
