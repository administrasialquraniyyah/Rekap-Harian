-- ==============================================================================
-- SISTEM ADMINISTRASI KEUANGAN SD IT AL-QUR'ANIYYAH
-- SQL Master Migration: Skema Lengkap untuk Proyek Supabase SD IT Baru
-- ==============================================================================
-- Petunjuk Penggunaan:
-- 1. Buat proyek baru di https://supabase.com (misal: "SDIT Al-Qur'aniyyah")
-- 2. Masuk ke menu "SQL Editor" di dashboard Supabase proyek baru Anda
-- 3. Klik "New query", paste seluruh isi file ini, lalu klik "Run" (Ctrl+Enter)
-- 4. Semua tabel, relasi, indeks performa, data awal, dan izin akses akan dibuat otomatis!
-- ==============================================================================

-- Aktifkan ekstensi UUID generator
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. TABEL TAHUN AJARAN (academic_years)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS academic_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE, -- Contoh: '2026/2027'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Masukkan tahun ajaran default untuk SD IT
INSERT INTO academic_years (name, start_date, end_date, status)
VALUES
    ('2024/2025', '2024-07-01', '2025-06-30', 'archived'),
    ('2025/2026', '2025-07-01', '2026-06-30', 'archived'),
    ('2026/2027', '2026-07-01', '2027-06-30', 'active')
ON CONFLICT (name) DO UPDATE 
SET status = EXCLUDED.status;

-- ==============================================================================
-- 2. TABEL SISWA (students)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nis VARCHAR(50),
    full_name VARCHAR(255) NOT NULL,
    gender VARCHAR(20) CHECK (gender IN ('Laki-laki', 'Perempuan', 'L', 'P')),
    phone VARCHAR(50),
    student_status VARCHAR(30) NOT NULL DEFAULT 'aktif' CHECK (student_status IN ('aktif', 'lulus', 'pindah', 'nonaktif')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdit_students_nis ON students(nis);
CREATE INDEX IF NOT EXISTS idx_sdit_students_full_name ON students(full_name);

-- ==============================================================================
-- 3. TABEL ENROLLMENT / KELAS PER TAHUN AJARAN (student_enrollments)
-- Khusus SD IT: Unit 'SD IT', Grade 'I', 'II', 'III', 'IV', 'V', 'VI'
-- ==============================================================================
CREATE TABLE IF NOT EXISTS student_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    unit VARCHAR(50) NOT NULL DEFAULT 'SD IT', -- 'SD IT'
    grade VARCHAR(20) NOT NULL, -- 'I', 'II', 'III', 'IV', 'V', 'VI'
    administrative_status VARCHAR(50) NOT NULL DEFAULT 'Mampu', -- 'Mampu', 'Yatim', 'Dhuafa', 'Beasiswa', 'Rekomendasi'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_sdit_student_academic_year UNIQUE (student_id, academic_year_id)
);

