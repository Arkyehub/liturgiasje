# Planejamento de Escala — design

Data: 2026-11-26 · Status: aguardando aprovação do usuário · Mockups: https://claude.ai/artifact/3nhKvaNZC8PD9DS9X7QWFG (privado)

## 1. Intenção

Hoje o admin monta a escala **um dia por vez** (`ScheduleForm`), escolhendo leitor por leitor. O admin quer **automatizar** isso: definir as missas do mês, tocar numa lâmpada 💡 e receber uma **sugestão completa e equilibrada**, que ele revisa, ajusta, compartilha e salva como rascunho.

Por quê: a escala boa é equilibrada (ninguém sobrecarregado, ninguém esquecido), respeita preferências e indisponibilidades e leva em conta o que cada leitor costuma fazer. Isso é trabalho de análise de dados que o admin faz de cabeça hoje.

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
- Página nova **"Planejamento de Escala"**, só para admin, visão macro do mês.
- Admin cria as missas (dia, horário, funções); a lâmpada sugere leitor para cada vaga.
- Sugestão explicável (⚠️ onde quebrou preferência), editável à mão, com travas.
- Compartilhar prévia por WhatsApp antes de salvar.

**Não-objetivos**
- Não substitui a tela de Escala atual nem o `ScheduleForm`.
- Não publica a escala (publicar continua como hoje).
- Sem mudança de banco (nenhuma tabela, coluna ou migration).
- Sem otimização "perfeita": heurística gulosa + rodada de melhoria é suficiente para ~22 leitores.

**Anti-objetivos (seria fracasso mesmo funcionando)**
- A lâmpada **sobrescrever** ajuste manual, trava ou escala já publicada.
- Escalar leitor indisponível, arquivado ou **sem conta vinculada**.
- Sobrecarregar leitores engajados ou "compensar" novatos com enxurrada de escalas.
- Alterar o banco por causa de um clique na lâmpada (sugestão só é gravada em "Salvar como rascunho").

## 3. Restrições

- Next.js 16 (ver `AGENTS.md`: consultar `node_modules/next/dist/docs/` antes de mexer em convenções do framework). Arquitetura em camadas já existente: `domain` / `data` / `main/factories` / `features`.
- Mobile-first (PWA, ~448px), design em `design.md` (stone/amber, Inter, áreas de toque ≥44px).
- Página fica em `src/app/admin/planejamento/`, com guarda de admin igual às páginas `admin/membros` e `admin/analise`; link no menu de admin do `Header`.
- Funções (valores de `schedule_slots.role`): `C`, `1L`, `2L`, `L`, `P` — `src/shared/constants/roles.ts`. Na lista, **sempre abreviadas**.
- Gravar apenas pelo caminho existente `SaveScheduleBatch` / `saveScheduleBatch(entries, removed)` (com `expectedRevision` para concorrência).
- Sem push/merge em `main`, sem escrita em banco Production; sem DDL.

## 4. Abordagens consideradas

| | Abordagem | Trade-off |
|---|---|---|
| **A (escolhida)** | Algoritmo como **função pura no próprio app** (navegador do admin), usando dados já carregados | Sem banco novo, testável com dados sintéticos, resposta imediata; histórico passa pelo celular (insignificante com ~22 leitores) |
| B | Mesma lógica numa rota de servidor de admin | Mais peças (rota, checagem de admin, erros de rede) sem ganho real hoje; migração futura é simples |
| C | Dentro do Supabase (função SQL) | Exige migration e autorização específica; difícil testar e ajustar regras |

Escolha do usuário: **A**. O módulo deve ser puro e independente de React para poder migrar a B depois.

## 5. A página — telas e comportamento

Visual: **caderno** — linhas pautadas, margem esquerda com linha vermelha fina, **data (número + dia da semana) em destaque na margem**, sem cartões. Funções abreviadas (C, 1L, 2L, L, P).

### 5.1 Visão do mês (antes da lâmpada)
- Cabeçalho: voltar, seletor de mês (‹ Dezembro 2026 ›), resumo ("25 missas · 82 vagas · 22 leitores aptos"), links **"Criar Missas Padrões no mês"** e **"+ Missa"**.
- Lista: uma linha por missa: `data/dia · horário · funções abreviadas` (ex.: `19:00  C · L`; `09:00  C · 1L · 2L · P`) e descrição especial em âmbar abaixo quando houver. Data aparece só na 1ª missa do dia. Tocar na linha edita a missa.
- Rodapé fixo: "N vagas sem leitor" + botão **lâmpada** (64px, âmbar).

