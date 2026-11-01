# Testes de banco isolado

Execute apenas em PostgreSQL descartável, sem rede e sem credenciais reais. Os fixtures simulam `auth.uid()` e políticas: não representam Supabase Auth real nem o estado de Preview.

Ordem: `fixture.sql`, schema do commit base `git show HEAD:schema.sql`, `fixture-policies.sql`, `migration_archive_profiles.sql`, `write-boundary.sql`, `slot-actions.sql`, `edit-revision.sql`, `legacy-announcement.sql`, `create-delete.sql`, `batch-rollback.sql`, `batch-delete.sql`, `batch-success.sql`, `privileges.sql`, `slot-integrity.sql`, `mass-color.sql` e `new-rpc-security.sql`. Use `psql -X -v ON_ERROR_STOP=1 -1` para cada arquivo, em um banco vazio. A fixture é sintética e deliberadamente permissiva para testar as restrições.

`concurrency.cjs` confirma o container de teste pelo nome, imagem, ausência de rede e portas. Ele exige o banco `audit_final4` já inicializado pela ordem acima e cria dados sintéticos próprios. Executa cada par nas duas ordens. Alterar o nome do banco exige revisar a configuração do script; nunca o aponte para um banco existente.

`legacy-reproduction.sql`, `archive-integration.sql`, `direct-unassignment.sql`, `edit-history.sql` e `rollback.sql` registram testes de etapas anteriores. Alguns dependem de permissões diretas que a migration agora revoga e, portanto, não compõem a sequência atual de regressão.
