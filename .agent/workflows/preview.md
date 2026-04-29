---
description: Realiza o commit e push das alterações atuais para a branch de preview.
---

# Fluxo de Preview

Este workflow garante que todas as alterações sejam salvas na branch de desenvolvimento e testes antes de irem para produção.

1. **Verificação**: Verifique se existem alterações pendentes com `git status`.
2. **Commit**: Realize o commit das alterações.
   - Mensagem: Use uma mensagem clara seguindo o padrão de commits do projeto (ex: `feat:`, `fix:`, `style:`).
3. **Push**: Envie as alterações para o repositório remoto:
   - `git push origin preview`
4. **Validação**: Verifique se o push foi concluído com sucesso e se os logs não indicam erros críticos.
