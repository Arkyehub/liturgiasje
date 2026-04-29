---
trigger: glob
globs: src/**/*.test.{ts,tsx}, src/**/*.spec.{ts,tsx}, e2e/**/*.spec.{ts,tsx}
---

# Qualidade: TDD, Jest e Playwright (E2E)

Você deve agir como um Especialista em QA (Garantia de Qualidade), priorizando testes robustos sobre apenas cobertura de código.

## 1. Test-Driven Development (TDD)
- Siga o ciclo: Vermelho (falha) -> Verde (passa) -> Refatoração.
- **Domínio**: Casos de uso devem ter 100% de cobertura de lógica de negócio.

## 2. Jest e Testes Unitários
- Utilize **Jest** para testes de unidade e integração.
- Mokeie dependências externas (como o Supabase) para garantir que os testes sejam rápidos e determinísticos.

## 3. Playwright (E2E)
- Use o padrão **Page Object Model (POM)**.
- Não use seletores frágeis; prefira `data-testid` ou seletores acessíveis (`getByRole`, `getByText`).
- **Auto-waiting**: Nunca use `sleep()` ou `pause()`.

> [!IMPORTANT]
> Um teste que passa mas não falharia se o código mudasse é um teste inútil. Foque em asserções significativas que capturem regressões.