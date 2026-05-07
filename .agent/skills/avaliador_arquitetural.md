---
description: Atua como um juiz arquitetural (LLM as a judge) para avaliar se o código gerado ou modificado respeita estritamente a Arquitetura Limpa e o FSD do projeto.
---

# Objetivo
Auditar o código recém-escrito e impedir a entropia de software. Você deve julgar o código comparando-o rigorosamente com as regras do projeto (ex: 01-architecture-clean-fsd.md).

# Instruções
1. Analise os arquivos criados ou modificados na última interação.
2. Busque ativamente por violações de arquitetura:
   - A camada de Domínio (`src/domain/`) importa algo de UI (React) ou bibliotecas externas como Supabase? (Deve falhar se sim).
   - A interface de usuário acessa o banco de dados diretamente em vez de injetar Casos de Uso através de Factories? (Deve falhar se sim).
3. Gere um relatório de conformidade claro (Passou/Falhou).
4. Se houver falha arquitetural, explique o motivo e exija a refatoração imediata antes de prosseguir.