-- ============================================================================
-- CORREÇÃO DOS CRONS (Production) — NÃO APLICADO. Requer autorização específica para o banco Production.
--
-- Problema: /api/cron/birthdays e /api/cron/reminders exigem `Authorization: Bearer $CRON_SECRET`
-- (desde o commit c29880b, release de 09/11/2026), mas os jobs do pg_cron chamam
-- `net.http_get(url)` sem cabeçalho. Resultado: HTTP 401 todos os dias. O pg_cron marca "succeeded"
-- porque só confirma o envio da chamada.
--
-- Pré-requisitos
--   1. A variável CRON_SECRET existe nas variáveis de ambiente da Vercel (Production).
--   2. O MESMO valor é guardado no Vault do Supabase (passo A). O valor nunca vai para o Git.
-- ============================================================================

-- A) Guardar o segredo no Vault (executar UMA vez, no SQL Editor, colando o valor real no lugar do texto).
--    select vault.create_secret('COLE_AQUI_O_CRON_SECRET', 'cron_secret', 'Segredo das rotas /api/cron/*');

-- B) Reagendar os jobs enviando o cabeçalho (o segredo é lido do Vault em cada execução).
select cron.alter_job(
  job_id := 1,  -- disparo-aniversarios-diario
  command := $cmd$
    select net.http_get(
      url     := 'https://liturgiasje.vercel.app/api/cron/birthdays',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      )
    );
  $cmd$
);

select cron.alter_job(
  job_id := 4,  -- disparo-lembretes-escala-diario
  command := $cmd$
    select net.http_get(
      url     := 'https://liturgiasje.vercel.app/api/cron/reminders',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      )
    );
  $cmd$
);

-- C) Verificar (aguarde a próxima execução ou rode o job manualmente). Esperado: status_code = 200.
--    select status_code, created from net._http_response order by created desc limit 5;
--
-- D) Aniversários duplicados: o job 3 (`birthday-check`, Edge Function) também dispara às 08:00 BRT.
--    Escolha UM dos dois e remova o outro. Exemplo, mantendo a Edge Function:
--    select cron.unschedule(1);

-- ROLLBACK (volta ao comando anterior, que devolve 401):
--    select cron.alter_job(job_id := 1, command := $c$ select net.http_get('https://liturgiasje.vercel.app/api/cron/birthdays'); $c$);
--    select cron.alter_job(job_id := 4, command := $c$ select net.http_get('https://liturgiasje.vercel.app/api/cron/reminders'); $c$);
