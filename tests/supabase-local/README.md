# Homologação local V1.39

Os scripts desta pasta foram usados somente com as imagens locais de PostgreSQL 17, GoTrue e PostgREST, em uma rede Docker `internal`. Não os aponte para Supabase Preview ou Production.

## Auth e PostgREST

Com o banco `liturgiasje_v139_replay` reconstruído e as migrations aplicadas, execute no container local do banco:

```powershell
Get-Content .\tests\supabase-local\integration.py -Raw |
  docker exec -i -e AUTH_URL=http://auth-replay:9999 -e REST_URL=http://rest-replay:3000 liturgiasje-private-db python3 -
```

O script cria oito contas sintéticas no GoTrue, autentica por senha e usa os JWTs emitidos pelo Auth nas chamadas PostgREST. Uma chave local derivada do `JWT_SECRET` serve somente para preparar fixtures. O teste cobre autorização, escrita legada, operação em lote, rollback, arquivamento e corridas concorrentes de papéis e dos dois últimos administradores. Os dados sintéticos permanecem no banco descartável; recrie esse banco para uma execução limpa.

## Rota Next e SSR

`host-gateway.mjs` encaminha somente `/auth/v1` e `/rest/v1`, escuta em `127.0.0.1:15432` e recusa uma rede não interna ou serviços com porta publicada fora do loopback. Execute-o enquanto a aplicação Next estiver em `127.0.0.1:3030`, configurada com URL/chaves sintéticas do banco local. Depois execute:

```powershell
node .\tests\supabase-local\analytics-http.mjs
```

O teste cria um administrador e um aviso sintéticos, faz login real pelo GoTrue, constrói um cookie SSR, verifica a listagem/cadastro, chama a rota antiga de exclusão (que deve arquivar) e valida a resposta de Analytics e o nome do autor. O fluxo de login do provedor Google não é exercitado.

Os scripts recusam URLs fora de loopback ou dos aliases Docker locais permitidos. Não imprimem chaves, senhas ou tokens.
