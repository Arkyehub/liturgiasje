# Planejamentos por coordenador (compartilhado) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar o planejamento de cada admin no servidor (um por admin por mês, gravado a cada alteração, validade de 30 dias), com Somente Leitura para planejamentos de outros admins, cópia "Duplicar para mim" e proteção das missas publicadas.

**Architecture:** Tabela `schedule_plans` + funções `SECURITY DEFINER` (`plan_*`) acessadas só por RPC. No app: camada de dados (`SchedulePlanRepository` → use cases → factories), lib pura (serializar/reconciliar o estado com as missas reais, detectar rascunhos a substituir), hook `usePlanSync` (reserva, sinal, fila de gravação, leitura periódica) integrado ao `usePlanning`/`usePlanningSave` existentes, e UI nova (lista de planejamentos por mês, faixa Somente Leitura, indicador de gravação).

**Tech Stack:** PostgreSQL/Supabase (RPC), Next.js 16 / React 19 / TypeScript, Jest + Testing Library, date-fns. Estende `src/features/planning/` e `src/app/admin/planejamento/`.

**Spec:** `docs/superpowers/specs/2026-11-26-planejamento-compartilhado-design.md` (v2, aprovada) — base: `docs/superpowers/specs/2026-11-26-planejamento-escala-design.md`.

## Global Constraints

- **Banco:** migration `migration_planejamento_compartilhado.sql` + `migration_planejamento_compartilhado_rollback.sql` na raiz; padrão de segurança: `SECURITY DEFINER`, `SET search_path = pg_catalog, public`, `public.is_admin()`, `REVOKE ALL … FROM PUBLIC, anon`, `GRANT EXECUTE … TO authenticated`, RLS ligado e **nenhuma policy de acesso direto** à tabela. Production: **nenhuma migration** sem autorização específica; Preview ("Liturgia SJE (preview)") autorizado pelo usuário em 26/11/2026. Testar antes em PostgreSQL descartável, sem rede (`tests/database/README.md`).
- Sem Realtime, sem rotina agendada nova; a limpeza dos vencidos roda dentro de `plan_list`.
- Validade: **30 dias** desde a última alteração (cada `plan_save` renova). Reserva: expira com **120 s** sem sinal; sinal a cada **30 s**; Somente Leitura atualiza a cada **~20 s**. `state` limitado a **512 KB** (524288 bytes). `plan_list` aceita até **12 meses**.
- **Um planejamento por admin por mês** (`unique (month_reference, owner_profile_id)`); só o dono edita e grava; coordenador = perfil `role = 'admin'` ativo; dono resolvido por `auth.uid()` → `profiles.auth_user_id`.
- Missas **publicadas nunca entram no `state`** e nunca são alteradas ou despublicadas pelo planejamento; a opção "incluir publicadas/voltar a rascunho" da v1 é **removida**.
- "Salvar como rascunho" **substitui por data** os rascunhos que o planejamento não contém/que mudaram, só após confirmar, e nunca publica.
- Execução por subagentes: **Sonnet 5.5, esforço médio** (instrução do usuário); nenhum Opus fora do planejamento.
- Git: branch `ccr-c886fd8c-sdxc83`; sem `push --force`; commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` e `Claude-Session: https://claude.ai/code/session_01CEbStfmFjzkxTeexr3YMiA`. Mesmos padrões do plano anterior: TDD, `npx tsc --noEmit`, `npx eslint` nos arquivos alterados, `npx jest`, testes só com fixtures sintéticas.

## Review Focus

- **Funções ausentes no banco** (Production, ou Preview antes da migration): a página mostra "Planejamento compartilhado indisponível neste ambiente", sem erro bruto e sem chamar nada que dependa dela (Tasks 2 e 7).
- **Reserva perdida / aparelho que dormiu:** nenhuma gravação é aplicada depois de perder a reserva; as alterações não gravadas são contadas e informadas; o aparelho vira Somente Leitura (Tasks 1 e 4).
- **Planejamento vencido** (30 dias) aberto ou listado: `plan_save` recusa com código próprio e a lista apaga só os vencidos (Tasks 1 e 4).
- **Não-admin ou admin arquivado** chamando qualquer função `plan_*`: recusado (Task 1).
- **Estado guardado desatualizado ou corrompido:** missa publicada/apagada/alterada por fora, missa real nova, JSON inválido → reconciliação determinística com aviso, nunca grava com `id`/revisão velha (Task 3).

