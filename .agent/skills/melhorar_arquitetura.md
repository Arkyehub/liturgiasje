---
description: Identifica e refatora "módulos rasos" em "módulos profundos", eliminando complexidade desnecessária da interface.
---


# Objetivo
Atuar como um "faxineiro arquitetural", simplificando o uso de módulos enquanto esconde a complexidade interna.


# Instruções
1. **Identificação**: Procure por módulos que exponham muitos métodos mas façam pouca coisa (Shallow Modules).
2. **Refatoração**: Mova a lógica para o interior do módulo, expondo apenas o essencial (Deep Modules).
3. **Clean FSD**: Verifique se a lógica está na camada correta (ex: lógica de negócio no Domain, não na UI).
4. **Plano de Mudança**: Sempre apresente um `implementation_plan.md` detalhando os benefícios da refatoração antes de mexer no código.
5. **Nomenclatura**: Use os termos do `dicionario_dominio.md`.


> [!IMPORTANT]
> Uma boa interface deve ser "fácil de usar e difícil de usar errado".