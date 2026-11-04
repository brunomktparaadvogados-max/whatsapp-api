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
# A VPS nao tem node no host: valida dentro da imagem do adapter em uso.
chk() { docker run --rm --entrypoint node -v "$PWD/src":/chk:ro prospectflow-whatsapp-adapter --check "/chk/$1"; }
if ! chk server.js || ! chk EvolutionGoProvider.js; then
  echo "ERRO de sintaxe - nada foi reconstruido. Voltando ao commit anterior."
  git checkout -q "$PREV" 2>/dev/null
  exit 1
fi

# O adapter em producao e o servico "adapter" do compose em /opt/prospectflow-whatsapp
# (build context ./adapter). Nao usar o compose desta pasta para o adapter.
echo "=== reconstruindo SOMENTE o adapter ==="
(cd /opt/prospectflow-whatsapp && docker compose build adapter && docker compose up -d --no-deps adapter)

echo "=== aguardando health (ate 60s) ==="
OK=0
for i in $(seq 1 12); do
  sleep 5
  if docker exec prospectflow-whatsapp-adapter wget -qO- http://127.0.0.1:3000/api/health > /tmp/qr-health.json 2>/dev/null; then OK=1; break; fi
done
if [ "$OK" != 1 ]; then
  echo "ERRO: adapter nao respondeu. Voltando ao commit anterior $PREV e reconstruindo."
  git checkout -q "$PREV" && (cd /opt/prospectflow-whatsapp && docker compose build adapter && docker compose up -d --no-deps adapter)
  exit 1
fi
echo "health OK"
cat /tmp/qr-health.json; echo

echo
echo "=== containers ==="
docker ps --format '{{.Names}} {{.Status}}'

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
docker logs --since 30m prospectflow-whatsapp-adapter 2>&1 | grep -iE "error|my-qr|evogo" | tail -30

echo
echo "Relatorio salvo em $OUT"
echo "Agora abra o ProspectFlow > WhatsApp > Conexao API e clique em Novo QR."
