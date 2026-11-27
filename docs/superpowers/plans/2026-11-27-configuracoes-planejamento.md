# Configurações do planejamento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada coordenador define, num painel (engrenagem), as suas missas padrão por dia da semana e as regras da lâmpada; as configurações vivem numa tabela (uma linha por coordenador) e podem ser copiadas ao duplicar o planejamento de outro.

**Architecture:** Tabela `planner_settings` (JSON validado no servidor) + funções `planner_settings_get/save` + `plan_copy` de 4 argumentos (a de 3 continua). No app: modelo/repositório/casos de uso como em `SchedulePlan`; `buildDefaultMasses` e `suggestSchedule` passam a receber as configurações; hook `usePlannerSettings`; painel `SettingsSheet`; diálogo de cópia no `PlanChooser`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Jest + Testing Library, Supabase/PostgreSQL (SECURITY DEFINER), Base UI `Sheet`.

**Spec:** `docs/superpowers/specs/2026-11-27-configuracoes-planejamento-design.md`

## Global Constraints

- Nenhuma missa padrão pré-cadastrada (nem no código, nem na migration). Padrão de `standardMasses` = `[]`.
- Todas as regras da lâmpada ligadas por padrão; chave ausente = ligada. Chaves: `balance`, `preferences`, `affinity`, `sameDay`, `weekends`, `history`.
- Funções fixas `C | 1L | 2L | L | P`; `L` não convive com `1L`/`2L`. Dia da semana 0..6 com 0 = domingo (`Date.getDay()`).
- Limites no servidor: no máximo 70 missas padrão; JSON ≤ 32768 bytes; sem `weekday`+`time` repetidos. Erros: `invalid_settings`, `settings_too_large`.
- Funções `SECURITY DEFINER`, `search_path = pg_catalog, public`, RLS ligada sem políticas, `anon` sem acesso; só admin ativo (`plan_actor()`).
- `plan_copy` de 3 argumentos permanece intacta; a de 4 argumentos não tem valor padrão (evita ambiguidade).
- Painel: Salvar/Cancelar (sem autosave); "Restaurar regras padrão" não apaga missas padrão.
- "Criar Missas Padrões" só habilitado com: edição, carregado, configurações carregadas, zero missas no planejamento (publicadas contam) e ao menos uma missa padrão.
- Migration no Preview só com autorização específica do usuário; Production fora do escopo; nunca aplicar DRAFT/NO-GO.

## Review Focus

- Salvar JSON malformado/enorme/duplicado → erro claro, nada gravado (testes SQL e do painel).
- Coordenador A nunca lê/escreve a linha do B, nem por `save` nem por `plan_copy` (teste SQL).
- Origem sem configurações significativas: `p_copy_settings = true` não apaga as minhas (teste SQL).
- Todas as regras desligadas: a lâmpada ainda devolve uma escala válida respeitando as regras duras (teste da lib).
- Função nova ausente no banco (`unavailable`): app usa padrões, botão de padrões desabilitado, duplicar cai na função de 3 argumentos (testes do repositório/chooser).

---

### Task 1: Banco — tabela, funções, `plan_copy` de 4 argumentos

**Files:**
- Create: `migration_planejamento_configuracoes.sql`, `migration_planejamento_configuracoes_rollback.sql`, `tests/database/configuracoes-planejamento.sql`
- Modify: `tests/database/README.md`

**Interfaces:**
- Produces (SQL): `planner_settings_get() → jsonb {standardMasses, lampRules, hasCustom}`; `planner_settings_save(p_standard_masses jsonb, p_lamp_rules jsonb) → jsonb` (mesmo formato); `plan_copy(uuid, text, boolean, boolean) → jsonb`; `plan_item` ganha `'ownerHasSettings'`.

