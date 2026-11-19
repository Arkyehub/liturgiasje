# Liturgia SJE

PWA de gestão de escalas e comunicação do ministério de leitores (missas, trocas, avisos, aniversários e notificações push).

- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Supabase (Auth, Postgres/RLS, Storage) · Web Push · Vercel
- **Ambientes:** *Preview* (homologação, branch `preview`) e *Production* (branch `main`). Cada um tem seu projeto Supabase.

## Rodando localmente

```bash
npm ci
cp .env.example .env.local   # preencha com as chaves do projeto Supabase de Preview
npm run dev                  # http://localhost:3000
```

Variáveis de ambiente (nomes; os valores ficam na Vercel / `.env.local`, nunca no Git):

| Variável | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente Supabase (navegador e servidor) |
| `SUPABASE_SERVICE_ROLE_KEY` | rotas de servidor que precisam ignorar RLS (cron, push, analytics) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | notificações push |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | login Google One Tap |
| `CRON_SECRET` | segredo exigido por `/api/cron/*` (`Authorization: Bearer ...`) |

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` / `build` / `start` | desenvolvimento, build e servidor de produção |
| `npm test` | testes unitários (Jest) |
| `npx tsc --noEmit` | checagem de tipos |
| `npm run lint` | ESLint (há dívida antiga de `no-explicit-any`; o CI mostra, mas não bloqueia) |

O CI (`.github/workflows/ci.yml`) roda tipos, testes, build e `npm audit` de produção a cada push/PR.

## Estrutura

```
src/
  app/            rotas (App Router), páginas e rotas de API (admin, cron, push)
  domain/         modelos, interfaces de repositório e casos de uso (sem dependência de framework)
  data/           repositórios Supabase (traduzem snake_case <-> camelCase)
  main/factories/ injeção de dependências (monta casos de uso com repositórios)
  features/       componentes e hooks por assunto (schedule, members, announcements, pwa...)
  shared/         UI base, cliente Supabase, utilitários e constantes
tests/            testes de banco (PostgreSQL descartável) e de integração local
```

Linguagem do domínio: `dicionario_dominio.md`. Identidade visual: `design.md`.

## Banco de dados

- `schema.sql` descreve o modelo; mudanças vão em arquivos de migration na raiz.
- Escritas críticas (escalas, arquivamento de membros, trocas) passam por funções RPC transacionais; o app não escreve direto em `masses`/`schedule_slots`.
- Testes de banco: veja `tests/database/README.md` (usam PostgreSQL local descartável; nunca apontar para Supabase real).
- **Nenhuma migration é aplicada em Preview/Production sem autorização específica.** Cada migration deve ter rollback documentado.

## Agendamentos (cron)

Os disparos diários rodam no `pg_cron` do Supabase (não há `vercel.json`):

| Job | Horário (BRT) | Destino |
| --- | --- | --- |
| lembretes de escala | 13:00 | `GET /api/cron/reminders` com `Authorization: Bearer $CRON_SECRET` |
| aniversários | 08:00 | `/api/cron/birthdays` (idem) e a Edge Function `birthday-notifications` |
| folheto semanal | sexta 15:00 | Edge Function `update-leaflet` |

Atenção: o `pg_cron` marca "succeeded" mesmo quando a rota responde 401. Para saber o resultado real, consulte `net._http_response`.

## Fluxo de entrega

Resumo (detalhes em `AGENTS.md` e `HARNESS.md`):

1. Trabalhar em `feature/*` e abrir PR para `preview`; Preview automático na Vercel para homologar.
2. Production só com o comando explícito "Enviar para produção": `node scripts/bump-version.mjs`, build, merge na `main`, smoke test.
3. A versão fica em `src/shared/constants/version.ts`; `app_settings.min_version` (banco) é atualizado só no release de Production e dispara a atualização do PWA nos celulares.
