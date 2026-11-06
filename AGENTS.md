<!-- BEGIN:nextjs-agent-rules -->
# Liturgia SJE — Regras do agente (v2.0)

## Next.js
Este projeto usa Next.js 16, com diferenças importantes em relação a versões anteriores. Antes de alterar APIs, convenções ou estrutura do framework, consulte a documentação relevante em `node_modules/next/dist/docs/` e respeite avisos de depreciação.

## Objetivo
Entregar mudanças funcionais com rapidez, testes proporcionais ao risco e proteção rigorosa de Production. O agente deve executar o trabalho autorizado até a conclusão ou até encontrar um impedimento real — não interromper para aprovar cada consulta, teste, commit ou push de desenvolvimento. Consulte `HARNESS.md` para o fluxo operacional.

## Branches e autonomia
1. **Feature primeiro:** trabalhe na branch de feature existente; se necessário, crie uma branch `feature/*` a partir da base apropriada. Não presuma que a branch padrão de desenvolvimento seja `preview`.
2. **Execução autônoma:** dentro do escopo solicitado, pode pesquisar, editar, instalar dependências necessárias, executar testes, corrigir falhas, criar commits e fazer push de `feature/*`, sem solicitar autorização a cada etapa.
3. **Vercel Preview:** deployments automáticos de branches de feature e de `preview` fazem parte da homologação normal. Não os bloqueie por precaução genérica. Um deploy Preview não equivale a executar uma migration de banco nem a publicar Production.
4. **Branch `preview`:** integrar uma feature quando a tarefa já incluir homologação em Preview e os critérios relevantes estiverem atendidos. Sem essa autorização de escopo, manter na feature; não pedir múltiplas autorizações para etapas da mesma homologação.
5. **Production protegida:** merge/push em `main`, deploy ou promoção para Vercel Production exigem o comando explícito do usuário: **"Enviar para produção"**. Nunca interpretar autorização para Preview como autorização para Production.
6. **Histórico Git:** sem `push --force`, reset destrutivo, descarte de WIP ou sobrescrita de alterações alheias. Antes de qualquer push, verifique a branch e o destino real; o `origin` pode apontar para uma pasta local. Preserve commits e backups existentes.

## Bancos e segurança
- Consultas de leitura e auditorias nos ambientes autorizados podem ser executadas sem aprovações repetidas.
- **Supabase Preview:** criação/alteração de schema, aplicação de migration, restauração e operações destrutivas sobre dados existentes exigem autorização específica para a homologação. Uma vez autorizada, execute o plano completo e as validações sem pedir confirmação a cada comando.
- **Supabase Production:** nenhuma migration, escrita administrativa, exclusão, restauração ou mudança de configuração sem autorização específica para o banco Production, mesmo após autorização de deploy do aplicativo.
- Nunca aplique arquivos marcados `DRAFT` ou `NO-GO` em bancos remotos. Teste primeiro em ambiente isolado e confirme compatibilidade com o schema real e o procedimento de recuperação.
- Não exponha tokens, chaves, dados pessoais, dumps, conteúdo de `.env` ou segredos nos logs, commits e relatórios. Use dados sintéticos para testes.

## Validação proporcional
- Documentação/configuração: validar sintaxe, consistência e `git diff --check`.
- Código comum: testes direcionados, lint dos arquivos alterados e TypeScript quando aplicável.
- Fluxos críticos (Auth, RLS, escalas, exclusão/arquivamento, migrations): testes de integração e concorrência relevantes; build antes de homologar uma versão da aplicação.
- Antes de promover a versão: build, testes essenciais e smoke tests no ambiente de destino.
- Problemas legados comprovadamente fora do diff não bloqueiam automaticamente uma entrega. Registre-os separadamente; não amplie o escopo apenas para zerar avisos antigos.
- Quando infraestrutura impedir um teste, descreva o que foi **executado agora** e o que só foi validado anteriormente. Não declare PASS para testes não executados.

## Release, versão e cache
1. **Versão:** antes de um release autorizado para `main`, execute `node scripts/bump-version.mjs` e inclua os arquivos atualizados no release. Não aumente a versão a cada commit de feature.
2. **Banco na publicação:** sincronize `app_settings.min_version` com `APP_VERSION` somente como etapa planejada e autorizada do release Production, nunca durante desenvolvimento de feature.
3. **Safari/PWA:** registre o Service Worker usando a query de versão `/sw.js?v=${APP_VERSION}`.
4. **Atualização forçada:** altere `force_update_at` somente quando houver problema crítico comprovado de cache, no ambiente correto e com autorização se afetar Production.
5. Nunca misture uma migration de banco com um push Git sem verificar expressamente se existe automação que possa aplicá-la.

## Entrega
Informe de forma curta: **o que mudou, por quê, como foi validado, riscos reais e próximo passo**. Em mudanças de arquitetura, acrescente uma explicação prática de como o fluxo funciona. Prefira entregar correções testadas a produzir auditorias repetidas ou prompts sucessivos.
<!-- END:nextjs-agent-rules -->