- [ ] **Step 1: Escrever o teste SQL** `tests/database/configuracoes-planejamento.sql` (rodar após as migrations de planejamento; cria perfis próprios com prefixo `c1/d1`): privilégios (anon sem EXECUTE; `authenticated` sem acesso direto à tabela; RLS ligada sem políticas); `get` sem linha = `{standardMasses:[], lampRules:{}, hasCustom:false}`; `save` válido faz upsert e `get` devolve o mesmo; `hasCustom` só com missa padrão ou regra `false`; rejeições (`invalid_settings`): não-array, 71 itens, `weekday` 7, `time` "25:00", `roles` vazio/repetido/`L`+`1L`/função desconhecida, `weekday`+`time` repetidos, `lamp_rules` não-objeto ou valor não-booleano; `settings_too_large`; chaves desconhecidas de `lamp_rules` são descartadas; isolamento entre dois admins; leitor/arquivado/sem sessão → `forbidden`; `plan_item.ownerHasSettings` verdadeiro só com configurações significativas; `plan_copy(..., true)` copia as do dono da origem (substitui as minhas) atomicamente; `plan_copy(..., false)` não mexe; origem sem significado + `true` não apaga as minhas; `plan_copy` de 3 argumentos continua funcionando.
- [ ] **Step 2: Rodar e ver falhar** (banco descartável PG16: fixture, schema, fixture-policies, `migration_archive_profiles`, `migration_planejamento_compartilhado`, `migration_planejamento_sem_reserva`, depois o teste) — esperado: falha por função ausente.
- [ ] **Step 3: Escrever a migration** (idempotente; `CREATE TABLE IF NOT EXISTS public.planner_settings(profile_id uuid primary key references public.profiles(id) on delete cascade, standard_masses jsonb not null default '[]', lamp_rules jsonb not null default '{}', updated_at timestamptz not null default now())`, RLS ligada, `REVOKE ALL`; funções conforme a spec 5.1; `plan_item` reescrita com `ownerHasSettings`; `plan_copy` de 4 argumentos reutilizando a lógica atual da de 3 + cópia de configurações na mesma transação). Rollback: remove funções novas, restaura `plan_item` anterior, remove a tabela. **Não semeia dados.**
- [ ] **Step 4: Rodar tudo** (migration → nova migration duas vezes → teste → rollback → migration → teste) e os testes `planejamento-compartilhado.sql`/concorrência anteriores — esperado: PASS (ajustar o teste antigo só se ele fixar a lista exata de chaves de `plan_item`).
- [ ] **Step 5: Atualizar `tests/database/README.md`** (ordem e descrição) e **commit** `feat(planejamento): tabela planner_settings e plan_copy com configurações`.

---

### Task 2: Camada de dados do app

**Files:**
- Create: `src/domain/models/PlannerSettings.ts`, `src/domain/repositories/PlannerSettingsRepository.ts`, `src/domain/usecases/plannerSettings/index.ts` (+ `index.test.ts`), `src/data/repositories/SupabasePlannerSettingsRepository.ts` (+ `.test.ts`), `src/main/factories/usecases/plannerSettings/index.ts`
- Modify: `src/domain/models/SchedulePlan.ts` (`PlanListItem.ownerHasSettings: boolean`), `src/domain/repositories/SchedulePlanRepository.ts` (`copy(sourceId, session, overwrite, copySettings?)`), `src/data/repositories/SupabaseSchedulePlanRepository.ts` (+ test), `src/domain/usecases/plans/index.ts` (`CopyPlan.execute(sourceId, session, overwrite, copySettings = false)`), testes e dublês que montam `PlanListItem`.

