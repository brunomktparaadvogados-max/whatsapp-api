#!/usr/bin/env bash
# QR_RESET_FIX - aplica a correcao do QR no adapter e coleta diagnostico do Evolution GO.
# Nao apaga instancias, nao reinicia o Evolution GO, nao envia mensagens.
# Uso (console da VPS):
#   cd /opt/prospectflow-whatsapp/adapter
#   git fetch origin claude/evogo-qr-reset
#   git checkout -B claude/evogo-qr-reset FETCH_HEAD
#   bash scripts/qr-fix-deploy.sh
set -u
cd /opt/prospectflow-whatsapp/adapter || exit 1
OUT=/tmp/qr-fix-$(date +%Y%m%d-%H%M%S).txt
exec > >(tee "$OUT") 2>&1

PREV=$(git rev-parse --short HEAD@{1} 2>/dev/null || echo desconhecido)
echo "=== commit atual: $(git rev-parse --short HEAD) (anterior: $PREV) ==="

echo "=== validando sintaxe ==="
if ! node --check src/server.js || ! node --check src/EvolutionGoProvider.js; then
  echo "ERRO de sintaxe - nada foi reconstruido. Voltando ao commit anterior."
  git checkout -q "$PREV" 2>/dev/null
  exit 1
fi

echo "=== reconstruindo SOMENTE o adapter ==="
docker compose build prospectflow-whatsapp-api && docker compose up -d prospectflow-whatsapp-api

echo "=== aguardando health (ate 60s) ==="
OK=0
for i in $(seq 1 12); do
  sleep 5
  if curl -sf http://127.0.0.1:3000/api/health > /tmp/qr-health.json; then OK=1; break; fi
done
if [ "$OK" != 1 ]; then
  echo "ERRO: adapter nao respondeu. Voltando ao commit anterior $PREV e reconstruindo."
  git checkout -q "$PREV" && docker compose build prospectflow-whatsapp-api && docker compose up -d prospectflow-whatsapp-api
  exit 1
fi
echo "health OK"
cat /tmp/qr-health.json; echo

echo
echo "=== containers ==="
docker compose ps

echo
echo "=== memoria / disco ==="
free -m
df -h / | tail -1

echo
echo "=== conexoes no Postgres do Evolution GO (limite 500) ==="
docker exec evolution-go-postgres psql -U postgres -tAc "select count(*) from pg_stat_activity" 2>&1

echo
echo "=== erros recentes do Evolution GO ==="
docker logs evolution-go --since 30m 2>&1 | grep -iE "error|fail|too many|panic|refused|timeout|qr" | tail -40

echo
echo "=== erros recentes do adapter ==="
docker compose logs --since 30m prospectflow-whatsapp-api 2>&1 | grep -iE "error|my-qr|evogo" | tail -30

echo
echo "Relatorio salvo em $OUT"
echo "Agora abra o ProspectFlow > WhatsApp > Conexao API e clique em Novo QR."