### 5.2 Criar Missas Padrões no mês
Um botão cria tudo de uma vez para o mês exibido:
- **Terça e Sexta, 19:00:** `C` + `L` (Leitura Única).
- **Domingo, 07:00 / 09:00 / 11:00 / 19:00:** `C`, `1L`, `2L`, `P`.
- **Pula horários que já existem** (sem duplicar). Admin ajusta exceções depois (ex.: Imaculada Conceição, Natal).

### 5.3 Definir/editar uma missa (bottom sheet)
Dia, horário (atalhos 07/09/11/19 + "Outro"), funções (checkboxes C, 1L, 2L, L, P — `L` substitui 1L/2L), descrição especial opcional, "Repetir em todos os domingos do mês". Funções já vêm marcadas pelo dia escolhido (semana: C+L; domingo: C+1L+2L+P). Reaproveitar `TimeRoller`/regras de conflito de horário do `ScheduleForm` onde fizer sentido.

### 5.4 Depois da lâmpada
Mesma folha, **uma linha por função**: `data (1ª linha do dia) · horário (1ª linha da missa) · função · nome · 👁 · 🔒`.
- Nome: tocar abre lista de leitores elegíveis para trocar à mão. **Troca manual trava a vaga automaticamente.**
- ⚠️ ao lado do nome = fora da preferência de dia/horário.
- Vaga sem candidato: "sem leitor · escolher" (vermelho tracejado).
- 👁: card flutuante com as escalas do leitor no mês (a missa atual marcada), contagem do mês vs. meta, função que mais faz, preferências e datas indisponíveis.
- 🔒: trava/destrava o leitor naquela vaga; vagas travadas não mudam em "Sugerir de novo" e contam no equilíbrio.
- Topo: resumo ("81 de 82 vagas preenchidas · 3 fora da preferência · 1 sem leitor"), link **Detalhar**, botão **Prévia** (WhatsApp), filtros em texto: Todas / Com aviso / Travadas.
- Rodapé: **Sugerir de novo** e **Salvar como rascunho**.

### 5.5 Detalhar (equilíbrio)
Lista por leitor: nome, função mais frequente, barra da contagem do mês vs. marca da meta, contagem, e uma nota explicando o motivo (acima/abaixo da meta, prioridade, indisponibilidade). Mostra **média mensal separando escaladas, trocas assumidas e passadas**.

### 5.6 Prévia por WhatsApp
Gera **texto** (não link — a sugestão só existe no aparelho de quem planeja) e abre `https://wa.me/?text=…`, no padrão do compartilhamento de escala já existente em `src/app/page.tsx`. Título "PRÉVIA – Escala de <Mês/Ano> (não publicada)", dias e missas, `C - Nome ⚠️`, vagas vazias `---`, legenda "⚠️ = fora da preferência do leitor". Sem dados pessoais além do nome (sem WhatsApp/e-mail).

## 6. Regras da lâmpada

**Elegibilidade (regras duras)**
1. Leitor ativo: **não arquivado** e **com conta vinculada** (`authUserId` presente). Sem conta ⇒ nunca sugerido, nem aparece na troca manual desta página.
2. **Indisponibilidade** (`unavailable_dates`) é regra fixa: nunca na data marcada.
3. Um leitor não ocupa duas funções na **mesma missa**.
4. Vagas **travadas** e missas já com leitor (inclusive de escala existente/publicada) não são alteradas.

**Preferência = prioridade, não proibição (escolha do usuário)**
- Preferências de dia/horário (`preferences.day_preferences`; Dom=`"6"`, Ter=`"2"`, Sex=`"5"`, via `preferredTimesForDate`) pontuam a favor. Sábado não tem preferência.
- Se faltar candidato com preferência, preenche com quem está **mais abaixo da meta** e marca ⚠️ "fora da preferência". Escala sai completa; admin decide caso a caso.
- Se **ninguém** está elegível pelas regras duras, a vaga fica vazia e destacada.

**Equilíbrio (meta mensal)**
- **Medida de cada leitor = leituras realizadas por mês** = escalas cumpridas + **trocas assumidas**. Vagas que o leitor **passou** para outro **não contam** para ele (decisão do usuário: conta quem serviu de fato). Todo mês entra na média, **inclusive meses com indisponibilidade** (o que importa é quantas leituras fez).
- **Média móvel dos últimos 3 meses** (ou desde a entrada do leitor, se mais novo; ex.: entrou há 1 mês e serviu 3 ⇒ média 3, não 1). Histórico total (ex.: "30 leituras") é irrelevante.
- **Novato sem histórico entra na média do grupo** (considerado "na meta"); não recebe enxurrada para alcançar os antigos.
- **Meta do mês** ≈ vagas do mês ÷ leitores elegíveis. A lâmpada só passa da meta de alguém quando não há outra saída; quem está abaixo da média ganha prioridade, quem lê muito (trocas assumidas) recebe um pouco menos.
- Trocas só existem após publicação ⇒ entram pelo **histórico dos meses anteriores**; no mês em planejamento ainda não há trocas.