---

## Mapa de arquivos

Criar: `migration_planejamento_compartilhado.sql`, `migration_planejamento_compartilhado_rollback.sql`, `tests/database/planejamento-compartilhado.sql`, `src/domain/models/SchedulePlan.ts`, `src/domain/repositories/SchedulePlanRepository.ts`, `src/domain/usecases/plans/index.ts`, `src/data/repositories/SupabaseSchedulePlanRepository.ts`, `src/main/factories/usecases/plans/index.ts`, `src/features/planning/lib/planState.ts`, `src/features/planning/lib/reconcilePlan.ts`, `src/features/planning/lib/draftReplacement.ts`, `src/features/planning/hooks/usePlanSync.ts`, `src/features/planning/ui/PlanChooser.tsx`, `src/features/planning/ui/ReadOnlyBanner.tsx`, `src/features/planning/ui/SaveIndicator.tsx` (+ um `*.test.ts(x)` ao lado de cada arquivo novo).
Modificar: `tests/database/README.md`, `src/features/planning/hooks/usePlanning.ts`, `src/features/planning/hooks/usePlanningSave.ts`, `src/features/planning/lib/planToBatch.ts` (só se a Task 6 precisar), `src/features/planning/ui/PublishedNotice.tsx`, `src/app/admin/planejamento/page.tsx` e seus testes; remover `MonthChooser.tsx` se o `PlanChooser` o substituir.

---

### Task 1: Migration — tabela e funções `plan_*`

**Files:**
- Create: `migration_planejamento_compartilhado.sql`, `migration_planejamento_compartilhado_rollback.sql`, `tests/database/planejamento-compartilhado.sql`
- Modify: `tests/database/README.md` (acrescentar o novo arquivo à ordem de execução e uma frase sobre o teste)

**Interfaces:**
- Produces (contrato que as Tasks 2+ usam; erros são `RAISE EXCEPTION '<código>'`, `forbidden` com `ERRCODE '42501'`):
  - Tabela `public.schedule_plans(id uuid pk default gen_random_uuid(), month_reference text not null check (month_reference ~ '^\d{4}-\d{2}$'), owner_profile_id uuid not null references profiles(id) on delete cascade, state jsonb, status text not null default 'em_andamento' check in ('em_andamento','concluido'), revision bigint not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '30 days', copied_from_owner_id uuid references profiles(id) on delete set null, concluded_at timestamptz, lock_session_id text, lock_heartbeat_at timestamptz, last_request_id text, unique (month_reference, owner_profile_id))`.
  - Todas `returns jsonb` (exceto onde indicado), `p_` prefixo: `plan_list(p_months text[])` → array de `{id, monthReference, ownerProfileId, ownerName, isMine, status, createdAt, updatedAt, expiresAt, copiedFromName, concludedAt, openElsewhere}`; `plan_open(p_month text, p_session text)` → `{mode: 'edit'|'readonly'|'concluded', holderLastSeen, plan: {…item acima…, revision, state}}`; `plan_get(p_plan_id uuid)` → `{…item…, revision, state}` ou `null`; `plan_copy(p_source uuid, p_overwrite boolean)` → plano do chamador `{…item…, revision, state}`; `plan_save(p_plan_id uuid, p_session text, p_request_id text, p_expected_revision bigint, p_state jsonb)` `returns bigint` (nova revisão); `plan_heartbeat(p_plan_id uuid, p_session text)`, `plan_release(p_plan_id uuid, p_session text)`, `plan_conclude(p_plan_id uuid, p_session text)`, `plan_discard(p_plan_id uuid)` `returns void`; `plan_reopen(p_plan_id uuid, p_session text)` → mesmo retorno de `plan_open`.
  - Códigos de erro: `forbidden`, `invalid_arguments`, `plan_not_found`, `plan_lock_lost`, `plan_revision_conflict`, `plan_concluded`, `plan_expired`, `plan_too_large`, `plan_exists`.

