# Planejamentos por coordenador — design (v2)

Data: 2026-11-26 · Status: aguardando aprovação · Estende: `docs/superpowers/specs/2026-11-26-planejamento-escala-design.md` (página `/admin/planejamento`, já em `preview`). Esta versão substitui a v1 ("um planejamento compartilhado por mês").

## 1. Intenção

Hoje o planejamento vive só no navegador de quem o criou e nada é gravado até "Salvar como rascunho". Os coordenadores querem:
- que o planejamento fique **no servidor e seja gravado a cada alteração**, para não perder trabalho e poder continuar em outro aparelho;
- que **cada admin tenha o seu planejamento do mês** (vários admins podem ter um para o mesmo mês, mas **só um por admin**), mostrando **criado por / editado por e há quanto tempo**;
- que **o planejamento de outro admin seja visto só em leitura** ("Somente Leitura", escrito na tela) e possa ser **copiado** para o planejamento do próprio admin, que então edita o dele;
- que **escalas já publicadas nunca sejam feridas**: um admin faz metade do mês e publica, outro faz o resto e publica;
- que os planejamentos **vençam em 30 dias** e sejam apagados do servidor.

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
- Tabela de planejamentos: no máximo **1 por admin por mês**; vários admins podem ter o seu para o mesmo mês.
- Gravação a cada alteração (lâmpada, cadeado, troca de leitor, criar/editar/remover missa).
- **Somente o dono edita.** Outros admins abrem em Somente Leitura e podem "Duplicar para mim".
- O próprio dono em **dois aparelhos ao mesmo tempo** é impedido por uma reserva ("aberto em outro aparelho"), que expira sozinha.
- **Validade de 30 dias** desde a última alteração; vencidos são apagados; a tela avisa "expira em X dias".
- Missas publicadas aparecem **somente leitura** com alerta; para mexer nelas é preciso despublicá-las fora do planejamento (tela de Escala).
- **Só uma versão vira escala real:** "Salvar como rascunho" avisa e, se confirmado, **substitui** o rascunho que já existia no mês.

**Não-objetivos**
- Editar o planejamento de outro admin; edição simultânea; mesclagem; tempo real (Realtime); "assumir à força" a reserva.
- **Despublicar missas a partir do planejamento** (a opção "incluir publicadas e voltar a rascunho" da v1 **sai**).
- Histórico/versões do planejamento; comentários; notificações.

**Anti-objetivos (falha mesmo funcionando)**
- O planejamento alterar, despublicar ou notificar sobre missas publicadas.
- Sobrescrever um rascunho existente sem avisar exatamente o que será substituído.
- Um aparelho antigo sobrescrever o trabalho do mesmo dono; perder alteração sem aviso.
- Apagar por validade um planejamento que está sendo usado; reserva presa para sempre.

## 3. Restrições

- **Muda o banco**: tabela nova + funções no servidor, em `migration_planejamento_compartilhado.sql` + `..._rollback.sql` na raiz. Preview (projeto Supabase "Liturgia SJE (preview)"): autorizado pelo usuário em 26/11/2026; o teste isolado antes disso usa um branch do Supabase ou banco local, à escolha do builder; aplicar só depois de testar em ambiente isolado e conferir compatibilidade com o schema real. **Production: nenhuma migration sem autorização específica e plano de recuperação.** Nunca misturar migration com push sem verificar se há automação que a aplique (AGENTS.md).
- Padrão de segurança do projeto: `SECURITY DEFINER`, `search_path` fixo, `public.is_admin()`, `REVOKE ALL … FROM PUBLIC, anon`, `GRANT EXECUTE … TO authenticated`, RLS ligado e **sem acesso direto à tabela** (tudo por funções), como `save_schedule_batch`.
- **Sem rotina agendada nova:** a limpeza dos vencidos acontece nas próprias funções (ao listar/abrir).
- Next.js 16 / React 19; sem Realtime; mobile-first, pt-BR, estilo caderno existente.
- Production não tem `schedule_slots.original_profile_id` (não pressupor).

