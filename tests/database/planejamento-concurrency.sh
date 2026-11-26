#!/bin/bash
# Concorrência de plan_*: sessões psql paralelas contra um PostgreSQL DESCARTÁVEL (socket Unix, sem rede).
# Pré-requisito: banco com fixture, schema, fixture-policies, migration_archive_profiles e
# migration_planejamento_compartilhado já aplicados. Cria dados sintéticos próprios (prefixo e0/f0).
# Uso: PG_LOCAL_SOCKET_DIR=<dir> PG_LOCAL_DB=<banco> [PG_LOCAL_USER=postgres] tests/database/planejamento-concurrency.sh
set -u
SOCK=${PG_LOCAL_SOCKET_DIR:?defina PG_LOCAL_SOCKET_DIR}
DB=${PG_LOCAL_DB:?defina PG_LOCAL_DB}
PGU=${PG_LOCAL_USER:-$(id -un)}
case "$SOCK" in /*) ;; *) echo "PG_LOCAL_SOCKET_DIR deve ser um diretório de socket local"; exit 2;; esac
P() { psql -X -q -h "$SOCK" -U "$PGU" -d "$DB" -v ON_ERROR_STOP=1 "$@"; }
N=6
A=e0000000-0000-0000-0000-0000000000a1
fail() { echo "FAIL: $*"; exit 1; }

P -c "
INSERT INTO auth.users(id) VALUES ('$A') ON CONFLICT DO NOTHING;
INSERT INTO public.profiles(id,auth_user_id,email,full_name,role) VALUES ('f0000000-0000-0000-0000-0000000000a1','$A','cc-a@local','Conc A','admin') ON CONFLICT DO NOTHING;
DELETE FROM public.schedule_plans WHERE month_reference IN ('2029-01','2029-02','2029-03');"

call() { # call <session-tag> <sql>  -> última linha de saída (ou o erro)
  P -At -c "SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$A',false); $2" 2>&1 | grep -v "^CONTEXT" | tail -1
}

# 1) plan_open paralelo, mesmo plano, sessões diferentes: exatamente um edit
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for i in $(seq 1 $N); do
  ( call x "SELECT public.plan_open('2029-01','s$i')->>'mode'" > "$tmp/open$i" ) &
done; wait
edits=$(cat "$tmp"/open* | grep -c '^edit$'); ro=$(cat "$tmp"/open* | grep -c '^readonly$')
[ "$edits" = 1 ] && [ "$ro" = $((N-1)) ] || fail "plan_open: edit=$edits readonly=$ro ($(cat "$tmp"/open* | tr '\n' ' '))"
[ "$(P -At -c "SELECT count(*) FROM public.schedule_plans WHERE month_reference='2029-01'")" = 1 ] || fail "plan_open duplicou linha"
echo "PASS plan_open: 1 edit, $((N-1)) readonly"

# 2) plan_save paralelo com a mesma revisão esperada: exatamente um sucesso
PID=$(call x "SELECT public.plan_open('2029-02','sv')->'plan'->>'id'")
for i in $(seq 1 $N); do
  ( call x "SELECT 'ok:'||public.plan_save('$PID','sv','req$i',0,'{\"w\":$i}')" > "$tmp/save$i" ) &
done; wait
okc=$(cat "$tmp"/save* | grep -c '^ok:1$'); cf=$(cat "$tmp"/save* | grep -c 'plan_revision_conflict')
[ "$okc" = 1 ] && [ "$cf" = $((N-1)) ] || fail "plan_save: ok=$okc conflito=$cf ($(cat "$tmp"/save* | tr '\n' ' '))"
echo "PASS plan_save: 1 sucesso, $((N-1)) plan_revision_conflict"

# 3) plan_list (purga) paralelo: sem deadlock
for k in $(seq 1 20); do
  P -c "INSERT INTO auth.users(id) VALUES ('e1000000-0000-0000-0000-0000000000$(printf %02d $k)') ON CONFLICT DO NOTHING;
        INSERT INTO public.profiles(id,auth_user_id,email,full_name,role) VALUES ('f1000000-0000-0000-0000-0000000000$(printf %02d $k)','e1000000-0000-0000-0000-0000000000$(printf %02d $k)','cc-p$k@local','P$k','reader') ON CONFLICT DO NOTHING;
        INSERT INTO public.schedule_plans(month_reference,owner_profile_id,expires_at) VALUES ('2029-03','f1000000-0000-0000-0000-0000000000$(printf %02d $k)', now() - interval '1 day') ON CONFLICT DO NOTHING;"
done
for i in $(seq 1 $N); do
  ( call x "SELECT 'n='||jsonb_array_length(public.plan_list(ARRAY['2029-03','2029-01']))" > "$tmp/list$i" ) &
done; wait
grep -il 'deadlock\|error' "$tmp"/list* >/dev/null && fail "plan_list: $(cat "$tmp"/list* | tr '\n' ' ')"
[ "$(P -At -c "SELECT count(*) FROM public.schedule_plans WHERE month_reference='2029-03'")" = 0 ] || fail "vencidos nao purgados"
echo "PASS plan_list: purga paralela sem deadlock"

# limpeza dos dados sintéticos
P -c "DELETE FROM public.schedule_plans WHERE month_reference IN ('2029-01','2029-02','2029-03');
      DELETE FROM public.profiles WHERE email LIKE 'cc-%@local'; DELETE FROM auth.users WHERE id::text LIKE 'e0000000%' OR id::text LIKE 'e1000000%';"
echo "planejamento concorrencia passed"