- [ ] **Step 1: Escrever `tests/database/planejamento-compartilhado.sql`** (psql, `\set ON_ERROR_STOP on`, mesmo estilo de `batch-success.sql`/`new-rpc-security.sql`: `SET ROLE authenticated; select set_config('request.jwt.claim.sub', <uuid>, false)`; criar perfis admin A, admin B, admin arquivado e leitor como superusuário no próprio teste). Casos, cada um com `RAISE EXCEPTION` se o resultado for diferente: (1) `anon` não tem `EXECUTE` em nenhuma `plan_*` e a tabela não aceita `SELECT/INSERT/UPDATE/DELETE` direto por `authenticated`; (2) leitor, admin arquivado e sessão sem `sub` recebem `forbidden`; (3) `plan_open` cria o plano do admin A (`mode='edit'`), segundo `plan_open` de A com **outro** `p_session` volta `mode='readonly'` com `holderLastSeen`, com o **mesmo** `p_session` retoma a reserva; (4) depois de forçar `lock_heartbeat_at` para 121 s atrás, outro `p_session` assume (`edit`); (5) `plan_save` com sessão errada → `plan_lock_lost`, com revisão errada → `plan_revision_conflict`, com `p_state` > 524288 bytes → `plan_too_large`, sucesso devolve revisão +1, atualiza `updated_at` e empurra `expires_at` para ~30 dias; repetir o **mesmo** `p_request_id` devolve a mesma revisão sem reaplicar; (6) admin B não grava no plano de A (`forbidden`/`plan_not_found`) mas `plan_get` de B lê o de A, e `plan_get` de B nunca cria reserva; (7) `plan_copy` de B a partir do plano de A cria o de B com o mesmo `state` e `copied_from_owner_id = A`; com B já tendo `state` e `p_overwrite=false` → `plan_exists`, com `true` substitui; copiar o próprio plano → `invalid_arguments`; (8) `plan_list` com 13 meses → `invalid_arguments`; devolve os dois planos do mês com `isMine` correto e `openElsewhere` verdadeiro só com reserva viva; **apaga** os planos com `expires_at < now()` e **mantém** os demais; (9) `plan_conclude` marca `concluido`, libera a reserva, mantém o `state`; `plan_save` depois → `plan_concluded`; `plan_open` devolve `mode='concluded'`; `plan_reopen` volta a `em_andamento` mantendo o `state` e reserva; (10) `plan_save` em plano com `expires_at` no passado → `plan_expired`; (11) `plan_discard` só pelo dono; (12) `plan_release` idempotente e `plan_heartbeat` com sessão errada → `plan_lock_lost`. Termina com `SELECT 'planejamento compartilhado passed' AS result;`.
- [ ] **Step 2: Subir um PostgreSQL descartável e provar que o teste falha.** O PostgreSQL 16 está em `/usr/lib/postgresql/16/bin` (sem rede: `listen_addresses=''`, socket Unix num diretório temporário; ele recusa rodar como root, então use/crie um usuário descartável). Aplicar, com `psql -X -v ON_ERROR_STOP=1 -1` por arquivo e na ordem do README, `fixture.sql`, `git show HEAD:schema.sql`, `fixture-policies.sql`, `migration_archive_profiles.sql`; rodar o novo teste. Esperado: **FALHA** (funções inexistentes).
- [ ] **Step 3: Implementar a migration** (idempotente: `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`; RLS ligado, sem policies; `REVOKE ALL` na tabela de `anon, authenticated`; cada função com `REVOKE … FROM PUBLIC, anon` e `GRANT EXECUTE … TO authenticated`). Helper interno `public.plan_actor() returns uuid` (perfil admin ativo de `auth.uid()`, senão `forbidden`). Cada função trava a linha do plano (`SELECT … FOR UPDATE`), não usa o advisory lock global de `save_schedule_batch`. `plan_open` **cria** a linha se não existir; `plan_get` nunca cria. Reserva viva = `lock_heartbeat_at > now() - interval '120 seconds'`.
- [ ] **Step 4: Escrever o rollback** (remove funções e tabela, nada mais) e rodar: migration → teste (PASS) → rollback → migration de novo (idempotência) → teste (PASS).
- [ ] **Step 5: Atualizar `tests/database/README.md`** e commitar: `git add migration_planejamento_compartilhado*.sql tests/database && git commit -m "feat(planejamento): tabela schedule_plans e funções plan_* com testes SQL"`.

---

### Task 2: Camada de dados do app

**Files:**
- Create: `src/domain/models/SchedulePlan.ts`, `src/domain/repositories/SchedulePlanRepository.ts`, `src/domain/usecases/plans/index.ts`, `src/data/repositories/SupabaseSchedulePlanRepository.ts`, `src/main/factories/usecases/plans/index.ts`
- Test: `src/data/repositories/SupabaseSchedulePlanRepository.test.ts`, `src/domain/usecases/plans/index.test.ts`

