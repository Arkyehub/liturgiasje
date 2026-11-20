# Relatório de análise 2 — Liturgia SJE

Data: 20/11/2026 · Código analisado: `preview` em `4ceb466` (inclui os PRs #2, #3 e #4) · `main`/Production em `43b2fd4` (v1.42)
Escopo: erros, segurança, código ruim e otimização. Frontend, API, banco (Preview e Production), storage, agendamentos e dependências.
Método: leitura do código; `tsc`, `jest` com cobertura, build, `npm audit`/`outdated`; consultas **somente leitura** nos dois projetos Supabase (políticas, grants, storage, `pg_cron`, `pg_stat`, logs); testes em PostgreSQL local descartável. **Nada foi alterado em nenhum banco, na Vercel ou no Production.**

---

## 1. Resumo executivo

**O Production está saudável no dia a dia**: nas últimas 24 h só houve 2 respostas 401 anônimas em `app_settings` e 4 negações de `is_admin` para visitante sem login (ruído esperado); nenhuma tabela sem RLS, nenhuma função `SECURITY DEFINER` sem `search_path` fixo, nenhuma policy de escrita aberta, nenhum índice sem uso. Os riscos estão na **herança do banco** (tabela e funções legadas), no **storage** e em **segredos**.

| # | Severidade | Achado |
|---|---|---|
| 1 | **Alta** | Chave `service_role` em **texto puro** no `pg_cron` (job 3) e em **207 registros de histórico** (desde 27/04/2026) |
| 2 | **Alta** | A Edge Function de aniversário lê a tabela **legada `users`** e avisa membros **inativos** (14 assinaturas). **Corrige uma recomendação minha anterior.** |
| 3 | **Alta** | Storage: qualquer membro logado **altera e apaga** anexos de avisos de outras pessoas; 4 buckets públicos **sem limite de tamanho nem de tipo de arquivo** |
| 4 | **Alta** | A tabela legada `users` ainda está em uso pelo banco (FKs, trigger, storage, view) e tem uma brecha de privilégio. Limpeza proposta e testada. |
| 5 | Média | Redirecionamento aberto em `/auth/callback` (parâmetro `next`) |
| 6 | Média | `/api/push/subscribe` aceita qualquer URL como destino (SSRF cego) e 6 rotas devolvem `error.message` ao cliente |
| 7 | Média | Nenhum cabeçalho de segurança (CSP, anti-clickjacking, nosniff, referrer, permissions) |
| 8 | Média | Preview legível por visitantes sem login (e-mails da `users`, missas, avisos), diferente do Production |
| 9 | Média | Peso de mídia: avatares de ~1,1 MB cada (sem redimensionar); logo PNG de 380 KB em toda página |
| 10 | Média | Painel de análise carrega todas as escalas e todas as contas do Auth a cada abertura |
| 11 | Baixa | Service worker abre URL externa; `target="_blank"` sem `rel`; acessibilidade; 72 `any`; cobertura de funções 42%; dependências atrasadas |

---

## 2. O que mudou desde o relatório 1

| Item do relatório 1 | Situação |
|---|---|
| B — recarregamentos (polling de 30 s) | **Corrigido** (PR #2) e a sessão (PR #3); a lista de membros reativados também (PR #4). Medido: 0 requisições em 65 s parado. |
| C — push por membro | **Corrigido** (PR #2): só dois modelos fixos, destinatário validado, limite por remetente. Você confirmou que escala e mural funcionam. |
| E — dependências | **Corrigido** (PR #2): 27 → 0 vulnerabilidades de produção. |
| A — crons com 401 | **Parcial.** `CRON_SECRET` criado na Vercel e no Vault; job 4 (lembretes) corrigido. **Falta confirmar** na execução de 20/11 às 13:00 BRT. |
| Aniversários duplicados | **Eu errei na recomendação** (ver item 2). |
| Privacidade dos dados dos membros, limpeza da tabela `users` | Em aberto; item 4 abaixo traz o plano. |

---

## 3. Achados

### 1. Chave `service_role` em texto puro no agendador (Alta)
- O job 3 (`birthday-check`) guarda a chave `service_role` literal no comando; o job 2 guarda a chave `anon` (esta é pública por definição).
- O histórico `cron.job_run_details` repete o comando em **207 execuções** (27/04 a 19/11). Quem lê é o papel `postgres` (painel/SQL Editor).
- Impacto: a chave `service_role` ignora todo o RLS. Qualquer pessoa com acesso ao banco ou a um backup lê a chave em texto.
- **Correção:** (a) desagendar o job 3 (item 2); (b) apagar o histórico desse job (`delete from cron.job_run_details where jobid = 3`); (c) **rotacionar a chave** `service_role` depois, atualizando a Vercel. A Vercel já mostra "Needs Attention" nessa chave. Requer autorização para escrever no Production.

### 2. Aniversários: a Edge Function usa dados legados e ignora membros inativos (Alta)
Eu havia recomendado **manter a Edge Function** e desagendar o job da rota do Next. **Isso estava errado.**
- `birthday-notifications` lê aniversários de `public.users` e envia para **todas** as assinaturas de push, sem filtrar inativos.
- Medido no Production: das 32 datas em `users`, **5 diferem** das de `profiles`; **5 membros** preencheram a data no perfil e a tabela legada não tem (nunca recebem o aviso do aniversário deles); **2** inativos ainda têm data em `users`; **14 assinaturas** de perfis arquivados continuam recebendo.
- A rota `/api/cron/birthdays` usa `profiles` e filtra arquivados.
- **Correção:** reagendar o job 1 (rota do Next, com o cabeçalho do Vault, como o job 4) e **desagendar o job 3**. Hoje está invertido: o job 1 está desagendado e o job 3 ativo. Requer autorização no Production.

### 3. Storage sem controle de dono e sem limites (Alta)
- Buckets `avatars`, `announcement_media`, `leaflets`, `mass-photos`: todos **públicos**, **sem limite de tamanho** e **sem restrição de tipo (MIME)**.
- `announcement_media`: as policies `Usuários Autenticados podem Atualizar/Deletar` só exigem `bucket_id = 'announcement_media'`. **Qualquer membro logado pode sobrescrever ou apagar o anexo de qualquer aviso.** Há também 2 policies de upload duplicadas.
- Upload em `mass-photos` liberado para qualquer logado; sem limite, dá para encher o armazenamento ou hospedar HTML/scripts no seu domínio de storage.
- `avatars` está correto (a pasta deve ser o `auth.uid()`), com 3 policies redundantes.
- A policy de admin do storage consulta `public.users.role`, não `profiles` (item 4).
- **Correção:** limite de tamanho e tipos permitidos por bucket; UPDATE/DELETE só do autor ou do admin; remover duplicatas. É uma migration de storage (precisa de autorização; no Preview primeiro).

### 4. A tabela legada `users` ainda está em uso — plano de limpeza (Alta)
O app não a lê, mas o banco depende dela (você tinha razão em questionar):
1. **FKs:** `push_subscriptions`, `unavailable_dates` e `announcement_views` (`user_id`) apontam para `public.users(id)`. Apagar a tabela quebraria o cadastro de notificações.
2. **Trigger** `on_auth_user_created` → `handle_new_user()` grava em `users` a cada cadastro (63 inserts, 224 updates, 32 deletes registrados).
3. **Storage:** a policy `storage_media_admin_manage` decide "admin" por `users.role`. As policies da tabela deixam **cada usuário alterar a própria linha, inclusive `role`**. Quem se promove em `users` passa na checagem do storage. (A capacidade extra é pequena hoje porque as policies genéricas do item 3 já permitem tudo a qualquer membro, mas é uma brecha de privilégio.)
4. `users.id → auth.users(id)` **sem cascata**: pode bloquear a exclusão de uma conta no Auth enquanto houver linha legada. O teste local reproduziu o bloqueio.
5. Também: view `users_public`, função `delete_user_by_admin` (cita a tabela inexistente `members`), publicação Realtime.
6. Dados: 42 linhas com e-mail; 6 sem perfil; 2 admins em `users` contra 3 em `profiles`; 1 papel diferente.

**Plano (cada passo reversível):**
- Fase 0: migrar aniversários para a rota do Next e desagendar o job 3 (item 2). *Pré-requisito: a Edge Function lê `users`.*
- Fase 1: FKs passam para `auth.users(id)` com cascata (0 órfãos nos dois ambientes); policy de admin do storage passa a usar `is_admin()` (profiles).
- Fase 2: remover trigger, função, view e Realtime.
- Fase 3: renomear a tabela para `users_legacy_backup`, sem acesso pela API e sem a FK sem cascata. Apagar de vez após ~30 dias.
- **Entregue neste PR:** `migration_v144_legacy_users_cleanup.sql` (+ rollback) e `tests/database/legacy-users-cleanup.sql`. O teste local recria a estrutura legada, aplica, confere, reaplica (idempotência), reverte e confere. Ele achou dois erros no meu próprio rollback (linhas órfãs; contas criadas depois), já corrigidos.
- **Não aplicado.** Precisa de autorização para o Preview e depois para o Production, e o pré-requisito da Fase 0.

### 5. Redirecionamento aberto em `/auth/callback` (Média)
`src/app/auth/callback/route.ts` monta `redirect(origin + next)` com `next` vindo da URL, sem validar. Com `next=@site-malicioso.com` o resultado é `https://app@site-malicioso.com`, que vai para o outro site. Exige um `code` válido, então o risco é de login induzido por link. A página de erro `/auth/auth-code-error` para onde o código redireciona **não existe** (o usuário vê um 404 quando o login falha).
**Correção:** aceitar só caminhos internos (`/` seguido de caractere que não seja `/` nem `\`), e criar a página de erro.

### 6. `/api/push/subscribe` e vazamento de mensagens de erro (Média)
- O `endpoint` da assinatura não é validado. O servidor usa esse endereço para enviar notificações: um membro pode registrar um endereço interno ou externo qualquer e fazer o servidor chamá-lo a cada envio (SSRF cego). **Correção:** exigir `https` e hosts de serviços de push conhecidos (FCM, Mozilla, Apple, Windows), validar as chaves.
- 6 rotas devolvem `error.message` bruto ao cliente (detalhes de banco e nomes de colunas). **Correção:** mensagem genérica ao cliente, detalhe só no log.
- `analytics/route.ts` cai silenciosamente para a chave `anon` se `SUPABASE_SERVICE_ROLE_KEY` faltar.

### 7. Sem cabeçalhos de segurança (Média)
`next.config.ts` só define cache de `sw.js` e `manifest.json`. Faltam `Content-Security-Policy`, `frame-ancestors`/`X-Frame-Options` (clickjacking), `X-Content-Type-Options: nosniff`, `Referrer-Policy` e `Permissions-Policy`. O app não usa `dangerouslySetInnerHTML`, o que reduz o risco de XSS. **Correção:** começar com os cabeçalhos simples e uma CSP em modo "report-only" (o app usa Google One Tap, Supabase e Vercel Speed Insights).

### 8. Preview aberto a visitantes sem login (Média)
No Preview as policies `using (true)` deixam qualquer pessoa com a chave `anon` (que é pública) ler `masses`, `announcements`, `app_settings` e a tabela legada `users` (3 e-mails). O Production exige login. Medido com leitura simulando o papel `anon`. **Correção:** alinhar o Preview ao Production; a limpeza do item 4 resolve a parte de `users`.

### 9. Peso de mídia (Média)
- Avatares: 25 arquivos somam **27 MB** (≈ 1,1 MB cada). O recorte (`imageUtils.ts`) exporta na resolução original, e o avatar aparece em 40–96 px. **Correção:** reduzir para ~256 px (WebP, ~15–30 KB) antes do upload.
- `public/Logo-Liturgia-SJE.png`: **380 KB**, usado em todo cabeçalho (exibido a 40–56 px) e `bandeirinhas.png` 392 KB. **Correção:** versões 2× pequenas e `next/image`. Isso afeta o primeiro carregamento no celular.
- JS do cliente: 28 arquivos, ~1,7 MB bruto / **529 KB gzip** no total (uma rota carrega só uma parte). `app/page.tsx` com 1.405 linhas é um único componente de cliente.

### 10. Painel de análise não escala (Média)
`/api/admin/analytics`: lê **todas** as vagas (554 hoje, crescem a cada mês) sem filtro de data e chama `auth.admin.listUsers()` (todas as contas) a cada abertura. **Correção:** filtrar por período (hoje em diante e histórico recente), paginar e guardar em cache curto.

### 11. Baixa
- `public/sw.js`: o clique na notificação abre `new URL(url, origin)`; uma URL absoluta externa abre o outro site. Hoje a mensagem é controlada pelo servidor; vale restringir à mesma origem.
- ~~`target="_blank"` sem `rel`~~ **Retirado (falso positivo):** os 3 pontos já têm `rel="noreferrer"`, que o navegador trata como `noopener` também.
- Acessibilidade (do console do teste): `DialogContent` sem `Description` (o `UserAvatar`) e "aria-hidden em elemento com foco".
- Cron: `CRON_SECRET` comparado com `!==` (comparação de tempo não constante; risco desprezível).
- Qualidade: 72 `any`, 73 `console.*` (15 `console.log`), 7 `catch` que engolem erro, 31 ocorrências de TODO/FIXME/HACK (algumas podem ser falso positivo). Lint: 98 erros, 86 avisos (estável).
- **Cobertura de testes:** 67% das linhas, **42,5% das funções**, 66,7% dos ramos. Fortes: `features/members` 99%, `app/admin` 81%, `features/schedule` 79%. Fracos: `shared/lib` 26%, `data/repositories` 48%, `shared/api` 61%.
- Dependências atrasadas: `@supabase/supabase-js` 2.103 → 2.119, `@supabase/ssr` 0.10 → 0.12, `@base-ui/react` 1.3 → 1.9. Atualizações grandes: `date-fns` 3 → 4, `@hookform/resolvers` 5 → 7, `eslint` 9 → 10.
- Duplicação: policies redundantes em `profiles`, `storage.objects`, `users` (60 avisos do linter).

---

## 4. Pendências de configuração (não são código)
- **JWT expiry do Preview** parece curto (renova a cada 5 min): conferir (padrão 3600 s).
- **Vercel:** `SUPABASE_SERVICE_ROLE_KEY` (Production) e `VAPID_PRIVATE_KEY` com "Needs Attention"; o ambiente **Development usa as chaves de Production**.
- **Crons:** verificar o resultado real de 20/11 às 13:00 BRT (agendei uma checagem).

---

## 5. Plano de ação sugerido

| Prioridade | Ação | Precisa de |
|---|---|---|
| Hoje | Corrigir o par de aniversários (job 1 com Vault, desagendar job 3) | autorização Production |
| Hoje | Apagar o histórico do job 3 e rotacionar a chave `service_role` | autorização Production + atualizar Vercel |
| Esta semana | Corrigir `next` do callback + página de erro; validar `endpoint` do push; erros genéricos; cabeçalhos básicos | só código (preview) |
| Esta semana | Migration de storage (limites, dono nos anexos) | Preview primeiro, depois Production |
| Esta semana | Limpeza da tabela `users` (v144) | depois do item de aniversários; Preview e Production |
| Próximas semanas | Redimensionar avatares (e migrar os atuais), otimizar logos, filtro/paginação no painel de análise | código + script de migração dos avatares |
| Próximas semanas | Subir cobertura de funções (`shared/lib`, repositórios), reduzir `any`, dividir `page.tsx`, atualizar dependências | código |
| Depois | Alinhar o Preview ao Production; tirar do Realtime tabelas sem uso; privacidade dos dados dos membros (decisão da coordenação) | decisões |

---

## 6. Limitações
- Não acessei a Vercel do `liturgiasje` (outro time, 403): não verifiquei erros 5xx, cabeçalhos HTTP reais nem as variáveis além do que o seu print mostrou.
- Não li a configuração do Auth (JWT expiry, provedores).
- Medições de recarregamento e de bundle foram feitas em ambiente local; as de banco, nos projetos reais, em leitura.
- Estatísticas de `pg_stat_*` são acumuladas; usei só como ordem de grandeza.
- Não testei acessibilidade com leitor de tela nem desempenho (Lighthouse).
