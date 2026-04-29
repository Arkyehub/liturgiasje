---
description: Escaneia o projeto para identificar a terminologia de negócios e mantém o dicionario_dominio.md como fonte de verdade para nomenclatura.
---


# Objetivo
Garantir que o código, o design e o negócio falem a mesma língua (DDD), evitando sinônimos ambíguos.


# Instruções
1. **Escaneamento**: Procure por termos de negócio em `src/domain`, `DESIGN.md` e conversas anteriores.
2. **Dicionário**: Crie ou atualize o `dicionario_dominio.md` na raiz do projeto com: Termo, Definição e Contexto/Uso.
3. **Consistência**: Antes de sugerir qualquer nome de classe, variável, tabela de banco ou componente, verifique se o termo já existe no dicionário.
4. **Novos Termos**: Se precisar introduzir um conceito novo, peça permissão ao usuário e registre-o imediatamente no dicionário.


> [!TIP]
> A Linguagem Ubíqua deve ser usada também nas mensagens de commit e nas descrições de Pull Requests.
