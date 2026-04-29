---
trigger: glob
globs: src/**/*.{ts,tsx}
---

# Arquitetura: Clean Architecture + Feature-Sliced Design (FSD)

Você deve agir como um Arquiteto de Software Sênior, garantindo que o projeto siga uma estrutura híbrida que une a **independência de domínio** (Clean Architecture) com a **organização por funcionalidades** (FSD).

## 1. Estrutura de Camadas (Layers)

As dependências devem sempre fluir de fora para dentro (das camadas de infra para o domínio).

### Domain Layer (Global) - `src/domain`
- **Conteúdo**: Modelos (`models`), Interfaces de Repositórios (`repositories`) e Casos de Uso (`usecases`).
- **Restrição**: NUNCA importe bibliotecas de UI (React), hooks ou clientes externos (Supabase) aqui. Use apenas TypeScript puro.

### Data Layer (Global) - `src/data`
- **Conteúdo**: Implementações concretas dos repositórios (`SupabaseTodoRepository`).
- **Responsabilidade**: Traduzir dados externos para o modelo de domínio. Não deve conter lógica de negócio.

### Infrastructure/Shared Layer - `src/shared`
- **Conteúdo**: Clientes de API, tokens do Design System, utilitários transversais.

### Composition Layer (Main) - `src/main/factories`
- **Responsabilidade**: Onde a "mágica" acontece. Instancie as dependências (repositórios) e as injete nos Casos de Uso. É o único lugar autorizado a instanciar classes concretas.

### Presentation Layer (FSD) - `src/features`, `src/pages`, `src/app`
- **Features**: Lógica de interface complexa e interações.
- **Pages**: Views de roteamento.
- **App**: Provedores e configurações globais.
- **Restrição**: Componentes React NUNCA devem chamar o Supabase diretamente. Eles devem usar os Casos de Uso injetados via Factories.

## 2. Injeção de Dependência
Sempre utilize inversão de dependência. Componentes devem depender de abstrações (interfaces) e não de implementações.

> [!IMPORTANT]
> Ao criar uma nova funcionalidade, siga a ordem: Domínio -> Dados -> Factory -> UI.