**Interfaces:**
- Produces: `type RoleCode` reutilizado de `features/planning/lib/types`; `interface StandardMass { weekday: number; time: string; roles: RoleCode[] }`; `interface LampRules { balance: boolean; preferences: boolean; affinity: boolean; sameDay: boolean; weekends: boolean; history: boolean }`; `interface PlannerSettings { standardMasses: StandardMass[]; lampRules: LampRules; hasCustom: boolean }`; `DEFAULT_LAMP_RULES: LampRules` (todas `true`); `normalizeSettings(raw: unknown): PlannerSettings` (preenche chaves ausentes com `true`, ignora lixo); `SettingsError` com códigos `invalid_settings | settings_too_large | forbidden | unavailable | unknown` e `settingsErrorMessage(e)`; repositório `get(): Promise<PlannerSettings>`, `save(standardMasses, lampRules): Promise<PlannerSettings>`; casos de uso `GetPlannerSettings`, `SavePlannerSettings`; fábricas `makeGetPlannerSettings`, `makeSavePlannerSettings`.
- `SupabaseSchedulePlanRepository.copy(..., copySettings)`: se `copySettings` e a função de 4 argumentos não existir (`unavailable`), repete com a de 3 argumentos (sem copiar configurações).

- [ ] **Step 1: Testes** — `normalizeSettings` (null/lixo → padrões; chaves ausentes → `true`); repositório de configurações (nomes dos parâmetros `p_standard_masses`/`p_lamp_rules`, mapeamento de erros, `unavailable` só para PGRST202/"Could not find the function"/"does not exist"); `copy` envia `p_copy_settings`, cai na de 3 argumentos quando `unavailable`; casos de uso delegam.
- [ ] **Step 2: Rodar e ver falhar** (`npx jest src/domain src/data`).
- [ ] **Step 3: Implementar** os arquivos acima seguindo o padrão de `SchedulePlan`/`SupabaseSchedulePlanRepository`.
- [ ] **Step 4: `npx tsc --noEmit -p . && npx jest src/domain src/data`** — esperado: PASS.
- [ ] **Step 5: Commit** `feat(planejamento): camada de dados das configurações`.

---

### Task 3: Lib — missas padrão e regras da lâmpada

**Files:**
- Modify: `src/features/planning/lib/defaultMasses.ts` (+ `defaultMasses.test.ts`), `src/features/planning/lib/suggestSchedule.ts` (+ `suggestSchedule.test.ts`), `src/features/planning/lib/types.ts` (`SuggestInput.rules?: LampRules`)

**Interfaces:**
- Consumes: `StandardMass`, `LampRules`, `DEFAULT_LAMP_RULES` (Task 2).
- Produces: `buildDefaultMasses(month: Date, existing: {date:string; time:string}[], standardMasses: StandardMass[]): PlanMass[]` (sem constantes fixas; lista vazia sem padrões; funções na ordem canônica C,1L,2L,L,P; mesma chave `${date}_${time}` e mesmo critério de existentes); `suggestSchedule(input)` lê `input.rules ?? DEFAULT_LAMP_RULES` e zera os pesos conforme a spec 5.3 (tabela); `buildReason` não cita regra desligada.

- [ ] **Step 1: Testes** — `buildDefaultMasses`: sem padrões → `[]`; domingo 09:00 com C/P gera 5 missas em dezembro/2026 (domingos 6,13,20,27 = 4) com as funções certas; ignora data+horário existentes; ordem das funções. `suggestSchedule`: sem `rules` = resultado idêntico ao de hoje (testes atuais continuam passando); com `balance:false` a soma de pesos de equilíbrio não pesa (um leitor pode receber mais vagas que a meta num cenário em que `preferences` o favorece); `preferences:false` ignora preferências; `sameDay:false` permite o mesmo leitor em duas missas do dia onde antes evitava; `weekends:false`, `affinity:false`, `history:false` (metas iguais); **todas desligadas** ainda respeita indisponibilidade, um leitor por missa e vagas travadas; motivos não citam "Preferência", "média abaixo do grupo" nem "costuma fazer" quando a regra está desligada.
- [ ] **Step 2: Rodar e ver falhar** (`npx jest src/features/planning/lib`).
- [ ] **Step 3: Implementar.** Em `suggestSchedule`, transformar as constantes `W_*`/`MAX_AVG_BIAS` em valores efetivos no `Ctx` (por chamada) em vez de globais; `cellCost`/`readerCost`/meta leem do `Ctx`.
- [ ] **Step 4: `npx tsc --noEmit -p . && npx jest src/features/planning/lib`** — esperado: PASS.
- [ ] **Step 5: Commit** `feat(planejamento): missas padrão e regras da lâmpada configuráveis`.