## 4. Abordagens consideradas

1. **Um documento por (admin, mês) + reserva com sinal (escolhida).** Tabela com uma linha por planejamento: dono, mês, estado (JSON), revisão, validade e a reserva. Funções no servidor conferem dono, reserva e revisão a cada gravação. Somente Leitura de planejamentos alheios por consulta periódica.
2. **O mesmo com tempo real.** Mais complexo (mecanismo que o app nunca usou) e sem ganho em trabalho por turnos/cópia. Descartada.
3. **Gravar direto nas missas de rascunho existentes.** Cada toque alteraria missas reais; contraria o desenho aprovado. Descartada.
4. **Planejamento único por mês com edição por turnos (v1).** Substituída pela escolha do usuário: um por admin + cópia.

## 5. Design

### 5.1 Dados
Tabela `schedule_plans`: `id`, `month_reference` (yyyy-MM), `owner_profile_id` (único junto com o mês), `state` (jsonb: apenas as missas **não publicadas** do planejamento, com vagas, travas, avisos/motivos, fase "sugerido" e missas removidas; **não** guarda missas publicadas, leitores, médias nem indisponibilidades — as publicadas e o resto são sempre tirados da realidade ao abrir), `status` (`em_andamento` | `concluido`), `revision`, `created_at`, `updated_at` (quem edita é sempre o dono), `expires_at` (= última alteração + 30 dias, renovado a cada gravação), `copied_from_owner_id` (opcional, para mostrar "copiado do planejamento de X"), `concluded_at`, e a reserva: `lock_session_id`, `lock_heartbeat_at`. Limite de tamanho do `state` (ex.: 512 KB) validado no servidor. Nomes vêm de `profiles.full_name` (perfil arquivado continua resolvendo).

### 5.2 Reserva (só do dono)
Vale para o dono em **outro aparelho/aba** (`session_id` por aba, no `sessionStorage`; atualizar a página retoma a própria reserva). 120 s sem sinal expira; sinal a cada 30 s. Quem só **vê** o planejamento de outro nunca reserva.

### 5.3 Funções no servidor (todas só para admin ativo)
- `plan_list(months)` — até 12 meses; para cada mês, **todos os planejamentos** (dono, status, criado/editado há, validade, "copiado de", se está aberto em outro aparelho) e se o chamador já tem o seu; **apaga os vencidos** antes de responder.
- `plan_open(month, session_id)` — abre/cria **o meu** planejamento do mês e reserva; recusa a edição se estiver `concluido` (exige `plan_reopen`) ou aberto em outro aparelho do mesmo dono (nesse caso devolve o planejamento para **leitura** e o último sinal).
- `plan_get(plan_id)` — leitura de qualquer planejamento (Somente Leitura); não reserva.
- `plan_copy(source_plan_id, session_id, overwrite)` — copia o estado de um planejamento (de outro admin) para o **meu** do mesmo mês (cria se não existir; se o meu já tem conteúdo, exige `overwrite = true`, que o app só envia após confirmação); registra "copiado de".
- `plan_save(plan_id, session_id, request_id, expected_revision, state)` — só o dono com reserva viva e revisão correta; incrementa revisão, renova reserva e validade; mesmo `request_id` repetido devolve sucesso sem reaplicar. Erros distintos: reserva perdida, conflito de revisão, concluído, vencido.
- `plan_heartbeat`, `plan_release`, `plan_conclude(plan_id)` (após "Salvar como rascunho"; **mantém o estado** para consulta e cópia), `plan_reopen(plan_id)` (volta a `em_andamento` **mantendo o estado**; a reconciliação com a realidade acontece ao abrir), `plan_discard(plan_id)` (o dono apaga o próprio planejamento para recomeçar).