**Interfaces:**
- Produces (em `SchedulePlan.ts`):
  ```ts
  export type PlanStatus = "em_andamento" | "concluido"
  export interface PlanListItem { id: string; monthReference: string; ownerProfileId: string; ownerName: string; isMine: boolean; status: PlanStatus; createdAt: string; updatedAt: string; expiresAt: string; copiedFromName: string | null; concludedAt: string | null; openElsewhere: boolean }
  export interface PlanDocument extends PlanListItem { revision: number; state: unknown | null }
  export type PlanOpenMode = "edit" | "readonly" | "concluded"
  export interface PlanOpenResult { mode: PlanOpenMode; holderLastSeen: string | null; plan: PlanDocument }
  export type PlanErrorCode = "forbidden" | "invalid_arguments" | "plan_not_found" | "plan_lock_lost" | "plan_revision_conflict" | "plan_concluded" | "plan_expired" | "plan_too_large" | "plan_exists" | "unavailable" | "unknown"
  export class PlanError extends Error { code: PlanErrorCode }
  export function planErrorMessage(error: unknown): string   // mensagens pt-BR por código; unavailable = "Planejamento compartilhado indisponível neste ambiente."
  ```
  `SchedulePlanRepository` com um método por RPC: `list(months: string[]): Promise<PlanListItem[]>`, `open(month: string, session: string): Promise<PlanOpenResult>`, `get(planId: string): Promise<PlanDocument | null>`, `copy(sourceId: string, overwrite: boolean): Promise<PlanDocument>`, `save(planId: string, session: string, requestId: string, expectedRevision: number, state: unknown): Promise<number>`, `heartbeat(planId, session): Promise<void>`, `release(planId, session): Promise<void>`, `conclude(planId, session): Promise<void>`, `reopen(planId, session): Promise<PlanOpenResult>`, `discard(planId): Promise<void>`. Use cases (`ListPlans`, `OpenPlan`, `GetPlan`, `CopyPlan`, `SavePlan`, `HeartbeatPlan`, `ReleasePlan`, `ConcludePlan`, `ReopenPlan`, `DiscardPlan`; `execute(...)` com os mesmos argumentos) e factories `makeListPlans`, `makeOpenPlan`, … no padrão de `src/main/factories/usecases/schedule/index.ts`.

