# Planejamento de Escala Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página admin `/admin/planejamento` onde o admin define as missas do mês e a lâmpada 💡 sugere um leitor por vaga, com travas, edição manual, prévia no WhatsApp e gravação como rascunho.

**Architecture:** Núcleo puro e testável em `src/features/planning/lib/` (elegibilidade, médias mensais, algoritmo da lâmpada, texto da prévia, conversão para o lote de gravação), sem React e sem I/O. Duas leituras novas no data layer (histórico de vagas, indisponibilidades por período), sem schema novo. UI mobile em estilo caderno em `src/features/planning/ui/`, estado em um hook `usePlanning`. Gravação só pelo caminho existente `SaveScheduleBatch` + `UpdateMassesStatus`.

**Tech Stack:** Next.js 16 (App Router, client components), React, TypeScript, Jest + Testing Library (jsdom), date-fns (`ptBR`), Supabase via repositórios existentes, lucide-react, Tailwind (tokens do `design.md`).

**Spec:** `docs/superpowers/specs/2026-11-26-planejamento-escala-design.md` (mockups: https://claude.ai/artifact/3nhKvaNZC8PD9DS9X7QWFG, privado)

## Global Constraints

- Ler `node_modules/next/dist/docs/` antes de criar a rota ou mexer em convenções do Next 16 (`AGENTS.md`).
- **Sem mudança de banco**: nenhuma tabela, coluna, migration ou DDL. Só leituras novas e os métodos de escrita que já existem.
- Códigos de função: `C`, `1L`, `2L`, `L`, `P` (valores de `schedule_slots.role`), sempre **abreviados** na lista.
- Elegível = perfil **ativo (não arquivado**, `archivedAt` vazio), **com ou sem conta vinculada** (decisão do usuário em 26/11/2026).
- Preferências: `preferences.day_preferences` via `preferredTimesForDate` (`src/features/profile/lib/massPreferences.ts`); Domingo=`"6"`, Terça=`"2"`, Sexta=`"5"`; sábado não tem preferência.
- Missas padrão: Terça e Sexta 19:00 → `C`+`L`; Domingo 07:00, 09:00, 11:00, 19:00 → `C`,`1L`,`2L`,`P`.
- Média mensal = leituras servidas (escaladas cumpridas + trocas assumidas; vagas passadas não contam) ÷ meses da janela de **3 meses** anteriores ao mês planejado (ou desde a entrada do leitor, se mais novo); novato sem histórico entra na média do grupo; todo mês conta. Afinidade de função: **12 meses**.
- Acesso só para `profile.role === "admin"` (mesma guarda de `src/app/admin/analise/page.tsx`: `router.push("/")` se não for admin); link no menu admin do `src/shared/ui/Header.tsx`.
- Visual caderno (linhas pautadas, margem vermelha fina à esquerda, data na margem), mobile-first ~448px, toque ≥44px, tokens do `design.md`.
- Nada é gravado até "Salvar como rascunho"; `isPublished` nunca vira `true` por esta página; vagas travadas e missas `readOnly` nunca são alteradas pela lâmpada.
- Git: sem `push --force`; trabalhar na branch da sessão `ccr-c886fd8c-sdxc83`; commits terminam com as linhas de atribuição da sessão. Sem PR e sem push para `preview`/`main` sem pedido explícito do usuário.

## Review Focus

- **Produção sem `original_profile_id`** (comentário em `SupabaseScheduleRepository.listReadingsByProfile`): a leitura do histórico não pode falhar; sem a coluna, trocas assumidas = 0 e o resto funciona (Task 6).
- **Missa de sábado** (sem chave de preferência): sem ⚠️ e sem pontuação de preferência (Task 4).
- **Mês sem missas ou sem leitores elegíveis**: lâmpada não quebra, mostra aviso claro, nada é gravado (Tasks 4 e 10).
- **Conflito de edição** (`schedule_conflict`) ou falha depois de despublicar missas: mensagem amigável, estado do planejamento preservado, nada perdido (Task 11).
- **Leitor arquivado já escalado numa vaga existente**: o nome continua visível e travado, mas não aparece como opção na troca manual nem é sugerido (Task 10).

---

## Mapa de arquivos

Criar:
- `src/features/planning/lib/types.ts` — tipos compartilhados, `roleGroup`, `eligibleReaders`.
- `src/features/planning/lib/defaultMasses.ts` — `buildDefaultMasses`.
- `src/features/planning/lib/readerStats.ts` — `computeReaderStats`.
- `src/features/planning/lib/suggestSchedule.ts` — algoritmo da lâmpada e `summarizePlan`.
- `src/features/planning/lib/previewText.ts` — `buildPreviewText`.
- `src/features/planning/lib/planToBatch.ts` — `planToBatch`.
- `src/features/planning/hooks/usePlanning.ts` — estado e ações da página.
- `src/features/planning/ui/` — `NotebookList.tsx`, `MassSheet.tsx`, `PublishedNotice.tsx`, `SuggestionList.tsx`, `ReaderPicker.tsx`, `ReaderCard.tsx`, `BalanceDetail.tsx`.
- `src/app/admin/planejamento/page.tsx` (+ `page.test.tsx`).
- Um `*.test.ts(x)` ao lado de cada arquivo acima.

Modificar: `src/domain/models/Schedule.ts`, `src/domain/repositories/ScheduleRepository.ts`, `src/domain/repositories/UnavailableRepository.ts`, `src/domain/usecases/schedule/index.ts`, `src/domain/usecases/profiles/unavailable.ts`, `src/data/repositories/SupabaseScheduleRepository.ts`, `src/data/repositories/SupabaseUnavailableRepository.ts`, `src/main/factories/usecases/schedule/index.ts`, `src/main/factories/usecases/profiles/index.ts`, `src/shared/ui/Header.tsx`.

---

### Task 1: Tipos, elegibilidade e missas padrão

**Files:**
- Create: `src/features/planning/lib/types.ts`, `src/features/planning/lib/defaultMasses.ts`
- Test: `src/features/planning/lib/types.test.ts`, `src/features/planning/lib/defaultMasses.test.ts`

**Interfaces:**
- Produces (em `types.ts`):
  ```ts
  export type RoleCode = "C" | "1L" | "2L" | "L" | "P"
  export type RoleGroup = "C" | "R" | "P"          // R = 1L, 2L, L (leitura)
  export const roleGroup: (role: string) => RoleGroup | null
  export interface PlanReader { id: string; fullName: string; createdAt: string; dayPreferences: Record<string, string[]> }
  export interface PlanSlot { id?: string; role: RoleCode; profileId: string /* "" = vazia */; locked: boolean; warning?: "outside-preference"; reason?: string }
  export interface PlanMass { key: string; id?: string; scheduleRevision?: number; date: string /* yyyy-MM-dd */; time: string /* HH:mm */; description: string; wasPublished: boolean; readOnly: boolean; slots: PlanSlot[] }
  export interface ReaderStats { readerId: string; monthlyAverage: number; scheduled: number; takeovers: number; passed: number; roleShare: Record<RoleGroup, number> }
  export interface SuggestInput { masses: PlanMass[]; readers: PlanReader[]; stats: Record<string, ReaderStats>; unavailable: Record<string, string[]> /* data → profileIds */ }
  export interface PlanSummary { totalSlots: number; filled: number; empty: number; outsidePreference: number; locked: number }
  export function eligibleReaders(profiles: Profile[]): PlanReader[]
  ```
  e em `defaultMasses.ts`: `export function buildDefaultMasses(month: Date, existing: { date: string; time: string }[]): PlanMass[]`

- [ ] **Step 1: Write the failing tests**
  - `types.test.ts`: `roleGroup("1L")`, `roleGroup("2L")`, `roleGroup("L")` → `"R"`; `roleGroup("C")` → `"C"`; `roleGroup("P")` → `"P"`; `roleGroup("X")` → `null`. `eligibleReaders` com 4 perfis (ativo com `authUserId`, arquivado, ativo sem `authUserId`, admin ativo com `authUserId`) devolve o ativo, o ativo sem conta e o admin ativo (não o arquivado), com `dayPreferences` vindo de `preferences.day_preferences` (ausente → `{}`).
  - `defaultMasses.test.ts` (Dezembro/2026): `buildDefaultMasses(new Date(2026, 11, 1), [])` devolve 25 missas e 82 vagas; terças em 01, 08, 15, 22, 29 e sextas em 04, 11, 18, 25 às `19:00` com roles `["C","L"]`; domingos 06, 13, 20, 27 às `07:00`,`09:00`,`11:00`,`19:00` com `["C","1L","2L","P"]`; todas com `wasPublished=false`, `readOnly=false`, vagas `profileId: ""`, `locked: false`, `key` únicas. Com `existing=[{date:"2026-12-06",time:"07:00"}]` devolve 24 e nenhuma é 06/12 07:00.

- [ ] **Step 2: Run to verify fail** — `npx jest src/features/planning/lib/types.test.ts src/features/planning/lib/defaultMasses.test.ts` → FAIL (módulos inexistentes).
- [ ] **Step 3: Implement** os tipos/funções acima. Datas via `new Date(\`${date}T00:00:00\`)` (padrão do repo, evita fuso). `key` = `${date}_${time}` para missas novas.
- [ ] **Step 4: Run to verify pass** — mesmo comando → PASS.
- [ ] **Step 5: Commit** — `git add src/features/planning/lib && git commit -m "feat(planejamento): tipos, elegibilidade e missas padrão"`.

---

### Task 2: Estatísticas por leitor (média mensal, trocas, afinidade)

**Files:**
- Create: `src/features/planning/lib/readerStats.ts`
- Modify: `src/domain/models/Schedule.ts` (adicionar `SlotHistoryRow`)
- Test: `src/features/planning/lib/readerStats.test.ts`

**Interfaces:**
- Consumes: `PlanReader`, `ReaderStats`, `RoleGroup`, `roleGroup` (Task 1).
- Produces: em `Schedule.ts`: `export interface SlotHistoryRow { date: string; role: string; profileId: string; originalProfileId?: string | null }`; em `readerStats.ts`: `export function computeReaderStats(readers: PlanReader[], history: SlotHistoryRow[], month: Date): Record<string, ReaderStats>`

- [ ] **Step 1: Write the failing tests** (mês planejado = dez/2026; janela da média = set, out, nov/2026; afinidade = dez/2025 a nov/2026):
  - escalada cumprida: linha `profileId=A, originalProfileId=null` → `scheduled=1`; troca assumida: `profileId=B, originalProfileId=A` → `B.takeovers=1`, e `A.passed=1` sem contar para A.
  - `originalProfileId` ausente (`undefined`) → conta como escalada, `takeovers=0`.
  - leitor antigo com 6 leituras servidas nos 3 meses → `monthlyAverage === 2`; histórico fora da janela de 3 meses não entra na média (mas entra no `roleShare`).
  - leitor com `createdAt` em out/2026 (2 meses de janela) e 3 leituras → `monthlyAverage === 1.5`; entrou em nov/2026 e 3 leituras → `3`.
  - novato com `createdAt` em dez/2026 (0 meses de janela) → `monthlyAverage` = média dos `monthlyAverage` dos demais leitores (grupo).
  - linhas do mês planejado ou posteriores são ignoradas.
  - `roleShare` de quem tem 14 linhas `C` e 1 `1L` → `C ≈ 14/15`, `R ≈ 1/15`, `P = 0`; sem histórico → todos `0`.
- [ ] **Step 2: Run to verify fail** — `npx jest src/features/planning/lib/readerStats.test.ts` → FAIL.
- [ ] **Step 3: Implement** `computeReaderStats`. Meses da janela = meses inteiros entre `max(início da janela, mês de createdAt)` e o mês planejado (exclusivo); `servidas = scheduled + takeovers` na janela; média = servidas ÷ meses; meses = 0 → média do grupo (calculada sobre os leitores com meses > 0; sem nenhum, `0`).
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `feat(planejamento): média mensal, trocas e afinidade por leitor`.

---

### Task 3: Lâmpada — regras duras, travas e determinismo

**Files:**
- Create: `src/features/planning/lib/suggestSchedule.ts`
- Test: `src/features/planning/lib/suggestSchedule.test.ts`

**Interfaces:**
- Consumes: `SuggestInput`, `PlanMass`, `PlanSlot`, `PlanSummary` (Task 1).
- Produces: `export function suggestSchedule(input: SuggestInput): PlanMass[]` (função pura; devolve novas missas, nunca muta a entrada; reaplica a sugestão em todas as vagas **não travadas** de missas não `readOnly`, limpando as anteriores) e `export function summarizePlan(masses: PlanMass[]): PlanSummary`.

- [ ] **Step 1: Write the failing tests** (fábricas de `PlanReader`/`PlanMass` no próprio arquivo; stats zerados):
  - `nunca sugere leitor indisponível na data`: A e B, `unavailable={"2026-12-06":["A"]}`, uma vaga `C` em 06/12 → `profileId === "B"`.
  - `vaga fica vazia quando ninguém é elegível`: todos indisponíveis → `profileId === ""`; as demais vagas continuam sendo preenchidas.
  - `não repete leitor na mesma missa`: 4 vagas e 3 leitores → exatamente 3 preenchidas, todas com leitores distintos, 1 vazia.
  - `preserva vagas travadas e missas readOnly`: vaga `locked` com `profileId="A"` fica igual; missa `readOnly` fica idêntica; vaga **não** travada já preenchida é refeita.
  - `entrada não é mutada e resultado é determinístico`: `JSON.stringify(input)` igual antes/depois; duas chamadas → saídas iguais.
  - `mês sem missas ou sem leitores`: `suggestSchedule({masses: [], ...})` → `[]`; sem leitores → todas as vagas vazias, sem exceção.
  - `summarizePlan`: com 5 vagas (3 preenchidas, 1 com `warning`, 2 travadas) → `{ totalSlots: 5, filled: 3, empty: 2, outsidePreference: 1, locked: 2 }`.
- [ ] **Step 2: Run to verify fail** — `npx jest src/features/planning/lib/suggestSchedule.test.ts` → FAIL.
- [ ] **Step 3: Implement** `suggestSchedule` (construção simples: percorre vagas, filtra elegíveis pelas regras duras, escolhe o primeiro por critério neutro e desempate por `fullName` e depois `id`) e `summarizePlan`.
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `feat(planejamento): lâmpada com regras duras e travas`.

---

### Task 4: Lâmpada — preferência, equilíbrio, afinidade e melhoria

**Files:**
- Modify: `src/features/planning/lib/suggestSchedule.ts`
- Test: `src/features/planning/lib/suggestSchedule.test.ts` (acrescentar)

**Interfaces:**
- Consumes: `suggestSchedule` (Task 3), `ReaderStats.monthlyAverage`/`roleShare` (Task 2), `preferredTimesForDate`.
- Produces: mesma assinatura; agora preenche `PlanSlot.warning = "outside-preference"` e `PlanSlot.reason` (texto curto, pt-BR, usado por 👁/Detalhar).

- [ ] **Step 1: Write the failing tests:**
  - `prefere quem marcou preferência`: A com `{"6":["07:00"]}`, B com `{"6":["09:00"]}`, missa Dom 07:00 → A, sem `warning`.
  - `fora da preferência recebe aviso`: só B disponível (A indisponível), missa Dom 07:00 → B com `warning === "outside-preference"`.
  - `sábado não gera aviso`: missa num sábado, leitor sem chave para sábado → preenchida, sem `warning`.
  - `equilíbrio`: 4 leitores sempre disponíveis, 4 missas × 2 vagas → cada leitor com exatamente 2; e 22 leitores com preferência em todos os horários, as 25 missas padrão de dez/2026 (82 vagas) → `max - min <= 1` de vagas por leitor.
  - `média mais baixa tem prioridade`: A `monthlyAverage=1`, B `monthlyAverage=5`, uma vaga → A.
  - `afinidade`: A `roleShare={C:0.9,R:0.1,P:0}`, B `roleShare={C:0.1,R:0.9,P:0}`, missa com `C` e `1L` → A em `C`, B em `1L`.
  - `espaçamento`: 3 leitores, duas missas no mesmo dia (07:00 e 09:00, 1 vaga cada) → leitores diferentes.
  - `vagas mais restritas primeiro`: X só disponível na terça (indisponível nos demais dias), uma vaga na terça e uma no domingo, leitores X e Y → X na terça, Y no domingo.
  - `travadas contam na carga`: 2 leitores, 2 vagas, uma travada com A → a outra vai para B.
- [ ] **Step 2: Run to verify fail** — mesmo arquivo de teste → novos casos FAIL.
- [ ] **Step 3: Implement** em `suggestSchedule.ts`: (1) ordenar vagas da mais restrita (menos elegíveis) para a menos; (2) nota por candidato combinando déficit contra a meta mensal (vagas ÷ leitores elegíveis, com `monthlyAverage` como viés), preferência de dia/horário, afinidade de função e penalidade por já ter missa no mesmo dia/fim de semana anterior; (3) escolher a maior nota, desempate determinístico; (4) rodada de melhoria por troca entre pares que reduz o desvio da meta sem quebrar regra dura nem tocar travadas, parando quando não melhora; (5) preencher `warning`/`reason`. Pesos exatos ficam a critério do implementador; os testes acima são o contrato.
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `feat(planejamento): pontuação por preferência, equilíbrio e afinidade`.

---

### Task 5: Texto da prévia (WhatsApp)

**Files:**
- Create: `src/features/planning/lib/previewText.ts`
- Test: `src/features/planning/lib/previewText.test.ts`

**Interfaces:**
- Consumes: `PlanMass`, `PlanReader` (Task 1).
- Produces: `export function buildPreviewText(masses: PlanMass[], readers: PlanReader[], month: Date): string`

- [ ] **Step 1: Write the failing test** com uma missa Ter 01/12 19:00 (`C` Ana, `L` Carla com `warning`) e Sex 04/12 19:00 (`C` Diego, `L` vazia): o texto contém, nesta ordem, `*PRÉVIA – Escala de Dezembro/2026 (não publicada)*`, `*terça-feira – 01/12*`, `19:00 - Missa`, `C - Ana Ribeiro`, `L - Carla Mendes ⚠️`, `*sexta-feira – 04/12*`, `L - ---` e a legenda `⚠️ = fora da preferência do leitor`; usa a descrição especial no lugar de `Missa` quando existir; não contém `@`, nem dígitos de telefone.
- [ ] **Step 2: Run to verify fail** — `npx jest src/features/planning/lib/previewText.test.ts` → FAIL.
- [ ] **Step 3: Implement** reaproveitando o formato do `handleShare` de `src/app/page.tsx` (ordenar missas por data/hora e vagas por `C, 1L, L, 2L, P`; datas com `ptBR`).
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `feat(planejamento): texto da prévia para WhatsApp`.

---

### Task 6: Leituras novas no data layer (histórico e indisponibilidades)

**Files:**
- Modify: `src/domain/repositories/ScheduleRepository.ts`, `src/domain/repositories/UnavailableRepository.ts`, `src/domain/usecases/schedule/index.ts`, `src/domain/usecases/profiles/unavailable.ts`, `src/data/repositories/SupabaseScheduleRepository.ts`, `src/data/repositories/SupabaseUnavailableRepository.ts`, `src/main/factories/usecases/schedule/index.ts`, `src/main/factories/usecases/profiles/index.ts`
- Test: `src/data/repositories/listSlotHistory.test.ts`, `src/data/repositories/listUnavailableForRange.test.ts` (seguir o padrão de mock de `listReadingsByProfile.test.ts`)

**Interfaces:**
- Consumes: `SlotHistoryRow` (Task 2).
- Produces: `ScheduleRepository.listSlotHistory(fromDate: string, toDate: string): Promise<SlotHistoryRow[]>`; `UnavailableRepository.listForRange(fromDate: string, toDate: string): Promise<Record<string, string[]>>`; use cases `ListSlotHistory.execute(fromDate, toDate)` e `ListUnavailableForRange.execute(fromDate, toDate)`; factories `makeListSlotHistory()` e `makeListUnavailableForRange()`.

- [ ] **Step 1: Write the failing tests:** `listSlotHistory` consulta `schedule_slots` com `select('*, mass:masses!inner(date, is_published)')` (nunca nomeando `original_profile_id`), filtra `mass.is_published = true` e o intervalo de datas, ignora vagas sem `profile_id` e mapeia `original_profile_id` para `originalProfileId` (**linha sem a coluna → `originalProfileId: null`, sem erro**). `listForRange` consulta `unavailable_dates` entre as datas e devolve `{ "2026-12-06": ["p1","p2"] }`; erro do Supabase é relançado.
- [ ] **Step 2: Run to verify fail** — `npx jest src/data/repositories/listSlotHistory.test.ts src/data/repositories/listUnavailableForRange.test.ts` → FAIL.
- [ ] **Step 3: Implement** os métodos nos repositórios Supabase, os use cases e as factories.
- [ ] **Step 4: Run to verify pass** → PASS; rodar também `npx jest src/data` para garantir que nada existente quebrou.
- [ ] **Step 5: Commit** — `feat(planejamento): leituras de histórico de vagas e indisponibilidades por período`.

---

### Task 7: Conversão do planejamento para o lote de gravação

**Files:**
- Create: `src/features/planning/lib/planToBatch.ts`
- Test: `src/features/planning/lib/planToBatch.test.ts`

**Interfaces:**
- Consumes: `PlanMass` (Task 1); `ScheduleBatchEntry`, `RemovedMass` (`src/domain/models/Schedule.ts`).
- Produces: `export function planToBatch(masses: PlanMass[], removed: PlanMass[]): { entries: ScheduleBatchEntry[]; removed: RemovedMass[]; unpublishIds: string[] }`

- [ ] **Step 1: Write the failing tests:** missa nova → `massId` indefinido, `massData = { date, time: "07:00:00", specialDescription, monthReference: "2026-12", expectedRevision: undefined }`; missa existente → `massId` e `expectedRevision = scheduleRevision`, slots com `id` preservado; vaga vazia → `{ role, profileId: "" }` (como o `ScheduleForm` já grava); missas `readOnly` não geram entrada; `removed` → `[{ id, expectedRevision }]` só para as que têm `id`; `unpublishIds` = `id` das missas com `wasPublished && !readOnly`.
- [ ] **Step 2: Run to verify fail** — `npx jest src/features/planning/lib/planToBatch.test.ts` → FAIL.
- [ ] **Step 3: Implement** `planToBatch`.
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `feat(planejamento): conversão do planejamento para o lote de gravação`.

---

### Task 8: Página, guarda de admin, carga do mês e lista caderno (antes da lâmpada)

**Files:**
- Create: `src/app/admin/planejamento/page.tsx`, `src/features/planning/hooks/usePlanning.ts`, `src/features/planning/ui/NotebookList.tsx`, `src/features/planning/ui/PublishedNotice.tsx`
- Modify: `src/shared/ui/Header.tsx` (item "Planejamento de Escala" no bloco `user?.role === "admin"`, depois de "Análise de Usuários")
- Test: `src/app/admin/planejamento/page.test.tsx`, `src/features/planning/hooks/usePlanning.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 6; `makeListSchedulesForMonth`, `makeListProfiles`, `makeListSlotHistory`, `makeListUnavailableForRange`.
- Produces: `usePlanning(month: Date)` retornando `{ masses: PlanMass[]; readers: PlanReader[]; stats: Record<string, ReaderStats>; unavailable: Record<string, string[]>; summary: PlanSummary; publishedCount: number; loading: boolean; createDefaults(): void; addMass(m: PlanMass): void; updateMass(key: string, patch: Partial<PlanMass>): void; removeMass(key: string): void; acceptPublished(): void; declinePublished(): void }`. Missas carregadas do banco entram com vagas preenchidas `locked: true` e `readOnly = wasPublished` até o admin aceitar o aviso.

- [ ] **Step 1: Write the failing tests:** página — não admin → `router.push("/")`; admin vê "Planejamento de Escala", o mês e o resumo "N missas · N vagas · N leitores aptos"; clicar "Criar Missas Padrões no mês" num mês vazio mostra `25 missas · 82 vagas` (dez/2026); linhas em estilo caderno: data (`06` + `DOM`) só na 1ª missa do dia e funções como `C · 1L · 2L · P`; com 2 missas publicadas existentes, aparece "Existem 2 missas publicadas em dezembro" com os botões de incluir e de manter; "incluir" torna-as editáveis (`readOnly=false`), "manter" deixa `readOnly=true` (marca "publicada"). Header — admin vê o link `/admin/planejamento`; leitor não.
- [ ] **Step 2: Run to verify fail** — `npx jest src/app/admin/planejamento src/features/planning/hooks` → FAIL.
- [ ] **Step 3: Implement** a rota (consultar `node_modules/next/dist/docs/` antes), a guarda (`useAuth`, igual à de `admin/analise`), o hook (carregar missas com `makeListSchedulesForMonth().execute(month, true)`, perfis, histórico de 12 meses anteriores e indisponibilidades do mês; `computeReaderStats` e `eligibleReaders` sobre isso), a lista caderno e o aviso. O texto do aviso deixa claro que as missas voltarão a rascunho, que os leitores deixarão de vê-las e que os lembretes param até a republicação.
- [ ] **Step 4: Run to verify pass** → PASS; `npx tsc --noEmit` sem erros novos.
- [ ] **Step 5: Commit** — `feat(planejamento): página admin, carga do mês e lista caderno`.

---

### Task 9: Sheet de criar/editar missa

**Files:**
- Create: `src/features/planning/ui/MassSheet.tsx`
- Modify: `src/features/planning/ui/NotebookList.tsx` (tocar na linha abre o sheet), `src/app/admin/planejamento/page.tsx` ("+ Missa")
- Test: `src/features/planning/ui/MassSheet.test.tsx`

**Interfaces:**
- Consumes: `usePlanning.addMass/updateMass/removeMass` (Task 8), `PlanMass`.
- Produces: `MassSheet({ month: Date; mass?: PlanMass; existing: { date: string; time: string }[]; onSave: (masses: PlanMass[]) => void; onRemove?: () => void; onClose: () => void })`

- [ ] **Step 1: Write the failing tests:** escolher um domingo pré-marca `C`, `1L`, `2L`, `P`; terça ou sexta pré-marca `C`, `L`; marcar `L` desmarca `1L`/`2L` e vice-versa; atalhos de horário `07:00`/`09:00`/`11:00`/`19:00` e "Outro"; "Repetir em todos os domingos do mês" gera uma missa por domingo do mês; horário repetido na mesma data mostra erro e não salva; editar uma missa mantém os leitores já preenchidos nas funções que continuam marcadas.
- [ ] **Step 2: Run to verify fail** — `npx jest src/features/planning/ui/MassSheet.test.tsx` → FAIL.
- [ ] **Step 3: Implement** `MassSheet` reaproveitando `TimeRoller` e o padrão de conflito de horário do `ScheduleForm`.
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `feat(planejamento): sheet para criar e editar missas`.

---

### Task 10: Depois da lâmpada — lista, travas, troca manual e card do leitor

**Files:**
- Create: `src/features/planning/ui/SuggestionList.tsx`, `src/features/planning/ui/ReaderPicker.tsx`, `src/features/planning/ui/ReaderCard.tsx`
- Modify: `src/features/planning/hooks/usePlanning.ts`, `src/app/admin/planejamento/page.tsx`
- Test: `src/features/planning/ui/SuggestionList.test.tsx`, `src/features/planning/hooks/usePlanning.test.ts` (acrescentar)

**Interfaces:**
- Consumes: `suggestSchedule`, `summarizePlan` (Tasks 3–4); `usePlanning` (Task 8).
- Produces: novas ações em `usePlanning`: `runLamp(): void`, `setSlotReader(massKey: string, slotIndex: number, profileId: string): void` (**trava a vaga**), `toggleLock(massKey: string, slotIndex: number): void`, `phase: "planning" | "suggested"`.

- [ ] **Step 1: Write the failing tests:** lâmpada com missas e leitores preenche vagas e passa a `phase="suggested"`; sem missas, a lâmpada mostra "Crie as missas do mês primeiro" e não faz nada; sem leitores elegíveis, mostra aviso e as vagas ficam vazias; linha por função (`C`, `1L`… + nome); ⚠️ com `aria-label="Fora da preferência"`; vaga vazia mostra "sem leitor · escolher"; 🔒 alterna `aria-pressed` e vagas travadas não mudam em "Sugerir de novo"; escolher outro leitor no picker **trava** a vaga; o picker lista só leitores elegíveis (sem arquivados), tratando os indisponíveis como o `ScheduleForm` faz; vaga existente de leitor arquivado continua mostrando o nome, travada; 👁 abre o card com as escalas do leitor no mês (a atual marcada), contagem vs meta, média dos últimos 3 meses, função que mais faz, preferências e datas indisponíveis; filtros "Todas", "Com aviso (N)", "Travadas (N)"; o resumo do topo mostra "N de M vagas preenchidas · N fora da preferência · N sem leitor".
- [ ] **Step 2: Run to verify fail** — `npx jest src/features/planning` → FAIL nos novos casos.
- [ ] **Step 3: Implement** as ações do hook e os componentes (linhas do caderno: data na margem só na 1ª linha do dia, horário só na 1ª linha da missa; 👁 e 🔒 com área de toque ≥44px).
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `feat(planejamento): lâmpada, travas, troca manual e card do leitor`.

---

### Task 11: Detalhar, Prévia e Salvar como rascunho

**Files:**
- Create: `src/features/planning/ui/BalanceDetail.tsx`
- Modify: `src/features/planning/hooks/usePlanning.ts`, `src/app/admin/planejamento/page.tsx`
- Test: `src/features/planning/ui/BalanceDetail.test.tsx`, `src/features/planning/hooks/usePlanning.test.ts` (acrescentar)

**Interfaces:**
- Consumes: `buildPreviewText` (Task 5), `planToBatch` (Task 7), `makeSaveScheduleBatch`, `makeUpdateMassesStatus`, `scheduleErrorMessage` (`src/features/schedule/scheduleErrorMessage.ts`).
- Produces: `usePlanning.saveDraft(): Promise<boolean>` e `usePlanning.previewText(): string`.

- [ ] **Step 1: Write the failing tests:** "Detalhar" mostra, por leitor, nome, função mais frequente, contagem do mês contra a meta e `escaladas / trocas assumidas / passadas`; "Prévia" chama `window.open` com `https://wa.me/?text=` + texto codificado de `buildPreviewText`; "Salvar como rascunho" sem missas publicadas incluídas chama `SaveScheduleBatch.execute(entries, removed)` uma vez e recarrega o mês; com missas publicadas incluídas, mostra confirmação ("os leitores deixam de ver essas missas") e, ao confirmar, chama `UpdateMassesStatus.execute(unpublishIds, false)` **antes** de `SaveScheduleBatch`; conflito (`schedule_conflict`) mostra a mensagem de `scheduleErrorMessage`, mantém o estado do planejamento e não perde edições; falha ao gravar depois de despublicar informa que as missas ficaram em rascunho e permite salvar de novo.
- [ ] **Step 2: Run to verify fail** — `npx jest src/features/planning` → FAIL nos novos casos.
- [ ] **Step 3: Implement** `BalanceDetail`, `saveDraft` e `previewText`. Escolha do plano: despublicar primeiro e gravar depois, para o leitor nunca ficar visível/notificável com dados incompletos.
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `feat(planejamento): Detalhar, Prévia e salvar como rascunho`.

---

### Task 12: Verificação final e entrega para aprovação

**Files:** nenhum arquivo de produto novo; screenshots em `docs/pr-assets/planejamento/` (padrão da pasta `docs/pr-assets`).

- [ ] **Step 1: Validação** — `npx tsc --noEmit`, `npx eslint src/features/planning src/app/admin/planejamento src/shared/ui/Header.tsx`, `npx jest src/features/planning src/app/admin src/data src/shared` → sem falhas novas (separar falhas legadas do baseline); `npm run build` com sucesso.
- [ ] **Step 2: Prints** — com dados sintéticos (nunca dados reais), capturar a 390px de largura: lista antes da lâmpada, aviso de missas publicadas, depois da lâmpada, card do 👁, Detalhar.
- [ ] **Step 3: Relatório** — informar o que mudou, como foi validado, riscos reais (inclusive a nota sobre `original_profile_id` em Production) e o próximo passo; **não** abrir PR nem publicar em `preview` sem pedido do usuário.
- [ ] **Step 4: Commit** — `git add docs/pr-assets/planejamento && git commit -m "docs(planejamento): prints para aprovação"`.
