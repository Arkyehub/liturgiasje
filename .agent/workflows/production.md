---
description: Transfere as alterações da branch preview para a main, seguindo os protocolos de release e cache.
---

# Fluxo de Produção

Este workflow deve ser executado APENAS quando o usuário der o comando explícito para enviar para produção.

1. **Preparação**: Garanta que você está na branch `preview` e que ela está sincronizada com o remoto.
2. **Bump Version**: Execute o script de versão e realize o commit das alterações:
   - `node scripts/bump-version.mjs` // turbo
   - `git add .`
   - `git commit -m "chore: bump version to ${APP_VERSION}"`
3. **Sincronização de Banco**: Atualize a tabela `app_settings` com a nova `APP_VERSION`:
   - Atualizar `min_version` para coincidir com a nova `APP_VERSION` (formato `X.YY`, sem o `.0` final do package.json, ex: '1.32') no Supabase SQL Editor. // turbo
4. **Merge para Main**: Transfira o conteúdo da `preview` para a `main`:
   - `git checkout main`
   - `git merge preview`
5. **Push para Produção**: Envie para o repositório remoto:
   - `git push origin main` // turbo
6. **Retorno**: Volte para a branch `preview` e sincronize:
   - `git checkout preview`
   - `git push origin preview`
7. **Finalização**: 
   - Informe ao usuário que o Service Worker será registrado com `/sw.js?v=${APP_VERSION}`.
   - **IMPORTANTE**: Recomende ao usuário aguardar o término do deploy na Vercel (1-2 minutos) antes de tentar acessar a versão de produção para evitar loops de atualização.
