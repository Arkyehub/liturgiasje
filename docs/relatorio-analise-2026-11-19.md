# Relatório de análise — Liturgia SJE

Data: 19/11/2026 · Versão analisada: 1.42 (`main` em `43b2fd4`) · Escopo: frontend, código, banco, infra e dependências.
Método: leitura do código, execução de `tsc`/`eslint`/`jest`/`npm audit`, consultas **somente leitura** nos dois projetos Supabase (Preview e Production), logs de API e medições no navegador (Playwright) contra o app compilado com um Supabase **simulado e dados sintéticos**. Nada foi alterado no código, nos bancos ou na Vercel.

---

## 1. Resumo executivo

| # | Severidade | Achado | Estado |
|---|---|---|---|
| A | **Crítica (regressão em produção)** | Os lembretes de escala e os avisos de aniversário disparados pelo `pg_cron` voltam **401** desde o release de 09/11. O `pg_cron` mostra "succeeded", mas a rota do Next recusa a chamada. | Confirmado por logs e histórico do git |
| B | Alta | "Página que recarrega o tempo todo": um polling de 30 s no `AuthProvider` troca o objeto `profile` e faz páginas refazerem as consultas e piscar spinners/esqueletos. | Reproduzido e medido |
| C | Alta | `/api/push/send`: qualquer membro logado consegue mandar uma notificação com texto livre para **todos**, desde que o texto contenha a palavra "troca". | Confirmado na leitura do código |
| D | Alta (privacidade) | Pelas policies, **qualquer membro logado** lê WhatsApp, e-mail e data de nascimento de **todos** os perfis (e da tabela legada `users`). | Confirmado nas policies |
| E | Alta (dependências) | `npm audit`: 27 vulnerabilidades (2 críticas, 16 altas). A crítica direta é o **Next.js** (DoS com Server Components). `shadcn` e `@google/design.md` estão em `dependencies` e arrastam a maior parte do resto. | Confirmado |
| F | Média | Excesso de chamadas de autenticação e de leitura (`getUser` em repositórios e no proxy; RLS com subconsultas em `profiles`). | Medido |
| G | Média/Baixa | Dívida técnica: arquivos enormes, 98 erros de `any`, logs com dados pessoais, sem CI, sem `vercel.json`. | Medido |

Limitação importante: **não consegui inspecionar a Vercel** do projeto `liturgiasje` (ver seção 8).

---

## 2. A — Crons voltando 401 (regressão do release de 09/11)

**O que acontece**
- O `pg_cron` do Production tem 4 jobs. Dois chamam rotas do Next: `disparo-aniversarios-diario` (`/api/cron/birthdays`, 08:00 BRT) e `disparo-lembretes-escala-diario` (`/api/cron/reminders`, 13:00 BRT).
- Esses dois jobs **não enviam o cabeçalho `Authorization`**. Os outros dois (Edge Functions) enviam.
- Desde o commit `c29880b` (01/11, "member archiving v1.39 [WIP]"), as duas rotas passaram a exigir `Authorization: Bearer $CRON_SECRET`. Antes disso as rotas não validavam segredo.
- As respostas HTTP que o `pg_net` ainda guarda (7 dias) são: 2 × **401** (as rotas do Next) e 1 × 200 (Edge Function).
- O `pg_cron` registra "succeeded" porque só confirma que a chamada foi **enviada**, não a resposta. Por isso a falha fica invisível.

**Impacto:** desde o deploy de 09/11 (v1.40), os **lembretes de escala por push não saem**. Os avisos de aniversário continuam saindo pela Edge Function `birthday-notifications` (job `birthday-check`, também às 08:00). Antes da regressão os dois jobs de aniversário rodavam juntos, o que pode ter gerado notificação duplicada (hipótese, não verificada).

**Responsabilidade:** o release passou nos testes unitários, mas ninguém conferiu a ligação entre a rota e o agendador. Eu fiz o release e deveria ter checado.

