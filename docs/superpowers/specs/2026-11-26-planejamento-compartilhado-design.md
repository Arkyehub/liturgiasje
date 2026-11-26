# Planejamento compartilhado — design

Data: 2026-11-26 · Status: aguardando aprovação · Estende: `docs/superpowers/specs/2026-11-26-planejamento-escala-design.md` (página `/admin/planejamento`, já em `preview`).

## 1. Intenção

Hoje o planejamento vive só no navegador de quem o criou e nada é gravado até "Salvar como rascunho". Os coordenadores querem **montar a escala em turnos, cada um no seu celular, vendo o mesmo planejamento**: quem criou, quem editou por último e há quanto tempo; e, enquanto um edita, o outro **só pode ver**, com a indicação "Somente Leitura".

Por quê: a escala é feita com um mês de antecedência por mais de uma pessoa; sem isso, o trabalho se perde ao fechar o app e um coordenador não enxerga o que o outro fez.

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
- O planejamento do mês fica no servidor e é **gravado a cada alteração** (lâmpada, cadeado, troca de leitor, criar/editar/remover missa, decisão sobre missas publicadas).
- Cada planejamento mostra **criado por**, **editado por** e **há quanto tempo**.
- **Uma pessoa edita por vez** (reserva). Quem chega depois abre em **Somente Leitura** (escrito na tela) e vê as mudanças do outro sem precisar reabrir.
- A reserva **expira sozinha** se o aparelho some (bateria, aba fechada).

**Não-objetivos**
- Edição simultânea e mesclagem de mudanças; tempo real (Realtime).
- "Assumir à força" a edição (só expiração e fechamento resolvem).
- Histórico/versões do planejamento; comentários; notificações push entre coordenadores.
- Mudar o que "Salvar como rascunho" faz (continua o único passo que cria/atualiza missas reais).

**Anti-objetivos (falha mesmo funcionando)**
- Um aparelho antigo ou "esquecido" sobrescrever o trabalho de outro.
- Perder alteração sem avisar (falha de gravação precisa ser visível e travar novas edições).
- A sugestão não confirmada alterar missas reais, despublicar missas ou gerar notificações antes de "Salvar como rascunho".
- Um planejamento preso para sempre por uma reserva que não expira.

## 3. Restrições

- **Muda o banco**: tabela nova + funções no servidor. Migration em arquivo `migration_planejamento_compartilhado.sql` + `..._rollback.sql` na raiz, no padrão dos existentes. Preview: autorizado pelo usuário em 26/11/2026 ("pode fazer, tem permissão") — aplicar só depois de testar em ambiente isolado e conferir compatibilidade com o schema real. **Production: nenhuma migration sem autorização específica e plano de recuperação.** Nunca misturar migration com push sem verificar se há automação que a aplique (AGENTS.md).
- Padrão de segurança do projeto: funções `SECURITY DEFINER`, `search_path` fixo, checagem `public.is_admin()`, `REVOKE ALL … FROM PUBLIC, anon`, `GRANT EXECUTE … TO authenticated`, RLS ligado e **sem acesso direto à tabela** (tudo por funções), como `save_schedule_batch`.
- Cliente: Next.js 16 / React 19; o app não usa Realtime hoje e não vai usar. Mobile-first, pt-BR, estilo caderno já existente.
- Production não tem `schedule_slots.original_profile_id` (irrelevante aqui, mas não pode ser pressuposto).
- Validação conforme AGENTS.md: testes SQL no padrão de `tests/database/`, testes Jest, `tsc`, lint, build.

## 4. Abordagens consideradas

1. **Um documento por mês + reserva com sinal (escolhida).** Tabela com uma linha por mês guarda o planejamento inteiro (JSON), criado/editado por, revisão e a reserva (quem, qual aparelho, último sinal). Funções no servidor conferem reserva e revisão a cada gravação. Leitores em Somente Leitura atualizam por consulta periódica. Simples, suficiente para turnos.
2. **Idem com tempo real (Realtime).** Mudança aparece na hora, mas é mecanismo novo para o app, com configuração e políticas próprias, e quase nada ganha em trabalho por turnos.
3. **Gravar direto nas missas de rascunho existentes.** Sem tabela do planejamento, mas cada toque criaria/alteraria missas reais (despublica as publicadas na hora, poluiria o histórico de atribuições). Contraria o desenho aprovado. Descartada.

O usuário aprovou a **1**.

## 5. Design

