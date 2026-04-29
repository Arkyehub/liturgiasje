---
description: Aplica o ciclo Red-Green-Refactor, garantindo qualidade e testabilidade via Vitest ou Jest.
---


# Objetivo
Desenvolver código de alta confiança através de passos curtos, evitando bugs e excesso de engenharia.


# Instruções
1. **Checagem de Ambiente**: Antes de começar, verifique se o projeto possui um runner de testes configurado (Vitest ou Jest). Se não houver, sugira a instalação.
2. **Red**: Escreva um teste unitário que falhe para a menor parte possível da lógica de negócio.
3. **Green**: Escreva o código de produção mínimo para fazer o teste passar.
4. **Refactor**: Melhore o código mantendo o teste passando.
5. **Dicionário**: Use termos da Linguagem Ubíqua para descrever os casos de teste (`it('should...', ...)`).
6. **Mocks**: Utilize mocks para isolar o domínio de dependências externas (bancos, APIs).


> [!TIP]
> Em Clean Architecture, foque o TDD nos Casos de Uso (`src/domain/usecases`).