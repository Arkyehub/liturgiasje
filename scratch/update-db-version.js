
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updateVersion() {
  const newVersion = '1.27';
  const { data, error } = await supabase
    .from('app_settings')
    .update({ min_version: newVersion })
    .eq('id', 1); // Geralmente o id é 1 para settings globais

  if (error) {
    console.error('Erro ao atualizar versão:', error);
    process.exit(1);
  }
  console.log('Tabela app_settings atualizada para min_version:', newVersion);
}

updateVersion();