**Afinidade por função**: proporção de vezes que o leitor fez cada função nos **últimos 12 meses** (ex.: 14× Comentarista ⇒ tende a C). É preferência, não proibição; se faltar, outro assume.

**Distribuição**: evitar a mesma pessoa em duas missas no mesmo dia e em fins de semana seguidos, quando houver opção.

**Algoritmo (sugestão)**: (1) ordenar vagas da mais restrita para a menos restrita (menos candidatos primeiro, ex.: Terça); (2) para cada vaga, pontuar candidatos (déficit de média, preferência de dia/horário, afinidade de função, penalidade por repetição); (3) escolher a melhor nota; (4) **rodada de melhoria**: trocas entre pares para reduzir desvio da meta, sem quebrar regras duras nem mexer em travadas; (5) registrar o **motivo** de cada escolha (alimenta 👁 e Detalhar). Desempate determinístico (ex.: nome) para resultado reproduzível nos testes.

## 7. Relação com a escala existente (decisão do usuário)

O Planejamento é **outra visão do mesmo mês**, não um rascunho paralelo:
- Missas já existentes aparecem na página; leitores já escalados contam como **travados**.
- A lâmpada preenche **só vagas vazias**.
- Em mês **já publicado**, nunca troca quem já foi escalado/avisado; só preenche vazios.
- "Criar Missas Padrões" não duplica missas existentes.
- Nada é gravado até **Salvar como rascunho**, que grava via `saveScheduleBatch` como não publicado (`isPublished: false`), respeitando `expectedRevision`. Publicar permanece no fluxo atual. Em rascunho salvo e reaberto, as vagas já preenchidas contam como travadas (o admin destrava o que quiser refazer).

## 8. Dados usados (todos já existem)

`profiles` (arquivado, conta vinculada, `preferences.day_preferences`), `schedule`/`schedule_slots` (histórico, `original_profile_id` ⇒ troca assumida/passada, confirmações), `unavailable_dates`. Nenhuma tabela/coluna nova. Os repositórios existentes (ex.: listagem de perfis, `makeGetProfilesUsage`, `makeListUnavailableByDate`, `makeListSchedulesForMonth`) cobrem parte; o builder deve confirmar se o histórico de 12 meses e as trocas por leitor exigem um novo método de **leitura** (sem alterar schema).

## 9. Decisões já tomadas (resumo)

Preferência = prioridade (⚠️ + editável); sem conta ⇒ não escalar; mesmo mês (sem rascunho paralelo); trava automática ao editar à mão; "Sugerir de novo" preserva travados; conta quem serviu de fato (passar a vaga não conta); média de 3 meses, novato entra na média, todo mês conta; função por 12 meses; compartilhar prévia por texto no WhatsApp; botão "Criar Missas Padrões no mês"; link "Detalhar"; lista estilo caderno com funções abreviadas; algoritmo no app (abordagem A).

## 10. Deixado ao builder

Pesos exatos da pontuação e critério de parada da rodada de melhoria; estrutura de arquivos dentro das camadas existentes; componentes de UI e animações; textos de erro; formato exato do card 👁; paginação/virtualização da lista; método de leitura para o histórico (se necessário); testes: unitários do algoritmo com dados sintéticos (indisponibilidade, preferência, trava, novato, trocas assumidas/passadas, vaga sem candidato, determinismo) e teste de acesso admin; validação proporcional conforme `AGENTS.md` (TypeScript, lint, testes direcionados, build antes de homologar). Entrega em branch de feature; funcionalidade nova segue PR com prints para aprovação antes de `preview`; Production só com "Enviar para produção".

## 11. Notas da revisão do construtor

**Fato do código:** publicar é **por missa/dia** (`masses.is_published`, alternado pelo `onTogglePublish` do card do dia), e os lembretes automáticos (`api/cron/reminders`) só consideram missas publicadas. Não existe "mês publicado" como estado único.

**Chamadas minhas (marcadas como minhas):**
- Meta é fracionária; a lâmpada trabalha com a meta exata e mostra "3 a 4" arredondada na tela.
- Missa sem nenhum leitor elegível: vagas ficam vazias, a lâmpada segue com as demais.
- Mês sem histórico algum (primeiro uso): todos entram na média do grupo; só preferência e afinidade (que também pode estar vazia) decidem.
- Missas publicadas aparecem na lista com um indicador discreto de "publicada".

**Pendente do usuário:** quando uma missa **já está publicada** e tem vaga vazia, o Planejamento preenche essa vaga? Gravar ali torna o leitor visível e sujeito a lembrete **na hora**, sem passar por rascunho. Ver resposta registrada abaixo.

Resposta: _(aguardando)_