**Correção sugerida (precisa de decisão e autorização para escrever no Production)**
1. Confirmar que `CRON_SECRET` existe nas variáveis de ambiente da Vercel (Production). Se não existir, a rota devolve 401 de qualquer forma.
2. Atualizar os jobs 1 e 4 com `cron.alter_job` para enviar `Authorization: Bearer <segredo>`, lendo o segredo do `supabase_vault` (sem colar o valor em texto).
3. Decidir o que fazer com a duplicidade de aniversários (jobs 1 e 3): manter só um.
4. Passar a monitorar: consultar `net._http_response` ou criar um alerta quando houver resposta ≠ 2xx.

---

## 3. B — Página que recarrega o tempo todo

**Causa-raiz (reproduzida)**
- `src/app/providers/AuthProvider.tsx:81-82` faz `setInterval(refresh, 30000)` e também refaz o perfil a cada `focus`. Cada refresh cria um **novo objeto** `profile`, mesmo sem mudança de conteúdo.
- Várias telas usam o objeto `profile` inteiro nas dependências de `useEffect`:
  - `src/app/page.tsx:394` (home) recarrega avisos, escala, próximas leituras, trocas e aniversários;
  - `src/app/admin/membros/page.tsx:66` recarrega a lista de membros;
  - `src/app/admin/membros/[id]/page.tsx:51` (a análise do membro, feita por mim) refaz todas as consultas — erro meu, mesma causa.
- Esses recarregamentos são **não silenciosos**: acendem o estado de loading e a seção vira esqueleto/spinner.

**Medição (app compilado, Supabase simulado, usuário parado por 65 s)**

| Página | Requisições sem ninguém tocar | Spinners/esqueletos de seção que reapareceram |
|---|---|---|
| `/` (home) | 18 (`profiles` 8, `schedule_slots` 4, `announcements` 2, `masses` 2, `auth/user` 2) | 4 |
| `/admin/membros` | 4 | 2 (a lista inteira some e volta) |
| `/admin/membros/[id]` | 8 | 0 (recarrega em silêncio) |

- Voltar para a aba/app 3 vezes na home custou **42 requisições** (14 por retorno): o refresh do perfil, o recarregamento "silencioso" de foco e **de novo** o recarregamento da mudança de `profile`.
- **Não reproduzi** a hipótese de que o app inteiro vira spinner de tela cheia (`if (loading) return <spinner>` em `page.tsx:428`). Em 65 s e em 3 retornos de foco isso ficou em 0. O risco existe no código, mas não foi observado.

**Efeito em produção:** além do "pisca", multiplica as chamadas ao banco (seção 6).

**Correção sugerida (pequena e segura)**
1. No `AuthProvider`, só chamar `setProfile` se o conteúdo mudou (comparar campos) ou expor `profile?.id`/`role`/`archivedAt` estáveis.
2. Nas telas, usar `profile?.id` e `profile?.role` nas dependências, nunca o objeto.
3. Trocar o polling de 30 s por atualização ao voltar para a aba (com intervalo mínimo) e, no máximo, 5 min em segundo plano.
4. Carga inicial não silenciosa; atualizações sempre silenciosas (já existe o parâmetro `silent`).
5. Limitar a escrita de `last_seen_at` (hoje é um `PATCH` a cada refresh; 42 por dia no Production).

---

## 4. C — `/api/push/send` permite disparo amplo por membro comum

`src/app/api/push/send/route.ts:29-37`: se o remetente não é admin, basta o título ou o corpo conter "troca" (`includes('troca')`). Não há limite de destinatários, nem modelo fixo de mensagem, nem limite de frequência. `targetUserIds` é opcional; sem ele o envio é **global**.

**Risco:** um membro logado consegue mandar uma notificação arbitrária (spam, golpe) para todos, com o ícone do app. **Sugestão:** para não admin, aceitar só um modelo fixo de "pedido de troca" montado no servidor, validar que `targetUserIds` é o autor/atribuído do slot e aplicar limite por usuário.

