# Liturgia SJE — HARNESS v2.0 (fluxo enxuto)

## Princípio
**Autonomia na execução; aprovação concentrada em Production e mudanças sensíveis de banco.**
Receber uma tarefa de desenvolvimento autoriza investigar, implementar, corrigir, testar, fazer commit e sincronizar a branch de feature, salvo restrição explícita do usuário. Não transformar cada subetapa em uma solicitação de aprovação.

## Fluxo padrão
1. **Entender o objetivo:** leia `AGENTS.md`, a branch atual, as alterações locais e os arquivos relevantes. Investigue apenas o necessário para implementar.
2. **Implementar:** faça a menor mudança correta; preserve comportamentos existentes, dados e trabalho não relacionado. Corrija problemas encontrados no próprio escopo.
3. **Validar por risco:** testes direcionados primeiro; TypeScript e build quando pertinentes; integração, Auth/RLS e concorrência para alterações críticas. Compare resultados com o baseline, sem bloquear por falhas legadas não relacionadas.
4. **Entregar em feature:** confira diff e segredos, faça commit e push normal (nunca force) para a branch `feature/*`. Permita o deployment automático de Preview. Se o remoto tiver avançado, integre com segurança antes do push.
5. **Homologar:** se a tarefa incluir promoção para a branch `preview`, execute-a depois dos testes e valide os fluxos reais; em caso de falha, corrija e repita. Um deployment da feature pode ser testado sem merge.
6. **Production:** somente após **"Enviar para produção"**, com release e smoke test. Mudanças no Supabase Production exigem aprovação específica separada.

## Matriz objetiva
| Atividade | Conduta padrão |
| --- | --- |
| Leitura de código, pesquisa, auditoria, testes locais | Executar |
| Implementação, refatoração no escopo, commit/push em feature | Executar |
| Vercel Preview automático ao fazer push em feature | Permitir |
| Merge/deploy em `preview` | Executar quando a tarefa abranger homologação em Preview |
| DDL/migration, restauração ou alteração destrutiva no Supabase Preview | Autorizar a homologação uma vez; executar plano validado |
| Merge/push em `main`, Vercel Production | Exigir **"Enviar para produção"** |
| Escrita/migration/restore no Supabase Production | Exigir autorização específica e recuperação planejada |
| Force push, descarte de alterações, vazamento de segredos | Não executar |

## Testes proporcionais
- **Docs e configuração:** sintaxe, consistência e `git diff --check`.
- **Frontend/API:** testes afetados; `npx tsc --noEmit` e lint direcionado; build quando necessário.
- **Mudança crítica:** `npm test -- --runInBand`, build, integração e verificações SQL/Auth/RLS/concorrência aplicáveis.
- **Homologação/Release:** smoke tests das jornadas essenciais (acesso, perfis, escalas, avisos, inativação e permissões) de acordo com o escopo.
- **Baseline:** separar erros anteriores de regressões. Não abrir uma refatoração ampla para corrigir avisos preexistentes.
- **Falha de ambiente:** registrar evidência e seguir nas atividades independentes; não fingir que testes de execuções anteriores rodaram novamente.

## Protocolo para schema e migrations
1. Confirmar projeto e ambiente exatos; comparar migration com schema efetivo.
2. Em banco remoto, só aplicar migration com autorização de homologação correspondente, compatibilidade verificada e recuperação definida.
3. Migration `DRAFT` não é aplicável. Dados pessoais não entram em fixtures ou commits.
4. Deployment Vercel de feature/Preview **não** autoriza migration e não deve ser bloqueado só porque o banco ainda não foi migrado. Reportar funcionalidades temporariamente indisponíveis até a homologação.
5. Nunca promover aplicação ou banco de Preview para Production implicitamente.

## Versionamento e PWA
- Na publicação autorizada para Production: seguir `scripts/bump-version.mjs`, revisar `APP_VERSION`, planejar `app_settings.min_version` e validar atualização do Service Worker `/sw.js?v=${APP_VERSION}`.
- `force_update_at` é uma intervenção excepcional para incidente comprovado de cache, não uma etapa rotineira de desenvolvimento.

## Comunicação
Responder em até cinco itens quando possível:
1. **Entregue:** mudança e benefício.
2. **Validação:** comandos executados, PASS/FAIL e limitações reais.
3. **Git/Preview:** branch, SHA e deployment quando aplicável.
4. **Pendências:** apenas impedimentos reais, ordenados por prioridade.
5. **Entenda o sistema:** uma explicação simples do fluxo afetado quando houver mudança de arquitetura.

**Regra de desempate:** prefira a ação segura e reversível que avance a tarefa. Pare apenas diante de risco relevante, autorização realmente necessária ou ausência de informação essencial. Evite documentação repetitiva, aprovações redundantes e escopo inflado.
