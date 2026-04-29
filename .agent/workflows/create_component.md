---
description: Cria um novo componente React seguindo o Design System e os padrões de teste do projeto.
---

# Fluxo de Criação de Componente

1. **Localização**: Identifique em qual camada do FSD o componente deve ficar (`shared/ui`, `entities`, `features`).
2. **Design System**: Consulte o `DESIGN.md` para identificar as cores, fontes e classes utilitárias.
3. **Estrutura**:
   - Crie `ComponentName/index.tsx` para o código.
   - Crie `ComponentName/styles.css` para estilos específicos (seguindo tokens).
   - Crie `ComponentName/ComponentName.test.tsx`.
4. **Testes (TDD)**: Escreva testes usando **Vitest** e React Testing Library, focando no comportamento esperado pelo usuário.
5. **Estilo**: Use as classes semânticas globais (ex: `.title-brand`, `.industrial-button`) sempre que possível.
6. **Export**: Garanta que o componente seja exportado através da Public API do slice (`index.ts`).