CREATE INDEX IF NOT EXISTS idx_sdit_enrollments_student ON student_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_sdit_enrollments_year ON student_enrollments(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_sdit_enrollments_unit_grade ON student_enrollments(unit, grade);

-- ==============================================================================
-- 4. TABEL KATEGORI TAGIHAN (billing_categories)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS billing_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    category_type VARCHAR(30) NOT NULL DEFAULT 'one_time' CHECK (category_type IN ('monthly', 'one_time')),
    order_index INT DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Masukkan Kategori Tagihan Standar SD IT
INSERT INTO billing_categories (name, category_type, order_index, is_active)
VALUES
    ('SPP', 'monthly', 1, true),
    ('Perlengkapan', 'one_time', 2, true),
    ('Peralatan', 'one_time', 3, true),
    ('Kegiatan', 'one_time', 4, true),
    ('Pembangunan', 'one_time', 5, true),
    ('Ujian', 'one_time', 6, true),
    ('Buku Paket', 'one_time', 7, true),
    ('Lainnya', 'one_time', 8, true)
ON CONFLICT (name) DO NOTHING;

-- ==============================================================================
-- 5. TABEL TAGIHAN SISWA (bills)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES billing_categories(id) ON DELETE RESTRICT,
    billing_period VARCHAR(50), -- 'Juli', 'Agustus', ..., 'Juni' untuk SPP bulanan, NULL untuk satu kali
    amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
    due_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'Belum Dibayar' CHECK (status IN ('Belum Dibayar', 'Belum Lunas', 'Lunas', 'Bebas')),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdit_bills_student ON bills(student_id);
CREATE INDEX IF NOT EXISTS idx_sdit_bills_academic_year ON bills(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_sdit_bills_category ON bills(category_id);
CREATE INDEX IF NOT EXISTS idx_sdit_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_sdit_bills_period ON bills(billing_period);

-- ==============================================================================
-- 6. TABEL PEMBAYARAN / TRANSAKSI (payments)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_number VARCHAR(100) NOT NULL UNIQUE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    payment_date DATE NOT NULL,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) DEFAULT 'Tunai',
    notes TEXT,
    created_by TEXT DEFAULT 'Bendahara SD IT',
    status VARCHAR(20) NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdit_payments_student ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_sdit_payments_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_sdit_payments_status ON payments(status);

-- ==============================================================================
-- 7. TABEL ALOKASI PEMBAYARAN KE TAGIHAN (payment_allocations)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    allocated_amount NUMERIC(14, 2) NOT NULL CHECK (allocated_amount > 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdit_allocations_payment ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_sdit_allocations_bill ON payment_allocations(bill_id);

-- ==============================================================================
-- 8. TABEL AUDIT LOG (audit_logs)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT,
    action VARCHAR(50) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'CANCEL', 'IMPORT'
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdit_audit_entity ON audit_logs(entity_type, entity_id);

-- ==============================================================================
-- 9. VIEW REKAP STATUS TAGIHAN (view_bill_details)
-- ==============================================================================
CREATE OR REPLACE VIEW view_bill_details AS
SELECT 
    b.id AS bill_id,
    b.student_id,
    b.academic_year_id,
    b.category_id,
    b.billing_period,
    b.amount AS bill_amount,
    b.due_date,
    b.description,
    b.status AS raw_status,
    COALESCE(SUM(pa.allocated_amount) FILTER (WHERE p.status = 'valid'), 0) AS total_paid,
    (b.amount - COALESCE(SUM(pa.allocated_amount) FILTER (WHERE p.status = 'valid'), 0)) AS remaining_amount,
    CASE 
        WHEN b.status = 'Bebas' THEN 'Bebas'
        WHEN COALESCE(SUM(pa.allocated_amount) FILTER (WHERE p.status = 'valid'), 0) >= b.amount AND b.amount > 0 THEN 'Lunas'
        WHEN COALESCE(SUM(pa.allocated_amount) FILTER (WHERE p.status = 'valid'), 0) > 0 THEN 'Belum Lunas'
        ELSE 'Belum Dibayar'
    END AS calculated_status
FROM bills b
LEFT JOIN payment_allocations pa ON b.id = pa.bill_id
LEFT JOIN payments p ON pa.payment_id = p.id
GROUP BY b.id;

-- ==============================================================================
-- 10. KEBIJAKAN HAK AKSES / RLS (Row Level Security) & IZIN ANON PUBLIK
-- ==============================================================================
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Berikan izin akses CRUD penuh untuk role anon & authenticated
GRANT ALL ON TABLE academic_years TO anon, authenticated;
GRANT ALL ON TABLE students TO anon, authenticated;
GRANT ALL ON TABLE student_enrollments TO anon, authenticated;
GRANT ALL ON TABLE billing_categories TO anon, authenticated;
GRANT ALL ON TABLE bills TO anon, authenticated;
GRANT ALL ON TABLE payments TO anon, authenticated;
GRANT ALL ON TABLE payment_allocations TO anon, authenticated;
GRANT ALL ON TABLE audit_logs TO anon, authenticated;

-- Buat RLS Policy yang mengizinkan web app membaca dan menulis data
DROP POLICY IF EXISTS "Allow public all access to academic_years" ON academic_years;
DROP POLICY IF EXISTS "Allow public all access to students" ON students;
DROP POLICY IF EXISTS "Allow public all access to student_enrollments" ON student_enrollments;
DROP POLICY IF EXISTS "Allow public all access to billing_categories" ON billing_categories;
DROP POLICY IF EXISTS "Allow public all access to bills" ON bills;
DROP POLICY IF EXISTS "Allow public all access to payments" ON payments;
DROP POLICY IF EXISTS "Allow public all access to payment_allocations" ON payment_allocations;
DROP POLICY IF EXISTS "Allow public all access to audit_logs" ON audit_logs;

CREATE POLICY "Allow public all access to academic_years" ON academic_years FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access to students" ON students FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access to student_enrollments" ON student_enrollments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access to billing_categories" ON billing_categories FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access to bills" ON bills FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access to payments" ON payments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access to payment_allocations" ON payment_allocations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access to audit_logs" ON audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Selesai! Skema database SD IT Al-Qur'aniyyah siap digunakan 100%.
