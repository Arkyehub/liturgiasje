# Configurações do planejamento (missas padrão e regras da lâmpada) — design

Data: 2026-11-27 · Status: aguardando aprovação do usuário · Escopo: projeto (migration + app).

## 1. Intenção e porquê

Hoje os horários das missas padrão e as regras da lâmpada estão fixos no código (terça e sexta 19:00 com C e L; domingo 07/09/11/19 com C, 1L, 2L e P; pesos da lâmpada). O usuário quer vender o app para outras igrejas, cada uma com a sua estrutura, então **nada de missa pré-cadastrada**. Cada coordenador (admin) deve definir, num painel de configuração, as suas missas padrão e quais regras suaves a lâmpada usa. São preferências **individuais**: não são compartilhadas, e ao duplicar o planejamento de outro coordenador o app pergunta se as configurações dele devem vir junto.

Também: "Criar Missas Padrões no mês" só pode ser usado com a lista do planejamento em branco.

## 2. Objetivos, não objetivos e antiobjetivos

**Objetivos**
- Painel de configuração aberto por um botão de engrenagem na tela do planejamento (painel lateral; no celular sobe de baixo).
- Missas padrão por dia da semana: uma lista de horários por dia, cada um com as suas funções (C, 1L, 2L, L, P).
- Regras da lâmpada em caixas de marcar, todas **marcadas** por padrão e desmarcáveis (inclusive "equilibrar a carga").
- Configurações por coordenador, em tabela própria no banco (uma linha por coordenador), valendo em todos os meses e aparelhos.
- Pergunta ao duplicar: "Copiar também as configurações de X?".
- "Criar Missas Padrões no mês" habilitado só com a lista vazia **e** com ao menos uma missa padrão configurada.

**Não objetivos**
- Multi-igreja (separação de igrejas no banco). Não existe hoje; a tabela é chaveada pelo perfil e funciona igual com um banco por igreja ou um banco compartilhado.
- Configurar as três regras duras (indisponibilidade na data, um leitor por missa, vagas travadas): ficam sempre ligadas e aparecem só como aviso no painel.
- Configuração por planejamento/mês. Engrenagem na tela de escolha de planejamentos (no primeiro corte, só dentro de um planejamento aberto).
- Pesos numéricos ajustáveis; só liga/desliga.

**Antiobjetivos** (falha mesmo que "funcione")
- Qualquer horário de missa ou função padrão embutido no código ou semeado pela migration.
- Uma tabela por coordenador ou por igreja (escala mal).
- Copiar configurações sem avisar que as do coordenador atual serão substituídas.
- Desligar uma regra e a lâmpada continuar explicando a sugestão com essa regra.

## 3. Restrições

- Projeto Next.js 16/React 19, camadas modelo → repositório Supabase → caso de uso → factory (como `SchedulePlan`).
- Funções SQL `SECURITY DEFINER` com `search_path = pg_catalog, public`, RLS ligada sem políticas, `REVOKE`/`GRANT` como em `schedule_plans`; só admin ativo (`plan_actor()`).
- Regras do `AGENTS.md`: migration no Preview só com autorização específica do usuário; nunca no Production sem autorização específica; PR com base `preview`; mudança visual só entra no `preview` depois da aprovação do usuário (mock/prints); validação proporcional (testes SQL em PostgreSQL descartável, Jest, TypeScript, lint, build).
- O app deve continuar funcionando se as funções novas ainda não existirem no banco do ambiente (tratamento "indisponível" como em `plan_*`).

## 4. Abordagens consideradas

- **A. Uma tabela, uma linha por coordenador, dados em JSON (escolhida pelo usuário).** `planner_settings` com `standard_masses jsonb` e `lamp_rules jsonb`; funções ler/salvar; validação no servidor. Uma regra nova é uma chave nova, sem migration.
- **B. Tabelas relacionais** (uma linha por missa padrão, uma coluna por regra). O banco garante a estrutura, mas cada regra nova exige migration e o painel faz mais chamadas.
- **C. Coluna JSON em `profiles`.** Descartada: mistura preferência com cadastro e herda permissões mais amplas.

Escolha: **A**, pelo menor custo de evolução ao vender para várias igrejas.

