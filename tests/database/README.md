# Testes de banco isolado

Execute apenas em PostgreSQL descartável, sem rede e sem credenciais reais. Os fixtures simulam `auth.uid()` e políticas: não representam Supabase Auth real nem o estado de Preview.

Ordem: `fixture.sql`, schema do commit base `git show HEAD:schema.sql`, `fixture-policies.sql`, `migration_archive_profiles.sql`, `write-boundary.sql`, `unarchive.sql`, `slot-actions.sql`, `edit-revision.sql`, `legacy-announcement.sql`, `create-delete.sql`, `batch-rollback.sql`, `batch-delete.sql`, `batch-success.sql`, `privileges.sql`, `slot-integrity.sql`, `mass-color.sql` e `new-rpc-security.sql`. Use `psql -X -v ON_ERROR_STOP=1 -1` para cada arquivo, em um banco vazio. A fixture é sintética e deliberadamente permissiva para testar as restrições.

`concurrency.cjs` confirma o container de teste pelo nome, imagem, ausência de rede e portas. Ele exige o banco `audit_final4` já inicializado pela ordem acima e cria dados sintéticos próprios. Executa cada par nas duas ordens. Alterar o nome do banco exige revisar a configuração do script; nunca o aponte para um banco existente.

`legacy-reproduction.sql`, `archive-integration.sql`, `direct-unassignment.sql`, `edit-history.sql` e `rollback.sql` registram testes de etapas anteriores. Alguns dependem de permissões diretas que a migration agora revoga e, portanto, não compõem a sequência atual de regressão.

## Espelho das policies do Preview (v1.39)

`fixture-preview-policies.sql` reproduz as policies e grants observados (somente leitura) no Supabase Preview e substitui `fixture-policies.sql` quando se quer testar contra o estado real. `preview-archived-actor.sql` (após a migration) prova que um administrador arquivado não escreve em `app_settings`, avisos, missas etc., que `app_settings` continua legível por `anon` e que um perfil arquivado sem vínculo não pode ser reivindicado. `unarchive.sql` cobre a reativação. Para a concorrência sem Docker: `PG_LOCAL_SOCKET_DIR=<dir do socket> PG_LOCAL_PORT=<porta> PG_LOCAL_DB=audit_final4 node tests/database/concurrency.cjs`.

Recuperação: `migration_archive_profiles_rollback.sql` remove tudo o que a migration criou, preserva colunas e histórico e restaura os grants anteriores.
