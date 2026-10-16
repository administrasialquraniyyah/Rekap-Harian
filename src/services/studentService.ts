import { supabase } from '../lib/supabase';
import { Student, StudentEnrollment, UnitType, AdministrativeStatus, StudentStatus } from '../types/database';

export interface StudentFilter {
  academicYearId?: string;
  unit?: UnitType | 'ALL';
  grade?: string | 'ALL';
  studentStatus?: StudentStatus | 'ALL';
  administrativeStatus?: AdministrativeStatus | 'ALL';
  search?: string;
}

export const studentService = {
  async getAllWithEnrollment(filters: StudentFilter = {}): Promise<Student[]> {
    let query = supabase
      .from('students')
      .select(`
        *,
        student_enrollments (
          id,
          student_id,
          academic_year_id,
          unit,
          grade,
          administrative_status,
          notes,
          academic_years (
            id,
            name,
            status
          )
        )
      `)
      .order('full_name', { ascending: true });

    if (filters.studentStatus && filters.studentStatus !== 'ALL') {
      query = query.eq('student_status', filters.studentStatus);
    }

    if (filters.search) {
      const term = `%${filters.search}%`;
      query = query.or(`full_name.ilike.${term},nis.ilike.${term},phone.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw error;

    let students: Student[] = (data || []).map((s: any) => {
      let current_enrollment: StudentEnrollment | undefined;
      const enrollments = s.student_enrollments || [];

      if (filters.academicYearId) {
        current_enrollment = enrollments.find(
          (e: any) => e.academic_year_id === filters.academicYearId
        );
      } else {
        // Find enrollment for active academic year, or latest
        current_enrollment = enrollments.find(
          (e: any) => e.academic_years?.status === 'active'
        ) || enrollments[0];
      }

      return {
        ...s,
        current_enrollment,
      };
    });

    // Client-side filtering for unit, grade, and administrative status if enrollment is filtered
    if (filters.academicYearId) {
      students = students.filter((s) => s.current_enrollment !== undefined);
    }

    if (filters.unit && filters.unit !== 'ALL') {
      students = students.filter((s) => s.current_enrollment?.unit === filters.unit);
    }

    if (filters.grade && filters.grade !== 'ALL') {
      students = students.filter((s) => s.current_enrollment?.grade === filters.grade);
    }

    if (filters.administrativeStatus && filters.administrativeStatus !== 'ALL') {
      students = students.filter(
        (s) => s.current_enrollment?.administrative_status === filters.administrativeStatus
      );
    }

    return students;
  },

  async getById(id: string): Promise<Student | null> {
    const { data, error } = await supabase
      .from('students')
      .select(`
        *,
        student_enrollments (
          id,
          student_id,
          academic_year_id,
          unit,
          grade,
          administrative_status,
          notes,
          academic_years (
            id,
            name,
            status
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async create(studentData: {
    nis?: string | null;
    full_name: string;
    gender: 'Laki-laki' | 'Perempuan';
    phone?: string | null;
    student_status?: StudentStatus;
    notes?: string | null;
    enrollment?: {
      academic_year_id: string;
      unit: UnitType;
      grade: string;
      administrative_status: AdministrativeStatus;
      notes?: string | null;
    };
  }): Promise<Student> {
    const { data: student, error: studentError } = await supabase
      .from('students')
      .insert([{
        nis: studentData.nis || null,
        full_name: studentData.full_name,
        gender: studentData.gender,
        phone: studentData.phone || null,
        student_status: studentData.student_status || 'aktif',
        notes: studentData.notes || null,
      }])
      .select()
      .single();

    if (studentError) throw studentError;

    if (studentData.enrollment) {
      const { error: enrollError } = await supabase
        .from('student_enrollments')
        .insert([{
          student_id: student.id,
          academic_year_id: studentData.enrollment.academic_year_id,
          unit: studentData.enrollment.unit,
          grade: studentData.enrollment.grade,
          administrative_status: studentData.enrollment.administrative_status,
          notes: studentData.enrollment.notes || null,
        }]);

      if (enrollError) throw enrollError;
    }

    return student;
  },

  async update(id: string, updates: Partial<Student>): Promise<Student> {
    const { data, error } = await supabase
      .from('students')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async upsertEnrollment(enrollment: {
    student_id: string;
    academic_year_id: string;
    unit: UnitType;
    grade: string;
    administrative_status: AdministrativeStatus;
    notes?: string | null;
  }): Promise<StudentEnrollment> {
    const { data, error } = await supabase
      .from('student_enrollments')
      .upsert([enrollment], { onConflict: 'student_id,academic_year_id' })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};