### 5.1 Dados
Tabela `schedule_plans` (uma linha por mês): `month_reference` (yyyy-MM, único), `state` (jsonb: o documento do planejamento — missas com vagas, travas, avisos/motivos, fase "sugerido", decisão sobre publicadas, missas removidas; **não** guarda leitores, médias nem indisponibilidades, que são recalculados ao abrir), `status` (`em_andamento` | `concluido`), `revision` (bigint, +1 a cada gravação), `created_by`/`created_at`, `updated_by`/`updated_at` (ids de perfil; nomes vêm de `profiles.full_name`), `concluded_by`/`concluded_at`, e a reserva: `lock_profile_id`, `lock_session_id` (texto aleatório por aparelho/aba), `lock_heartbeat_at`. Limite de tamanho do `state` (ex.: 512 KB) validado no servidor.

### 5.2 Reserva
- Dona da reserva = (coordenador + `session_id`). **Dois aparelhos do mesmo coordenador também se excluem.**
- Válida por **120 s** sem sinal; o aparelho aberto manda sinal a cada **30 s** (e ao voltar para a aba).
- Liberada ao sair/fechar (melhor esforço) e ao concluir; a expiração é a rede de segurança.
- Quem não consegue reservar abre em Somente Leitura e vê quem está com a reserva e o último sinal.

### 5.3 Funções no servidor (todas só para admin)
`plan_list(months)` (até 12 meses por chamada; status, criado/editado por e quando, reserva viva) · `plan_open(month, session_id)` (abrir = pedir para editar: cria a linha se não existir — quem abre primeiro vira "criado por" —, tenta reservar, devolve plano + modo `edit`/`readonly` + dono da reserva; recusa abrir mês `concluido`, que exige `plan_reopen`) · `plan_save(month, session_id, request_id, expected_revision, state)` (só se for o dono vivo da reserva **e** a revisão bater; incrementa revisão, atualiza editado por/em e renova a reserva; se o mesmo `request_id` já foi aplicado devolve sucesso sem aplicar de novo, para repetir com segurança após falha de rede; erros distintos: reserva perdida, conflito de revisão, plano concluído) · `plan_reopen(month, session_id)` (único jeito de reabrir um mês `concluido`: zera o estado, volta a `em_andamento`, limpa `concluded_*`, o autor passa a ser quem reabriu e já fica com a reserva) · `plan_heartbeat(month, session_id)` · `plan_release(month, session_id)` · `plan_get(month)` (leitura para Somente Leitura; nunca cria linha nem reserva; sem linha devolve vazio) · `plan_conclude(month, session_id)` (após "Salvar como rascunho" com sucesso: `concluido`, libera a reserva).

### 5.4 Comportamento no app
- **Escolha do mês** mostra, por mês: "Sem planejamento" · "Em andamento · criado por X · editado por Y há Z" · "Concluído · por X em dd/MM" · e "Em edição agora por Y" quando há reserva viva.
- **Abrir como editor:** estado vem do servidor se houver `state`; senão parte das missas reais, como hoje. **Cada ação grava na hora**: gravações em fila (uma por vez, sempre a mais recente), sem perder a ordem.
- **Indicador no topo:** "Salvando…" / "Salvo" / "Falhou — tentar de novo". Se falhar, novas edições ficam bloqueadas até resolver.
- **Reserva perdida** (ficou ~2 min sem sinal e outro assumiu) ou **conflito de revisão:** o aparelho vira Somente Leitura com aviso e mostra o estado atual do servidor.
- **Somente Leitura:** faixa fixa "SOMENTE LEITURA — <nome> está editando · última alteração há X"; lâmpada, "+ Missa", "Criar Missas Padrões", troca de leitor, cadeado, salvar e decisão sobre publicadas ficam desativados; as setas de mês continuam. Atualiza sozinho a cada ~20 s (só re-renderiza se a revisão mudou). Quando a reserva fica livre, aparece "Editar" para tentar assumir.
- **Concluir:** "Salvar como rascunho" continua igual; ao dar certo, chama `plan_conclude`. **Reabrir um mês concluído** reinicia o planejamento a partir das missas reais (a mesma linha é reaproveitada: estado vazio, novo autor, `em_andamento`).
- **Substitui** a confirmação ao trocar de mês e o aviso ao sair da página (não há mais trabalho não gravado), mantendo: esperar gravação pendente antes de trocar de mês.
- O resto da página (lâmpada, regras, missas publicadas, salvar, prévia) não muda.

### 5.5 Segurança e falhas
Tudo por funções com `is_admin()`; sem política de acesso direto; `session_id` é só identificador de aparelho, não segredo; erros devolvem códigos estáveis que o app converte em mensagens em pt-BR; `plan_save` nunca altera missas reais.