---

### Task 4: Hook e integração em `usePlanning`

**Files:**
- Create: `src/features/planning/hooks/usePlannerSettings.ts` (+ `.test.ts`)
- Modify: `src/features/planning/hooks/usePlanning.ts` (+ testes), `src/features/planning/hooks/planSyncTestDouble.ts` se necessário

**Interfaces:**
- Consumes: `makeGetPlannerSettings`, `makeSavePlannerSettings`, `PlannerSettings`, `LampRules`, `StandardMass`.
- Produces: `usePlannerSettings(): { status: "loading" | "ready" | "unavailable" | "error"; standardMasses: StandardMass[]; lampRules: LampRules; hasCustom: boolean; error: string | null; save(standardMasses: StandardMass[], lampRules: LampRules): Promise<boolean>; reload(): void }`. `unavailable` → padrões (`[]`, todas ligadas) em silêncio; `error` → padrões + toast "Não foi possível ler suas regras; usando as regras padrão". `save` devolve `true` e atualiza o estado; em erro devolve `false` e guarda a mensagem em `error` (sem toast).
- `usePlanning(target, settings?: { standardMasses: StandardMass[]; lampRules: LampRules; loaded: boolean })` (segundo parâmetro opcional, para não quebrar os testes atuais; ausente = padrões e `loaded: true`). `UsePlanningResult` ganha `canCreateDefaults: boolean` (`editable && loaded && masses.length === 0 && standardMasses.length > 0`) e `createDefaultsHint: "no-standard" | "not-empty" | null`; `createDefaults()` usa `buildDefaultMasses(monthStart, existing, standardMasses)` e `runLamp()` passa `rules`; `runLamp` é ignorado enquanto `!loaded`.

- [ ] **Step 1: Testes** — hook: carrega e expõe valores; `unavailable` silencioso com padrões; `error` com toast e padrões; `save` ok/erro; `reload`. `usePlanning`: `canCreateDefaults` conforme cada condição (lista não vazia, sem padrões, não carregado, somente leitura); `createDefaults` cria as missas das configurações e nada sem padrões; `runLamp` com regra desligada passa `rules` (espiar `suggestSchedule`).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** o hook e a integração.
- [ ] **Step 4: `npx tsc --noEmit -p . && npx jest src/features/planning/hooks`** — esperado: PASS.
- [ ] **Step 5: Commit** `feat(planejamento): hook das configurações e uso na lâmpada e nas missas padrão`.

---

### Task 5: Painel, engrenagem e página

**Files:**
- Create: `src/features/planning/ui/SettingsSheet.tsx` (+ `.test.tsx`)
- Modify: `src/features/planning/ui/PlanningHeader.tsx` (+ test), `src/app/admin/planejamento/page.tsx` (+ test)

**Interfaces:**
- Consumes: `usePlannerSettings` (Task 4), `StandardMass`, `LampRules`.
- Produces: `SettingsSheet({ open, status, standardMasses, lampRules, error, onSave(standardMasses, lampRules): Promise<boolean>, onClose, onRetry })` — painel lateral (`Sheet`, no celular sobe de baixo) conforme a spec 5.4: sete dias (Domingo..Sábado) com lista de horários e funções marcáveis (como `MassSheet`; `L` exclui `1L`/`2L`), adicionar/remover horário, bloqueio de horário repetido no mesmo dia e de horário vazio/inválido, caixas das 6 regras (todas marcadas por padrão) com os textos da spec 5.3, aviso das regras sempre ligadas, "Restaurar regras padrão", **Salvar** (desabilitado sem alterações ou com erro de validação; "Salvando..."), **Cancelar** (descarta). Erros de leitura mostram "Tentar novamente".
- `PlanningHeader` ganha `onOpenSettings?: () => void`, botão de engrenagem `aria-label="Configurações do planejamento"` ao lado de "+ Missa"; e `createDefaultsDisabled?: boolean` + `createDefaultsHint?: "no-standard" | "not-empty" | null`: com `no-standard`, mostra "Defina suas missas padrão na engrenagem" (tocar abre o painel); com `not-empty`, "Disponível só com a lista em branco".
- Página: carrega `usePlannerSettings`, passa a `usePlanning`, liga a engrenagem (visível em edição) ao painel e o botão de padrões a `canCreateDefaults`.