### 5.4 Comportamento no app
- **Escolha do mês:** para cada mês, lista os planejamentos: "Meu planejamento · editado há 3 h · expira em 27 dias", "Maria · editado há 1 dia · expira em 29 dias [Ver] [Duplicar para mim]", ou "Criar meu planejamento". "Aberto em outro aparelho" aparece no próprio planejamento do dono.
- **Abrir o meu:** estado do servidor, reconciliado com as missas reais (5.6). **Cada ação grava na hora**, em fila, com indicador "Salvando… / Salvo / Falhou" (falha trava novas edições).
- **Abrir o de outro:** faixa fixa **"SOMENTE LEITURA — planejamento de <nome> · editado há X"**, todos os controles de edição desativados, atualização sozinha a cada ~20 s, botão **Duplicar para mim**. Se eu já tiver o meu do mês, pede confirmação ("isso substitui o seu planejamento de <mês>").
- **Missas publicadas no mês:** ao abrir (meu ou de outro), alerta único: "Já existem N missas publicadas em <Mês> (datas…). Elas não podem ser alteradas no planejamento. Para mexer nelas, transforme-as em rascunho na tela de Escala." As missas ficam visíveis, marcadas "publicada" e somente leitura. A lâmpada **conta** os leitores delas na carga e no espaçamento (já é assim) para balancear o restante. A decisão "incluir/manter" e a despublicação **saem** do planejamento.
- **Salvar como rascunho:** antes de gravar, o app compara com as missas reais do mês. A regra é **por data**: para cada data em que este planejamento tem missas, as **missas em rascunho** (não publicadas) dessa data que ele não contém ou que mudaram desde que foi aberto são substituídas pela versão do planejamento; rascunhos de datas em que o planejamento não tem missa **ficam intocados** (é o que permite a um admin cuidar de uma metade do mês e o outro da outra). Se houver algo a substituir, mostra: "Já existe uma escala em rascunho em <Mês> (N missas: datas…). Salvar vai **substituir** essas missas pelas deste planejamento nas datas <…>. Missas publicadas não serão tocadas." Só segue após confirmar; a substituição usa as revisões atuais para não falhar à toa. Nunca publica nem despublica. Ao dar certo, chama `plan_conclude` e recarrega das missas reais.
- **Validade:** o dono vê "expira em X dias" no planejamento; cada gravação renova 30 dias; planejamento `concluido` também vence em 30 dias.
- **Substitui** a confirmação ao trocar de mês e o aviso ao sair da página (não há trabalho não gravado); troca de mês espera a gravação pendente.

### 5.5 Segurança e falhas
Tudo por funções com `is_admin()`; sem política de acesso direto; só o dono grava no próprio planejamento (conferido no servidor); `session_id` é identificador de aparelho, não segredo; erros devolvem códigos estáveis convertidos em mensagens pt-BR; `plan_save` nunca altera missas reais.

