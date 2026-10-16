const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://iryeosxfpeeeeeyzonsa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyeWVvc3hmcGVlZWVleXpvbnNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMTMyODYsImV4cCI6MjEwNzY4OTI4Nn0.tp1HgSpFp6Poj7zd65kA_0cPz3avtoqt8kPSmdFAduY'
);

async function testQuery() {
  const nis = '00110100512';
  const name = "Ahmad Rifa'i";
  const res = await sb.from('students').select('id, full_name, nis').or(`nis.eq.${nis},full_name.ilike.${name}`);
  console.log('Result:', res);
}
testQuery();