### 5.6 Regras de borda (resolvidas na revisão do desenho)
- **Missas reais mudam por fora enquanto o planejamento está guardado** (troca pedida, leitor que se desvinculou, missa publicada/apagada pela tela de Escala): ao abrir como editor o app **reconcilia** o estado guardado com as missas reais. Para cada missa com `id`: se a revisão real é diferente da guardada, **vale a versão real** (as edições do planejamento nessa missa são descartadas) e o app mostra "A escala mudou fora do planejamento: <datas>"; missa real que sumiu sai do plano com o mesmo aviso; missa real nova entra como no carregamento normal. Indisponibilidades e leitores arquivados são recalculados (vaga de leitor arquivado continua visível e travada, como hoje). Assim um `id`/revisão velho nunca é usado para gravar, e "Salvar como rascunho" continua protegido pelo `expectedRevision` de sempre.
- **Abrir = reservar.** Quem só quer olhar um mês com reserva viva de outro já cai em Somente Leitura; quem abre um mês livre reserva e, se não havia linha, vira "criado por" (mesmo sem editar nada; o mês aparece "Aberto por X, sem alterações"). Ver sem reservar só existe para quem encontrou a reserva ocupada.
- **Mês concluído** não abre direto: a escolha do mês mostra "Concluído por X em dd/MM" e um botão explícito **Reabrir planejamento** (`plan_reopen`). Abrir sem querer nunca apaga o estado.
- **"Salvar como rascunho" e `plan_conclude`** são duas chamadas: se o lote real foi gravado e `plan_conclude` falha (ou a aba fecha), o app tenta de novo algumas vezes; se mesmo assim ficar `em_andamento`, a reconciliação acima faz o próximo abrir descartar o estado antigo (as missas reais já são a verdade). Depois de salvar, a tela recarrega das missas reais.
- **Falha de rede ao gravar:** repetição automática (até 3 tentativas, ~2 s e ~5 s) com o mesmo `request_id`; depois mostra "Falhou — tentar de novo" e trava edições. Se a reserva foi perdida (aparelho dormiu mais de ~2 min e outro assumiu), as alterações ainda não gravadas **não são aplicadas** e o app diz quantas ficaram de fora, em vez de falhar em silêncio.
- **Gravação é substituição do documento inteiro**; juntar gravações pendentes em uma só (sempre a mais recente, com revisão esperada em sequência) e renovar a reserva a cada gravação é intencional.
- **Atualizar a página** (F5) na mesma aba retoma a própria reserva: `session_id` fica no `sessionStorage` da aba; outra aba ou outro aparelho, mesmo do mesmo coordenador, continua excluído.
- **Quem é quem:** coordenador = perfil com `role = 'admin'` e ativo; todos os admins veem todos os meses; o dono da reserva e os autores são `profiles.id`, obtido de `auth.uid()` via `profiles.auth_user_id`; as colunas apontam para `profiles(id)` com `ON DELETE SET NULL`; perfil arquivado continua resolvendo o nome.

## 6. Decisões do usuário
Planejamento no servidor; um coordenador por vez com aviso "aberto em outro aparelho"; quem chega depois **vê em Somente Leitura**, escrito na tela, sem poder alterar; **gravar a cada alteração** (cadeado, trocar função, criar missa → na hora); mostrar criado por / editado por e há quanto tempo.

## 7. Minhas chamadas (para conferir)
Abordagem 1; reserva 120 s com sinal de 30 s; dois aparelhos do mesmo coordenador também se excluem; Somente Leitura atualiza a cada ~20 s; ao concluir o planejamento fica "Concluído" e reabrir recomeça das missas reais; sem "assumir à força"; indicador Salvando/Salvo/Falhou e bloqueio em falha; troca de mês espera a gravação pendente em vez de pedir confirmação; reconciliação com as missas reais ao abrir (versão real vence por missa, com aviso); abrir já reserva; reabrir mês concluído só por botão explícito; repetição segura de gravação com `request_id`; `session_id` no `sessionStorage`; coordenador = admin ativo; 12 meses por listagem.

## 8. Deixado ao builder
Nomes de colunas/funções e códigos de erro exatos; formato do JSON do `state` (derivar de `PlanMass`); como liberar a reserva ao fechar (ex.: `pagehide` + chamada leve); estratégia de fila/coalescência das gravações; intervalo exato de polling; chave do advisory lock (não bloquear `save_schedule_batch` desnecessariamente); testes SQL (reservar, expirar, assumir após expirar, gravar sem reserva é recusado, conflito de revisão, não-admin recusado, concorrência) e testes Jest (fila, indicador, Somente Leitura, sinal, polling); como o app se comporta se as funções ainda não existirem no banco do ambiente (mensagem "indisponível", sem erro bruto); plano de recuperação da migration (rollback).
