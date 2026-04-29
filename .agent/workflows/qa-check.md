---
description: Executa todas as checagens de qualidade antes de um Pull Request.
---

# Fluxo de QA Automatizado

// turbo-all
1. **Linting**: Execute `npm run lint` para garantir o estilo do código. // parallel
2. **Types**: Execute `npm run type-check` (ou `tsc --noEmit`) para validar o TypeScript. // parallel
3. **Tests**: Execute `npm run test` (Vitest) para garantir que nenhuma funcionalidade quebrou. // parallel
4. **Relatório**: Colete as saídas e apresente um resumo. 
5. **Aprovação**: Se tudo passar, confirme que o código está pronto para ser enviado.

> [!TIP]
> Use este workflow antes de qualquer entrega para garantir a integridade do projeto.