---
description: Cria a estrutura de uma nova funcionalidade (Slice) seguindo o padrão Clean FSD (Feature-Sliced Design + Clean Architecture).
---


# Objetivo
Padronizar a criação de fatias verticais de negócio, garantindo isolamento e uma API pública limpa.


# Instruções
1. **Definição**: Pergunte o nome do slice (Linguagem Ubíqua) e o nível (features, entities ou pages).
2. **Estrutura de Pastas**: Crie a pasta em `src/[camada]/[nome]`.
3. **Segmentos Internos**:
   - `ui/`: Componentes React e estilos.
   - `model/`: Lógica de estado local e tipos específicos.
   - `api/`: Pontos de entrada para dados (repositórios/serviços).
4. **Clean Integration**: Se houver lógica de negócio complexa, crie os arquivos correspondentes em `src/domain` e `src/data` e vincule-os via **Factory** em `src/main/factories`.
5. **Public API**: Crie um `index.ts` que exporta APENAS o necessário para o restante do app.
6. **Design**: Garante que os componentes `ui/` sigam o `DESIGN.md`.


> [!IMPORTANT]
> Verifique sempre o `dicionario_dominio.md` antes de nomear pastas e arquivos do scaffold.