## 5. Design

### 5.1 Banco

Tabela `public.planner_settings`:
- `profile_id uuid primary key references public.profiles(id) on delete cascade`
- `standard_masses jsonb not null default '[]'` — array de `{ weekday: 0..6, time: "HH:mm", roles: ["C","1L",...] }`
- `lamp_rules jsonb not null default '{}'` — objeto com as chaves booleanas de 5.3 (chave ausente = ligada)
- `updated_at timestamptz not null default now()`
- RLS ligada, sem políticas, `REVOKE ALL` de `public/anon/authenticated`.

Funções (admin ativo, `authenticated`, nunca `anon`):
- `planner_settings_get() returns jsonb` → `{ standardMasses, lampRules, hasCustom }`; sem linha devolve `{ standardMasses: [], lampRules: {}, hasCustom: false }`.
- `planner_settings_save(p_standard_masses jsonb, p_lamp_rules jsonb) returns jsonb` → upsert da linha do coordenador autenticado e devolve o mesmo formato de `get`. Validações no servidor (erro `invalid_settings`): `standard_masses` é array com no máximo 70 itens; cada item tem `weekday` inteiro 0..6, `time` no formato `HH:mm` válido, `roles` array não vazio, sem repetição, só de `C|1L|2L|L|P`, sem `L` junto com `1L`/`2L`; sem dois itens com o mesmo `weekday`+`time`; `lamp_rules` é objeto e só as chaves conhecidas são guardadas, todas booleanas. Tamanho máximo do JSON (erro `settings_too_large`, ex.: 32 KB).
- `plan_copy(p_source, p_session, p_overwrite, p_copy_settings boolean default false)`: nova assinatura (a antiga é removida). Com `p_copy_settings = true`, na **mesma transação**, copia as configurações do dono do planejamento de origem para as do coordenador atual (substitui; se a origem não tem linha, a do coordenador atual é removida, voltando aos padrões). Falha em qualquer parte desfaz tudo.
- `plan_list` e os itens de planejamento ganham `ownerHasSettings boolean` (o dono tem linha em `planner_settings`), para o app só perguntar quando houver algo a copiar.

Migration `migration_planejamento_configuracoes.sql` + rollback; idempotente; **não semeia nenhuma missa**.

### 5.2 Missas padrão no app

- Tipo `StandardMass { weekday: number; time: string; roles: RoleCode[] }`.
- `buildDefaultMasses(month, existing, standardMasses)`: para cada dia do mês, as missas padrão do dia da semana que ainda não existem (mesmo critério de data+horário de hoje). Sem missas padrão, devolve lista vazia. As constantes fixas de hoje são removidas.
- Botão "Criar Missas Padrões no mês" (cabeçalho do planejamento):
  - habilitado só se: planejamento em edição, carregado, **zero missas no planejamento** (publicadas contam) e **ao menos uma missa padrão** configurada;
  - sem missas padrão: desabilitado, com a dica "Defina suas missas padrão na engrenagem" (tocar na dica abre o painel);
  - com missas no planejamento: desabilitado, com a dica "Disponível só com a lista em branco".

### 5.3 Regras da lâmpada

Chaves (todas ligadas por padrão), com o efeito em `suggestSchedule` (parâmetro opcional `rules`; ausente = tudo ligado, mantendo o comportamento e os testes de hoje):

| Chave | Texto no painel | Desligada |
|---|---|---|
| `balance` | Equilibrar a carga entre os leitores | `W_BALANCE = 0` e `W_OVER = 0` |
| `preferences` | Respeitar preferências de dia e horário | `W_PREF_MISS = 0` |
| `affinity` | Combinar o leitor com a função que ele mais faz | `W_AFFINITY = 0` |
| `sameDay` | Evitar o mesmo leitor duas vezes no mesmo dia | `W_SAME_DAY = 0` |
| `weekends` | Evitar fins de semana seguidos | `W_WEEKEND = 0` |
| `history` | Dar mais vagas a quem serviu menos nos meses anteriores | `MAX_AVG_BIAS = 0` (meta igual para todos) |