---

## 5. D — Privacidade: dados pessoais legíveis por todos os membros

- `profiles`: policy "Perfis visíveis por todos os autenticados" (`auth.role() = 'authenticated'`). O `select *` devolve WhatsApp, e-mail e data de nascimento de todos os membros (36 perfis).
- Tabela legada `public.users` (42 linhas, e-mail, WhatsApp, nascimento): 7 policies, está na publicação do Realtime e não é usada pelo app.
- Verifiquei em leitura que um visitante **sem login** não vê linhas da `users` (0) e que `profiles` nega acesso anônimo. O risco é de **membro para membro**, não público.
- **Sugestão:** limitar o que o app precisa dos outros membros (nome, avatar, aniversário) por uma view ou RPC e fechar o resto. Avaliar com a coordenação (LGPD) antes de agir. Remover/arquivar a tabela `users` e a função `delete_user_by_admin`, que referencia a tabela `members` que não existe.

---

## 6. F — Banco e infraestrutura

**Estatísticas do Production (acumuladas)**
- `profiles` (38 linhas): **2,46 milhões** de leituras sequenciais e 2,25 milhões por índice.
- `schedule_slots` (554 linhas): 637 mil leituras sequenciais; faltam índices (FK `mass_id`, `profile_id`).
- Auth: ~182 mil leituras de `auth.users` e ~200 mil de `sessions` — vem de `supabase.auth.getUser()` (rede) usado em `src/shared/api/supabaseMiddleware.ts:39` (em **toda** requisição que passa pelo proxy) e em `SupabaseAnnouncementRepository.ts:39 e 92`.
- Realtime: 636 mil chamadas de leitura do WAL (63 min de CPU de banco) com 5 tabelas na publicação `supabase_realtime`, embora o código não use Realtime (`grep .channel(` = 0).
- Últimas 24 h na API: 376 `profiles` (GET), 245 `auth/v1/user`, 132 `schedule_slots`, 42 `PATCH profiles` (`last_seen_at`).

**Avisos do Supabase (Production)**
- Performance: 10 FKs sem índice; 25 policies re-avaliando `auth.uid()` por linha (usar `(select auth.uid())`); 60 avisos de políticas permissivas duplicadas (inclui as 7 da tabela `users`).
- Segurança: RPCs executáveis por usuários logados (esperado, são a API do app); `handle_new_user` executável por `anon` e `authenticated` (função de trigger exposta); proteção contra senhas vazadas desativada (o app usa Google).
- Grants padrão do Supabase dão `TRUNCATE`, `TRIGGER` e `REFERENCES` a `anon`/`authenticated` nas tabelas não cobertas pela migration v1.39 (`announcements`, `app_settings`, `unavailable_dates` etc.). O PostgREST não expõe isso, mas é superfície desnecessária.

**Divergência de schema entre ambientes:** o Preview tem `schedule_slots.original_profile_id`; o Production não. Isso causou dois bugs (análise do membro e painel de análise). Nenhum código grava nessa coluna (0 linhas no Preview). Recomendo ou remover do Preview/`schema.sql`, ou criar nos dois e decidir seu uso.

**Crons:** estão no `pg_cron`, não no repositório. Não há `vercel.json` nem CI (`.github` não existe). A configuração real do agendamento só existe no banco.

---

## 7. G — Frontend e qualidade de código

