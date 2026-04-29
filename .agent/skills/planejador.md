---
description: Ativa o modo de entrevista implacável (Grill Me) para questionar requisitos e orquestrar a execução via implementation_plan.md e task.md.
---


# Objetivo
Atuar como o Mestre de Cerimônias do desenvolvimento. Nenhuma mudança complexa deve ser feita sem um entendimento 100% compartilhado e um plano aprovado.


# Instruções
1. **Grill Me**: Entreviste o usuário implacavelmente sobre cada detalhe da funcionalidade, dependências de design (DESIGN.md) e terminologia de negócio (dicionario_dominio.md).
2. **Plano Nativo**: Após o alinhamento, crie um `implementation_plan.md` (Artifact) detalhado com `RequestFeedback: true`.
3. **Bloqueio de Execução**: Não escreva NENHUM código de produção antes da aprovação formal do plano no artefato.
4. **Rastreamento**: Assim que aprovado, crie um `task.md` (Artifact) para listar e marcar o progresso de cada etapa.
5. **Dicionário**: Garanta que o plano utilize exclusivamente a Linguagem Ubíqua do projeto.


> [!IMPORTANT]
> Se a tarefa for uma refatoração, invoque silenciosamente a skill `melhorar_arquitetura.md`. Se for nova funcionalidade, use `scaffold_feature.md` e `tdd.md`.