- [ ] **Step 1: Testes que falham** (`supabase.rpc` mockado como em `listReadingsByProfile.test.ts`): cada método chama a RPC certa com os parâmetros `p_*` certos e converte o JSON (camelCase já vem do banco) em `PlanDocument`/`PlanOpenResult`; `error.message` contendo `plan_lock_lost` (e os demais códigos) vira `PlanError` com o `code` correspondente; erro de função inexistente (`error.code` `PGRST202` ou `42883`, ou mensagem "Could not find the function") vira `code: "unavailable"`; `planErrorMessage` devolve texto pt-BR distinto para `plan_lock_lost`, `plan_revision_conflict`, `plan_expired`, `plan_too_large`, `unavailable`.
- [ ] **Step 2: Rodar e ver falhar** — `npx jest src/data/repositories/SupabaseSchedulePlanRepository.test.ts src/domain/usecases/plans`.
- [ ] **Step 3: Implementar** os arquivos acima.
- [ ] **Step 4: Rodar e ver passar** + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(planejamento): camada de dados dos planejamentos compartilhados`.

---

### Task 3: Lib pura — estado guardado, reconciliação e substituição de rascunhos

**Files:**
- Create: `src/features/planning/lib/planState.ts`, `src/features/planning/lib/reconcilePlan.ts`, `src/features/planning/lib/draftReplacement.ts`
- Test: um `.test.ts` ao lado de cada

**Interfaces:**
- Consumes: `PlanMass`, `PlanSlot` (`lib/types.ts`), `massToPlan` (`hooks/usePlanning.ts`).
- Produces:
  ```ts
  // planState.ts
  export interface PlanState { masses: PlanMass[]; removedMasses: PlanMass[]; suggested: boolean }
  export function serializePlanState(masses: PlanMass[], removedMasses: PlanMass[], suggested: boolean): PlanState   // só missas NÃO publicadas (wasPublished=false) em masses; removedMasses completos
  export function parsePlanState(raw: unknown): PlanState | null   // valida o formato; JSON inválido/campos faltando → null
  // reconcilePlan.ts
  export interface ReconcileNotice { kind: "changed" | "removed" | "published" | "invalid-state"; dates: string[] }
  export function reconcilePlan(stored: PlanState | null, real: PlanMass[]): { masses: PlanMass[]; removedMasses: PlanMass[]; suggested: boolean; notices: ReconcileNotice[] }
  // draftReplacement.ts
  export function computeDraftReplacement(plan: PlanMass[], realNow: PlanMass[]): { replaced: PlanMass[]; dates: string[] }
  export function refreshRevisions(plan: PlanMass[], realNow: PlanMass[]): PlanMass[]
  ```
  `real` = missas reais do mês já convertidas por `massToPlan` (inclui publicadas, que chegam `readOnly: true`).

- [ ] **Step 1: Testes que falham.** `planState`: `serializePlanState` descarta missas publicadas; `parsePlanState(null)`, `parsePlanState("x")`, `{masses: "x"}` → `null`; ida e volta preserva travas/avisos/motivos. `reconcilePlan`: (a) `stored = null` → devolve `real` (como hoje), `suggested=false`, sem avisos; (b) missa guardada com `id` cuja revisão real é igual → mantém a versão guardada; (c) revisão real diferente → vale a **real** e aviso `changed` com a data; (d) missa guardada com `id` que sumiu do real → sai do plano, aviso `removed`; (e) missa real **publicada** → entra `readOnly: true` e a guardada da mesma data/horário é descartada com aviso `published`; (f) missa real nova (rascunho que não estava no estado) → entra normal; (g) missa guardada **sem** `id` na mesma data+hora de uma real → real vence com aviso `changed`; (h) `stored` inválido (`parsePlanState` → null após ter recebido algo) → `notices` contém `invalid-state`. `computeDraftReplacement`: rascunhos reais (não publicados) em datas onde o plano tem missas e cujo `id` não está no plano entram em `replaced`; rascunhos de datas que o plano não cobre **não**; publicadas **nunca**; `dates` ordenadas e sem repetição. `refreshRevisions`: missas do plano com `id` recebem a `scheduleRevision` atual de `realNow`.
- [ ] **Step 2: Rodar e ver falhar** — `npx jest src/features/planning/lib/planState.test.ts src/features/planning/lib/reconcilePlan.test.ts src/features/planning/lib/draftReplacement.test.ts`.
- [ ] **Step 3: Implementar** as três funções puras (determinísticas; sem React nem I/O).
- [ ] **Step 4: Rodar e ver passar** + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(planejamento): serialização e reconciliação do planejamento guardado`.

---

### Task 4: Hook `usePlanSync` — reserva, sinal, fila de gravação e leitura

**Files:**
- Create: `src/features/planning/hooks/usePlanSync.ts`
- Test: `src/features/planning/hooks/usePlanSync.test.ts` (timers falsos do Jest; use cases mockados via `jest.mock("@/main/factories/usecases/plans")`)

**Interfaces:**
- Consumes: factories da Task 2, `PlanError`/`planErrorMessage`.
- Produces:
  ```ts
  export type SyncStatus = "idle" | "saving" | "saved" | "failed"
  export type SyncMode = "idle" | "loading" | "edit" | "readonly" | "concluded" | "unavailable" | "error"
  export interface UsePlanSyncResult {
    mode: SyncMode
    plan: PlanDocument | null           // documento atual do servidor (state cru)
    holderLastSeen: string | null
    status: SyncStatus
    lostChanges: number                 // alterações descartadas por reserva perdida
    save(state: unknown): void          // enfileira; nunca lança
    retrySave(): void
    reopen(): Promise<void>             // plan_reopen (concluído) ou nova tentativa de reservar (readonly)
    release(): void
  }
  export function usePlanSync(target: { kind: "mine"; month: string } | { kind: "other"; planId: string } | null): UsePlanSyncResult
  ```
  `session_id` = UUID por aba, em `sessionStorage` (chave `planejamento:session`), com fallback em memória se `sessionStorage` lançar.

