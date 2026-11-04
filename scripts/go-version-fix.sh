#!/usr/bin/env bash
# PROSPECTFLOW_WA_VERSION_FIX - reconstroi SOMENTE o Evolution GO com a versao
# atual do cliente WhatsApp. Nao mexe no adapter, no Evolution legado, nos bancos
# nem nas instancias. Se o novo container nao subir, volta para a imagem anterior.
# Uso: bash scripts/go-version-fix.sh   (dentro de /opt/prospectflow-whatsapp/adapter)
set -u
cd /opt/prospectflow-whatsapp/adapter || exit 1
IMG=prospectflow/evolution-go:0.7.2-prospectflow.1
BACKUP=prospectflow/evolution-go:backup-$(date +%Y%m%d%H%M%S)

echo "=== backup da imagem atual: $BACKUP ==="
docker tag "$IMG" "$BACKUP" || { echo "ERRO: imagem atual nao encontrada"; exit 1; }

echo "=== build do Evolution GO (pode levar alguns minutos) ==="
if ! docker compose build evolution-go; then
  echo "ERRO no build - nada foi trocado. A imagem em uso continua a mesma."
  exit 1
fi

echo "=== trocando SOMENTE o container evolution-go ==="
docker compose up -d --no-deps evolution-go

OK=0
for i in $(seq 1 24); do
  sleep 5
  if docker logs evolution-go --since 3m 2>&1 | grep -q "WhatsApp client version"; then OK=1; break; fi
done
docker logs evolution-go --since 3m 2>&1 | grep -iE "client version|Starting Evolution|error" | cut -c1-200 | tail -8

if [ "$OK" != 1 ] || [ "$(docker inspect -f '{{.State.Running}}' evolution-go)" != "true" ]; then
  echo "ERRO: Evolution GO novo nao confirmou a versao. Voltando para $BACKUP."
  docker tag "$BACKUP" "$IMG"
  docker compose up -d --no-deps evolution-go
  exit 1
fi

echo "=== health publico ==="
sleep 5
docker exec prospectflow-whatsapp-adapter wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null | cut -c1-400; echo
echo "OK. Backup da imagem anterior: $BACKUP"
