---
trigger: glob
globs: src/shared/api/supabaseClient.ts, src/data/**/*.ts, supabase/**/*.sql
---

# Segurança e Gestão de Dados (Supabase)

A segurança dos dados do usuário e a integridade do banco de dados são prioridades críticas.

## 1. Segurança de Banco (RLS)
- **Obrigatoriedade**: Toda tabela no schema `public` deve ter Row Level Security (RLS) habilitado.
- **Políticas**: Use `auth.uid()` para restringir o acesso apenas aos proprietários dos dados.

## 2. Gestão de Chaves e Variáveis
- **Proibição**: Nunca armazene `SUPABASE_SERVICE_ROLE_KEY` no frontend.
- **Env**: Utilize `process.env` para acessar a `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## 3. Tipagem de Dados
- **Mapeamento**: Ao buscar dados do Supabase, você DEVE mapear o retorno (DTO) para a interface de Domínio correspondente.
- **Null Safety**: Garanta que erros de requisição (`error`) sejam tratados antes de tentar acessar o `data`.

> [!CAUTION]
> Nunca exponha segredos ou realize operações administrativas diretamente no cliente do navegador.