- [ ] **Step 1: Testes que falham:** `target=null` → `mode "idle"`, nenhuma chamada; `kind "mine"` chama `OpenPlan` com o `session_id` e expõe `mode "edit"`/`"readonly"`/`"concluded"` conforme o resultado; atualizar a página (novo hook com o mesmo `sessionStorage`) reutiliza o mesmo `session_id`; em `edit`, `HeartbeatPlan` roda a cada 30 s (avançando timers) e **não** roda em `readonly`; `save(state)` chama `SavePlan` com `request_id` novo e `expectedRevision` = revisão atual, e depois da resposta usa a revisão devolvida; várias `save()` seguidas viram **uma fila de uma gravação por vez** e só a **última** pendente é enviada (coalescência) mantendo a ordem; `status` vai `saving` → `saved`; falha de rede repete até **3** vezes (≈2 s e ≈5 s) com o **mesmo** `request_id` e então `status "failed"` (e `save` novos ficam ignorados até `retrySave()`); erro `plan_lock_lost` → `mode "readonly"`, `lostChanges` = nº de `save()` não aplicados, nenhuma nova chamada de gravação; `plan_revision_conflict` → recarrega com `GetPlan` e vai a `readonly` sem repetir; `plan_expired` → `mode "error"` com mensagem; `PlanError "unavailable"` em qualquer chamada inicial → `mode "unavailable"` (sem repetir); `kind "other"` usa `GetPlan`, `mode "readonly"`, repete a leitura a cada 20 s e só atualiza `plan` quando a revisão mudou; `release()` e o desmonte do hook chamam `ReleasePlan` uma vez (melhor esforço, sem lançar); `reopen()` em `concluded` chama `ReopenPlan`; em `readonly` do mesmo dono tenta `OpenPlan` de novo.
- [ ] **Step 2: Rodar e ver falhar** — `npx jest src/features/planning/hooks/usePlanSync.test.ts`.
- [ ] **Step 3: Implementar** `usePlanSync` (refs para fila/revisão/sessão; efeitos com limpeza de timers; gravações nunca em paralelo).
- [ ] **Step 4: Rodar e ver passar** + `tsc` + eslint.
- [ ] **Step 5: Commit** — `feat(planejamento): hook de sincronização do planejamento (reserva, sinal e fila)`.

---

### Task 5: Integrar o `usePlanning` ao servidor (carregar, reconciliar, gravar a cada alteração, modos)

**Files:**
- Modify: `src/features/planning/hooks/usePlanning.ts` (e `usePlanning.test.ts`)
- Test: `src/features/planning/hooks/usePlanning.test.ts`, `usePlanning.shared.test.ts` (novo, para o comportamento compartilhado)

**Interfaces:**
- Consumes: `usePlanSync` (Task 4), `serializePlanState`/`parsePlanState`/`reconcilePlan` (Task 3), `massToPlan`.
- Produces: `usePlanning(target: PlanTarget | null)` com `type PlanTarget = { kind: "mine"; month: Date } | { kind: "other"; month: Date; planId: string }`, e no resultado, **além** do que já existe: `mode: SyncMode`, `syncStatus: SyncStatus`, `lostChanges: number`, `notices: ReconcileNotice[]`, `ownerName: string | null`, `holderLastSeen: string | null`, `readOnly: boolean` (`mode !== "edit"`), `retrySave(): void`, `reopen(): Promise<void>`, `syncPlan: PlanDocument | null`. **Removidos:** `acceptPublished`, `declinePublished`, `publishedDecision`, `setBusy` mantido. `editable` passa a ser `ready && mode === "edit" && !busy`.

- [ ] **Step 1: Testes que falham:** (a) abre como dono sem estado guardado → masses = missas reais (como hoje; publicadas `readOnly`), e **nenhuma** gravação até a primeira alteração; (b) com estado guardado → `masses` = `reconcilePlan(parse(state), real)` e `notices` expostos; (c) cada ação que muda o plano (`createDefaults`, `addMass`, `updateMass`, `removeMass`, `runLamp`, `setSlotReader`, `toggleLock`) dispara **uma** chamada `save` com `serializePlanState` do plano atual (sem missas publicadas) e as alterações em sequência vão em ordem; a carga inicial/reconciliação **não** grava; (d) `mode "readonly"`/`"concluded"`/`kind "other"` → `editable` falso, ações ignoradas, `masses` mostradas mesmo assim; (e) `kind "other"` mostra o estado do outro admin reconciliado com as missas reais (sempre sem editar) e `ownerName`; (f) publicadas continuam `readOnly` e contadas na carga da lâmpada; (g) mudar `target` troca de plano sem vazar estado antigo.
- [ ] **Step 2: Rodar e ver falhar** — `npx jest src/features/planning/hooks`.
- [ ] **Step 3: Implementar** a integração (as leituras reais/perfis/histórico/indisponibilidades continuam como estão; o estado inicial passa por `reconcilePlan`; um efeito observa `plan/removedMasses/suggested` e chama `sync.save(serializePlanState(...))` quando a assinatura mudar depois da carga). Remover `acceptPublished`/`declinePublished`/`publishedDecision` e atualizar os testes antigos que os fixavam.
- [ ] **Step 4: Rodar e ver passar** (`npx jest src/features/planning`) + `tsc` + eslint.
- [ ] **Step 5: Commit** — `feat(planejamento): planejamento guardado no servidor, reconciliado e gravado a cada alteração`.

