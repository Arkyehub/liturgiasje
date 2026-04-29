---
trigger: glob
globs: src/**/*.{tsx,css}
---

# Design System: Conformidade com Fonte de Verdade

Esta regra garante que toda alteração visual siga rigorosamente o sistema de design definido para o projeto, sem introduzir estilos ad-hoc.

## 1. Fonte de Verdade (`DESIGN.md`)
O arquivo `DESIGN.md` na raiz do projeto é a autoridade máxima sobre a identidade visual. Antes de criar ou modificar qualquer componente ou estilo CSS, você DEVE:
1. Ler o `DESIGN.md`.
2. Identificar os tokens de design (cores, tipografia, sombras, espaçamentos).
3. Aplicar exclusivamente os valores definidos nesses tokens.

## 2. Princípios de Estilização
- **Tokens sobre Valores**: Nunca utilize valores "hardcoded" (ex: hexadecimais, pixels) que não estejam mapeados como tokens no `DESIGN.md`.
- **Classes Utilitárias**: Utilize as classes utilitárias e componentes pré-definidos que implementam o sistema de design em vez de criar novos estilos manuais.
- **Consistência**: Se um novo elemento for necessário, ele deve ser derivado logicamente dos princípios de design estabelecidos (ex: seguindo a mesma escala de cores ou raio de borda).

## 3. Restrição Absoluta
É proibido utilizar cores, fontes ou estilos que entrem em conflito com a identidade visual do projeto. Se o `DESIGN.md` define uma paleta "Dark", não introduza elementos "Light" sem autorização explícita ou atualização do arquivo de design.

> [!IMPORTANT]
> Se você encontrar inconsistências entre o código e o `DESIGN.md`, priorize sempre o que está no `DESIGN.md` e sugira a correção no código.