- [ ] **Step 1: Testes** — painel: lista vazia inicial; adicionar horário e funções; `L` exclui `1L`/`2L`; horário repetido bloqueia Salvar; remover horário; marcar/desmarcar cada regra; restaurar regras; Salvar chama `onSave` com os dados; Cancelar fecha sem salvar; estado de erro com "Tentar novamente"; falha ao salvar mantém aberto com a mensagem. Cabeçalho: engrenagem chama `onOpenSettings`; botão de padrões desabilitado nos dois casos com a dica certa. Página: botão de padrões habilitado só com lista vazia e padrões configurados; mocka `usePlannerSettings`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** (estilo visual do `MassSheet`/tags existentes; sem cores novas além das já usadas).
- [ ] **Step 4: `npx tsc --noEmit -p . && npx jest src/features/planning src/app/admin/planejamento`** — esperado: PASS.
- [ ] **Step 5: Commit** `feat(planejamento): painel de configurações com engrenagem`.

---

### Task 6: Pergunta de copiar configurações no `PlanChooser`

**Files:**
- Modify: `src/features/planning/ui/PlanChooser.tsx` (+ test), `src/app/admin/planejamento/page.tsx` (recarregar configurações após a cópia com configurações)

**Interfaces:**
- Consumes: `PlanListItem.ownerHasSettings`, `CopyPlan.execute(sourceId, session, overwrite, copySettings)` (Task 2).
- Produces: `PlanChooser` ganha `onSettingsCopied?: () => void`. Fluxo: "Duplicar para mim" → confirmação de sobrescrever (se o meu tem conteúdo) → se `source.ownerHasSettings`, diálogo "Copiar também as configurações de {nome}?" / "Suas missas padrão e regras da lâmpada atuais serão substituídas pelas dele." com botões "Copiar planejamento e configurações", "Copiar só o planejamento", "Cancelar". Sem `ownerHasSettings`, copia direto só o planejamento.

- [ ] **Step 1: Testes** — sem `ownerHasSettings` não pergunta e chama `copy(..., false)`; com ela, cada botão (`true`/`false`/cancelar nada); ordem após a confirmação de sobrescrever; após cópia com configurações chama `onSettingsCopied`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** reutilizando `ConfirmDialog` (ou variante com três botões se necessário).
- [ ] **Step 4: `npx tsc --noEmit -p . && npx jest src/features/planning src/app/admin/planejamento`** — esperado: PASS.
- [ ] **Step 5: Commit** `feat(planejamento): copiar configurações ao duplicar o planejamento`.

---

### Task 7: Verificação final e entrega

- [ ] **Step 1:** `npx tsc --noEmit -p .`, `npx jest`, ESLint nos arquivos alterados, `next build` (variáveis fictícias do Supabase) — tudo verde.
- [ ] **Step 2:** Revisão final da branch por um revisor independente (Sonnet); aplicar o que for real em uma onda de correções.
- [ ] **Step 3:** Push, PR com base `preview` (corpo em português, riscos, validação, "migration ainda não aplicada no Preview").
- [ ] **Step 4:** Migration no banco de Preview **somente com autorização específica do usuário**; verificar catálogo (tabela, RLS, funções, privilégios) depois de aplicar.
- [ ] **Step 5:** CI verde → merge no `preview` (ordem do usuário) → relatório (o que mudou, validação, riscos, próximo passo; Production exige migration em ordem e autorização).