---

### Task 6: Reescrever `usePlanningSave` (sem despublicar; substituição de rascunhos; concluir)

**Files:**
- Modify: `src/features/planning/hooks/usePlanningSave.ts` (e `.test.ts`)
- Test: `src/features/planning/hooks/usePlanningSave.test.ts`

**Interfaces:**
- Consumes: `computeDraftReplacement`/`refreshRevisions` (Task 3), `makeConcludePlan` (Task 2), `makeListSchedulesForMonth`, `massToPlan`, `planToBatch`.
- Produces:
  ```ts
  export interface UsePlanningSaveResult {
    saving: boolean
    /** Rascunhos reais que o próximo salvar vai substituir (vazio = nada a avisar). Preenchido por prepareSave(). */
    replacement: { count: number; dates: string[] } | null
    prepareSave(): Promise<{ needsConfirm: boolean }>   // lê as missas reais agora e calcula a substituição
    saveDraft(): Promise<boolean>                       // grava; só depois de prepareSave()
    cancelSave(): void
    previewText(): string
  }
  ```
  Removidos: `dirty`, `unpublishCount`, `leftAsDraft`. `usePlanningSave({ month, masses, removedMasses, readerNames, planId, session, loading, error, reload })`.

- [ ] **Step 1: Testes que falham:** `prepareSave` lê as missas reais do mês e, se `computeDraftReplacement` não vazio, devolve `needsConfirm: true` com `replacement.count/dates`; vazio → `needsConfirm: false`; `saveDraft` grava `planToBatch` com `removed` = rascunhos `replaced` (com a **revisão atual**) e missas do plano com `refreshRevisions` — uma única chamada `SaveScheduleBatch`; **nunca** chama `UpdateMassesStatus`; sucesso → `ConcludePlan`, `reload()` e toast; falha em `SaveScheduleBatch` (ex.: `schedule_conflict`) → mensagem de `scheduleErrorMessage`, plano intacto, `ConcludePlan` **não** chamado; `ConcludePlan` falhando depois do lote → tenta mais 2 vezes e **não** reporta erro de salvar (o lote já foi gravado); duplo clique ignorado; missas `readOnly` nunca no lote.
- [ ] **Step 2: Rodar e ver falhar** — `npx jest src/features/planning/hooks/usePlanningSave.test.ts`.
- [ ] **Step 3: Implementar** e apagar o código de despublicação (`withRevisions`, `unpublished`, `LEFT_AS_DRAFT`, `dirty`/baseline).
- [ ] **Step 4: Rodar e ver passar** + `tsc` + eslint.
- [ ] **Step 5: Commit** — `refactor(planejamento): salvar como rascunho sem despublicar, com substituição por data`.

---

### Task 7: UI e página (lista de planejamentos, Somente Leitura, indicador, avisos)

**Files:**
- Create: `src/features/planning/ui/PlanChooser.tsx`, `ReadOnlyBanner.tsx`, `SaveIndicator.tsx` (+ testes)
- Modify: `src/features/planning/ui/PublishedNotice.tsx`, `src/features/planning/ui/PlanningHeader.tsx` (se precisar de desativar controles), `src/app/admin/planejamento/page.tsx` e `page.test.tsx`; remover `MonthChooser.tsx` (e teste) se substituído
- Test: testes ao lado de cada arquivo + `page.test.tsx`

**Interfaces:**
- Consumes: `usePlanning` (Task 5), `usePlanningSave` (Task 6), `makeListPlans`/`makeCopyPlan`/`makeDiscardPlan`/`makeReopenPlan` (Task 2), `planErrorMessage`.
- Produces: `PlanChooser({ current: Date, onOpenMine(month: Date), onViewOther(plan: PlanListItem), onCopy(plan: PlanListItem), onDiscard(plan: PlanListItem) })`; `ReadOnlyBanner({ ownerName: string | null, lastSeen: string | null, reason: "other-owner" | "other-device" | "lost-lock" | "concluded" })` com o texto **"SOMENTE LEITURA"**; `SaveIndicator({ status: SyncStatus, lostChanges?: number })` ("Salvando…" / "Salvo" / "Falhou — tentar de novo" + botão).