### 5.6 Regras de borda
- **Reconciliação ao abrir o meu:** missas reais que mudaram por fora desde a última gravação (troca pedida, publicada/apagada, leitor arquivado): **vale a versão real** da missa (edições do planejamento nela são descartadas) com aviso "A escala mudou fora do planejamento: <datas>"; missa real nova entra normalmente; vagas de leitor arquivado continuam visíveis e travadas.
- **Mês concluído** só reabre por botão explícito **Reabrir** (`plan_reopen`); abrir sem querer nunca apaga.
- **`plan_conclude` falha** depois de salvar o rascunho: repetir algumas vezes; se persistir, a reconciliação do próximo abrir descarta o estado antigo.
- **Falha de rede:** até 3 repetições (~2 s, ~5 s) com o mesmo `request_id`; depois "Falhou — tentar de novo". Se a reserva foi perdida, as alterações não gravadas **não são aplicadas** e o app diz quantas ficaram de fora.
- **Gravação = documento inteiro**; juntar pendentes na mais recente é intencional.
- **Missas publicadas nunca ficam no `state`:** são injetadas da realidade a cada abertura (somente leitura, contadas na carga e no espaçamento da lâmpada). Se uma missa do `state` foi publicada por outra pessoa, passa a valer a versão real publicada e a edição do planejamento naquela data é descartada com aviso; se foi despublicada por fora, vale a versão real (rascunho editável).
- **"Duplicar para mim"** é uma cópia pura do `state` (travas e motivos incluídos); a reconciliação roda na primeira abertura: datas hoje publicadas vencem a cópia e são avisadas. Planejamentos `concluido` mantêm o estado, aparecem em "Ver" e podem ser copiados.
- **Mesmo dono em outro aparelho:** o segundo aparelho abre o **próprio** planejamento em Somente Leitura com "aberto em outro aparelho", e ganha "Editar" quando a reserva liberar.
- **Reserva perdida:** o app recarrega o estado do servidor em Somente Leitura (mostra quantas alterações ficaram de fora) e oferece "Editar"; conflito de revisão nunca é resolvido automaticamente.
- **Aba duplicada** pode herdar o `session_id` do `sessionStorage` e furar a reserva; é lacuna aceita, pois a checagem de revisão ainda impede perder alterações (a segunda gravação recebe conflito).
- **Quem é quem:** coordenador = perfil `role = 'admin'` ativo; todos os admins veem todos os planejamentos; dono = `profiles.id` obtido de `auth.uid()` via `profiles.auth_user_id`; FKs para `profiles(id)`.

## 6. Decisões do usuário
Planejamento no servidor e gravado a cada alteração; **um por admin por mês**, vários admins podem ter o seu no mesmo mês; **validade de 30 dias**, depois apagado; **só uma versão vira rascunho; a seguinte sobrescreve, com aviso**; planejamento de outro admin **só em leitura (escrito "Somente Leitura") e pode ser copiado**, cada um edita o seu; **alerta de escalas publicadas, datas não manipuláveis até virarem rascunho**, permitindo que um admin faça e publique metade do mês e outro o restante, sem ferir o publicado; mostrar criado por / editado por e há quanto tempo.

## 7. Minhas chamadas (para conferir)
Abordagem 1; validade conta da **última alteração** e renova a cada gravação; limpeza dos vencidos ao listar (sem rotina agendada); reserva só impede o **mesmo dono** em dois aparelhos (120 s, sinal 30 s); Somente Leitura atualiza a cada ~20 s; "Duplicar para mim" substitui o meu planejamento do mês só com confirmação; "copiado de X" aparece; dono pode **Descartar** o seu; a despublicação a partir do planejamento **foi removida** (consequência da regra "publicadas não podem ser manipuladas"); aviso de substituição lista as datas dos rascunhos que serão trocados; reconciliação ao abrir (versão real vence por missa); mês concluído reabre só por botão; repetição segura com `request_id`; `session_id` no `sessionStorage`; coordenador = admin ativo; 12 meses por listagem; **substituição de rascunho por data** (rascunhos de datas que o planejamento não cobre ficam intocados); publicadas nunca entram no `state`; cópia pura do `state` com reconciliação ao abrir; concluído mantém o estado e reabre sem apagar; segundo aparelho do mesmo dono abre em leitura; aba duplicada é lacuna aceita.

## 8. Deixado ao builder
Nomes de colunas/funções e códigos de erro; formato do JSON do `state` (derivar de `PlanMass`); como liberar a reserva ao fechar (ex.: `pagehide`); fila/coalescência das gravações; intervalo exato de polling; chave do advisory lock (não bloquear `save_schedule_batch` desnecessariamente); mecânica exata da comparação com as missas reais antes de salvar; testes SQL (reservar, expirar, dono vs. não dono, copiar com e sem `overwrite`, vencimento e limpeza, conflito de revisão, não-admin recusado, concorrência) e Jest (fila, indicador, Somente Leitura, cópia, alerta de publicadas, aviso de substituição, validade); como o app se comporta se as funções ainda não existirem no banco do ambiente (mensagem "indisponível", sem erro bruto); remoção do fluxo "incluir publicadas/despublicar" e dos testes que o fixam; migration de rollback.