- **Tamanho:** `src/app/page.tsx` tem 1.405 linhas (57 dos problemas de lint); `AnnouncementForm.tsx` 834; `ScheduleForm.tsx` 770. Responsabilidades misturadas (dados, regras de domínio, UI, efeitos).
- **Lint:** 100 erros (98 `no-explicit-any`, 2 `set-state-in-effect`) e 86 avisos (70 variáveis não usadas, 9 dependências de hook ausentes, 7 `<img>` em vez de `next/image`). 74 usos de `any` fora de testes.
- **Logs:** 17 `console.log`; `AuthProvider.tsx:31` imprime o **perfil completo** (nome, e-mail, WhatsApp, nascimento) no console do navegador a cada refresh.
- **Duplicação:** o mapa de rótulos das funções (`C`, `1L`, `2L`, `P`, `L`) está repetido em pelo menos 4 lugares.
- **Comportamento redundante:** a home tem seu próprio efeito de "rolar ao topo" (`page.tsx:417`) além do `ScrollToTop` global.
- **Service Worker (`public/sw.js`):** estratégia correta (rede primeiro para navegação, stale-while-revalidate para ativos), não faz `skipWaiting` automático (evita recarga forçada). O `CACHE_NAME` é fixo (`liturgia-sje-v4`).
- **Testes:** 25 arquivos de teste, 66 testes verdes. Falta teste de integração do fluxo de autenticação/recarregamento (por isso o item B passou).
- **Docs:** `README.md` ainda é o texto padrão do `create-next-app`. `docs/pr-assets/` (≈1 MB de imagens) foi para a `main`.
- **Pontos fortes:** camadas claras (`domain`/`data`/`features`), escritas críticas por RPC transacional com locks, RLS restritiva para arquivados, rollback documentado, ~66 testes, bump de versão e atualização do PWA controlados.

---

## 8. Dependências (`npm audit --omit=dev`)

- 27 vulnerabilidades: 2 críticas, 16 altas, 8 moderadas, 1 baixa.
- **Next.js (crítica, direta):** DoS com Server Components; atualizar a versão do Next.
- `shadcn` e `@google/design.md` estão em `dependencies`, mas são ferramentas de desenvolvimento; trazem `@modelcontextprotocol/sdk`, `hono`, `zod` antigo etc. Mover para `devDependencies` remove a maior parte do risco do build de produção.
- Indiretas com correção disponível: `proxy-addr`, `body-parser`, `ws`, `nanoid`, `js-yaml` etc. (`npm audit fix`); `postcss` e `sharp` exigem atualização maior.

---

## 9. Limitações e permissões que faltaram

1. **Vercel do `liturgiasje`:** a conexão do Vercel nesta sessão só enxerga o time "Vitstock's projects" (`vitstock-hub`, `calculdora`). O projeto está no time `leonardo-vitorinos-projects`, e a chamada devolveu 403. Para ler logs de runtime, variáveis (nomes) e configuração, é preciso autorizar esse time. Sem isso **não consegui verificar `CRON_SECRET`, erros 5xx ou o desempenho no lado da Vercel**.
2. Medições de recarregamento feitas com Supabase simulado (dados sintéticos), não com usuários reais.
3. Production: apenas leituras. A estatística de `pg_stat_*` é acumulada desde o último reset; usei como ordem de grandeza, não como taxa.
4. Não analisei desempenho de front (Lighthouse/Core Web Vitals) nem acessibilidade.

---

## 10. Plano de ação sugerido

**Agora (hoje)**
1. Corrigir os crons com 401 (item A). Depende de: segredo no Vercel, autorização para `cron.alter_job` no Production.
2. Autorizar o time da Vercel para eu confirmar `CRON_SECRET` e olhar erros de runtime.

**Esta semana**
3. Corrigir o recarregamento (item B): `AuthProvider` estável + dependências por `id` + polling mais leve. Inclui a minha página de análise.
4. Restringir `/api/push/send` (item C).
5. Atualizar o Next e mover `shadcn`/`@google/design.md` para `devDependencies` (item E).

**Próximas semanas**
6. Índices nas FKs, `(select auth.uid())` nas policies, limpar policies duplicadas e a tabela/função legadas; retirar tabelas do Realtime que não são usadas.
7. Decidir a política de privacidade dos dados dos membros (item D).
8. Quebrar `page.tsx`, zerar `any`/logs com dados pessoais, criar CI (lint + testes + build), versionar a configuração dos crons e reescrever o `README`.
