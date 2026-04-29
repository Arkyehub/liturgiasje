---
description: Transfere as alterações da branch preview para a main, seguindo os protocolos de release e cache.
---

# Fluxo de Produção

Este workflow deve ser executado APENAS quando o usuário der o comando explícito para enviar para produção.

1. **Preparação**: Garanta que você está na branch `preview` e que ela está sincronizada com o remoto.
2. **Bump Version**: Execute o script de versão (isso atualizará `version.ts` e `package.json`):
   - `node scripts/bump-version.mjs` // turbo
3. **Sincronização de Banco**: Atualize a tabela `app_settings` com a nova `APP_VERSION`:
   - Atualizar `min_version` para coincidir com a nova versão. // turbo
4. **Merge para Main**: Transfira o conteúdo da `preview` para a `main`:
   - `git checkout main`
   - `git merge preview`
5. **Push para Produção**: Envie para o repositório remoto:
   - `git push origin main` // turbo
6. **Retorno**: Volte para a branch `preview` para continuar o desenvolvimento:
   - `git checkout preview`
7. **Cache**: Informe ao usuário que o Service Worker será registrado com `/sw.js?v=${APP_VERSION}` para evitar problemas de cache no Safari.