Sempre ligadas (só aviso no painel): indisponibilidade na data, um leitor por missa, vagas travadas.
Os motivos exibidos por vaga (`buildReason`) não citam regras desligadas.
Mudar as regras **não** refaz a escala já sugerida; vale na próxima vez que o admin usar a lâmpada ou "Sugerir de novo".

### 5.4 Painel de configuração (UI)

- Botão de engrenagem (aria-label "Configurações do planejamento") ao lado de "+ Missa" no cabeçalho do planejamento; disponível em edição.
- Painel lateral (`Sheet`; no celular sobe de baixo) com duas seções: **Missas padrão** (por dia da semana, lista de horários, cada horário com as funções marcáveis como no `MassSheet`, com `L` excluindo `1L`/`2L`; adicionar e remover horário; sem horário repetido no mesmo dia) e **Regras da lâmpada** (caixas de 5.3 e o aviso das regras sempre ligadas).
- Botões **Salvar** e **Cancelar** (Cancelar descarta); "Restaurar regras padrão" (marca todas as caixas; não mexe nas missas padrão).
- Estados: carregando, erro com "Tentar novamente", salvando, erro ao salvar (mantém o painel aberto com a mensagem).

### 5.5 Carga e uso das configurações

- Hook `usePlannerSettings`: lê as configurações uma vez ao abrir a tela do planejamento; expõe `standardMasses`, `lampRules`, `status`, `save()`, `reload()`.
- `usePlanning` recebe `standardMasses` e `lampRules`; `createDefaults` e `runLamp` usam esses valores.
- Se as funções não existirem no ambiente (`unavailable`) ou a leitura falhar: regras padrão (todas ligadas), sem missas padrão (botão de padrões desabilitado) e, no caso de falha de rede, um aviso com "Tentar novamente" no painel.
- Concorrência: última gravação vence (um dono, um aparelho por vez na prática); sem revisão otimista.

### 5.6 Duplicar o planejamento de outro coordenador

No `PlanChooser`, depois da confirmação de sobrescrever (quando o meu planejamento tem conteúdo), se o item de origem tem `ownerHasSettings`: diálogo "Copiar também as configurações de {nome}?" — "Suas missas padrão e regras da lâmpada atuais serão substituídas pelas dele." — com **"Copiar planejamento e configurações"**, **"Copiar só o planejamento"** e **"Cancelar"**. O resultado vai em `plan_copy(..., p_copy_settings)`. Sem `ownerHasSettings`, não pergunta e copia só o planejamento. Depois da cópia com configurações, o app recarrega as configurações.

## 6. Testes e entrega

- SQL (PostgreSQL 16 descartável): privilégios (anon sem acesso, helpers não expostos, sem acesso direto à tabela), `get` sem linha, `save` válido/inválido (cada regra de validação), upsert por coordenador, isolamento entre coordenadores, `plan_copy` com e sem configurações (inclusive origem sem linha), atomicidade, `ownerHasSettings`, migration idempotente e rollback.
- Jest: `buildDefaultMasses` com e sem padrões, `suggestSchedule` com cada regra desligada (efeito e motivos), hook `usePlannerSettings`, painel (editar, validar, salvar, cancelar, restaurar), cabeçalho (engrenagem e estados do botão de padrões), `PlanChooser` (pergunta só quando há configurações; três respostas).
- Entrega: PR com base `preview`; antes de aplicar a migration no banco de Preview, pedir autorização específica ao usuário; mock/prints do painel para aprovação visual antes do merge; Production fora do escopo.

## 7. Decisões minhas (não decididas pelo usuário)

- Painel só com **Salvar/Cancelar** (não grava a cada toque).
- Gravação "última vence", sem revisão otimista.
- "Lista em branco" = nenhuma missa no planejamento, publicadas incluídas.
- Engrenagem só dentro de um planejamento aberto em edição.
- "Restaurar regras padrão" não apaga as missas padrão.
- A pergunta de copiar configurações vem **depois** da confirmação de sobrescrever.
- Limites: 70 missas padrão, 32 KB.

## 8. Deixado ao construtor

Nomes exatos de arquivos, componentes e códigos de erro além dos citados; textos finais dos avisos; layout fino do painel (seguindo o estilo do `MassSheet`); organização interna dos testes.