- [ ] **Step 1: Testes que falham:** `PlanChooser`: lista para cada um dos 3 meses (atual, próximo "Sugerido", seguinte) os planejamentos devolvidos por `ListPlans` — "Meu planejamento · editado há X · expira em N dias", "<Nome> · editado há X · expira em N dias" com **Ver** e **Duplicar para mim**, "Criar meu planejamento" quando não tenho; "Concluído" com **Reabrir**; "Aberto em outro aparelho" no meu; **Descartar** só no meu; `unavailable` → mensagem "Planejamento compartilhado indisponível neste ambiente." e nada mais; **Duplicar** com plano meu já com conteúdo pede confirmação ("substitui o seu planejamento de <mês>") e só então chama `CopyPlan(overwrite: true)`. `ReadOnlyBanner`: texto "SOMENTE LEITURA" + nome + "última alteração há X", variações por `reason`. `SaveIndicator`: os três estados e o contador de alterações perdidas. `PublishedNotice`: vira alerta **informativo** único ("Já existem N missas publicadas em <Mês> (datas…). Elas não podem ser alteradas no planejamento. Para mexer nelas, transforme-as em rascunho na tela de Escala.") com um botão "Entendi", sem opção de incluir/despublicar. `page`: sem plano escolhido só aparece o `PlanChooser` e **nenhuma** leitura de missas/perfis; "Criar/Abrir meu" abre em modo `edit`; "Ver" abre em Somente Leitura (faixa, **todos** os controles de edição desativados, setas de mês ativas); `SaveIndicator` visível enquanto edita; "Salvar como rascunho" chama `prepareSave` e, se `needsConfirm`, mostra `ConfirmDialog` ("Já existe uma escala em rascunho em <Mês> (N missas: datas…). Salvar vai **substituir** essas missas pelas deste planejamento nas datas <…>. Missas publicadas não serão tocadas.") e só então `saveDraft`; reserva perdida/outro aparelho → faixa e controles desativados; a confirmação "Descartar alterações?" ao trocar de mês e o `beforeunload` **somem** (a troca de mês espera `status !== "saving"`); `notices` da reconciliação aparecem como aviso ("A escala mudou fora do planejamento: <datas>").
- [ ] **Step 2: Rodar e ver falhar** — `npx jest src/features/planning/ui src/app/admin/planejamento`.
- [ ] **Step 3: Implementar** os componentes e ligar a página (`PlanningScreen` com `target` em vez de `month`; reaproveitar `ConfirmDialog`, `NotebookList`, `SuggestionList`, `BalanceDetail`). Copy em pt-BR, toque ≥44px, aria-labels, estilo caderno.
- [ ] **Step 4: Rodar e ver passar** (`npx jest`, `npx tsc --noEmit`, `npx eslint` nos arquivos alterados, `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build`).
- [ ] **Step 5: Commit** — `feat(planejamento): lista de planejamentos, Somente Leitura e gravação automática na página`.

---

### Task 8: Fechamento e entrega em Preview

**Files:** nenhum arquivo de produto novo.

- [ ] **Step 1: Validação completa** — `npx tsc --noEmit`, `npx eslint src`, `npx jest`, build com variáveis `dummy`; repetir a sequência SQL da Task 1 do zero (idempotência da migration).
- [ ] **Step 2: Revisão final** do ramo (um revisor Sonnet médio, tabela de achados "must fix / can wait") e **uma** onda de correções com re-revisão.
- [ ] **Step 3: Aplicar a migration no banco de Preview** (projeto "Liturgia SJE (preview)") — autorizado pelo usuário em 26/11/2026 — **antes** do merge do código; depois, consultas somente-leitura de catálogo para confirmar tabela, funções, RLS e `anon` sem `EXECUTE`. **Production não é tocado.**
- [ ] **Step 4: Abrir PR (base `preview`), esperar o CI verde e fazer o merge**; confirmar o deploy de Preview e informar o usuário (o que mudou, riscos, próximo passo). Production só com "Enviar para produção" e autorização específica do banco.
