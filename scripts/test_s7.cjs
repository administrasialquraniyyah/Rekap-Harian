const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://iryeosxfpeeeeeyzonsa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyeWVvc3hmcGVlZWVleXpvbnNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMTMyODYsImV4cCI6MjEwNzY4OTI4Nn0.tp1HgSpFp6Poj7zd65kA_0cPz3avtoqt8kPSmdFAduY'
);

const dump = JSON.parse(fs.readFileSync('src/data/initialExcelData.json', 'utf8'));

async function testStudent7() {
  const s7 = dump.students[6]; // Ahmad Omar Rafly Lubis
  console.log('Testing student 7:', s7);

  // Check enrollment
  const enr7 = dump.enrollments.find(e => e.student_id === s7.id);
  console.log('Enrollment:', enr7);

  // Check bills
  const bills7 = dump.bills.filter(b => b.student_id === s7.id);
  console.log('Bills count:', bills7.length);

  // Check payments
  const payments7 = dump.payments.filter(p => p.student_id === s7.id);
  console.log('Payments count:', payments7.length);
}
testStudent7();
