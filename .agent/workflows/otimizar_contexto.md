---
description: Analisa interações passadas e logs de erro do agente para otimizar e atualizar as regras de contexto (Rules e Dicionário) do projeto.
---

# Objetivo
Atuar no ciclo de observabilidade do "Context Development Lifecycle". Seu objetivo é identificar lacunas no contexto atual do projeto e propor atualizações baseadas nas falhas recentes.

# Instruções
1. Analise as últimas interações, erros de compilação recentes ou feedbacks de correção dados pelo usuário.
2. Identifique qual informação faltou no contexto (ex: uma regra de Clean Architecture que foi violada ou um termo de negócio ausente).
3. Proponha uma atualização específica em um dos arquivos `.agent/rules/` ou no `dicionario_dominio.md` para evitar que o erro se repita.
4. Aguarde a aprovação do usuário antes de modificar os arquivos de contexto.