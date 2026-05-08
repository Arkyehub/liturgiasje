
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkColumns() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Erro ao buscar settings:', error);
    process.exit(1);
  }
  console.log('Dados atuais da tabela app_settings:', data);
}

checkColumns();
