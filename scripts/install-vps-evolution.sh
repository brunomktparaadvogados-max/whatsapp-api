#!/usr/bin/env bash
set -Eeuo pipefail

STACK_DIR="${STACK_DIR:-/opt/prospectflow-whatsapp}"
DOMAIN="${DOMAIN:-143-95-221-102.sslip.io}"
REPO_URL="${REPO_URL:-https://github.com/brunomktparaadvogados-max/whatsapp-api.git}"
REPO_BRANCH="${REPO_BRANCH:-codex/koyeb-session-safety}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Execute como root." >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  cat >&2 <<'MSG'
ERRO: defina DATABASE_URL antes de executar.

Exemplo:
  export DATABASE_URL='postgresql://usuario:senha@host:5432/postgres'
  bash install-vps-evolution.sh
MSG
  exit 1
fi

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

install_base_packages() {
  dnf install -y curl git openssl firewalld ca-certificates >/dev/null
}

install_docker() {
  if ! need_cmd docker; then
    curl -fsSL https://get.docker.com | sh
  fi
  systemctl enable --now docker
  if ! docker compose version >/dev/null 2>&1; then
    dnf install -y docker-compose-plugin >/dev/null || true
  fi
  docker compose version >/dev/null
}

configure_firewall() {
  systemctl enable --now firewalld
  firewall-cmd --permanent --add-port=22022/tcp >/dev/null || true
  firewall-cmd --permanent --add-service=http >/dev/null || true
  firewall-cmd --permanent --add-service=https >/dev/null || true
  firewall-cmd --reload >/dev/null || true
}

rand_hex() {
  openssl rand -hex "$1"
}

prepare_dirs() {
  mkdir -p "${STACK_DIR}"
}

write_env() {
  local env_file="${STACK_DIR}/.env"
  local jwt_secret evolution_key postgres_password

  if [[ -f "${env_file}" ]]; then
    # shellcheck disable=SC1090
    source "${env_file}"
  fi

  jwt_secret="${JWT_SECRET:-$(rand_hex 32)}"
  evolution_key="${EVOLUTION_API_KEY:-$(rand_hex 32)}"
  postgres_password="${POSTGRES_PASSWORD:-$(rand_hex 24)}"

  cat > "${env_file}" <<EOF
DOMAIN=${DOMAIN}
PUBLIC_BASE_URL=https://${DOMAIN}
DATABASE_URL=${DATABASE_URL}
JWT_SECRET=${jwt_secret}
EVOLUTION_API_KEY=${evolution_key}
EVOLUTION_INSTANCE_PREFIX=pfvps
EVOLUTION_SEND_DELAY_MS=1500
WHATSAPP_SEND_DEDUPE_MS=900000
POSTGRES_PASSWORD=${postgres_password}
EOF

  chmod 600 "${env_file}"
}

sync_adapter_repo() {
  local adapter_dir="${STACK_DIR}/adapter"
  if [[ -d "${adapter_dir}/.git" ]]; then
    git -C "${adapter_dir}" fetch --prune origin "${REPO_BRANCH}"
    git -C "${adapter_dir}" checkout "${REPO_BRANCH}"
    git -C "${adapter_dir}" reset --hard "origin/${REPO_BRANCH}"
  else
    rm -rf "${adapter_dir}"
    git clone --depth 1 --branch "${REPO_BRANCH}" "${REPO_URL}" "${adapter_dir}"
  fi
  git -C "${adapter_dir}" config core.autocrlf false
}

write_compose() {
  cat > "${STACK_DIR}/docker-compose.yml" <<'EOF'
services:
  adapter:
    build:
      context: ./adapter
    container_name: prospectflow-whatsapp-adapter
    restart: always
    depends_on:
      - evolution-api
    environment:
      PORT: 3000
      HOST: 0.0.0.0
      NODE_ENV: production
      NODE_OPTIONS: --max-old-space-size=768
      DATABASE_URL: ${DATABASE_URL}
      JWT_SECRET: ${JWT_SECRET}
      PUBLIC_BASE_URL: ${PUBLIC_BASE_URL}
      EVOLUTION_API_URL: http://evolution-api:8080
      EVOLUTION_API_KEY: ${EVOLUTION_API_KEY}
      EVOLUTION_WEBHOOK_URL: http://adapter:3000/api/webhooks/evolution
      EVOLUTION_INSTANCE_PREFIX: ${EVOLUTION_INSTANCE_PREFIX}
      EVOLUTION_SEND_DELAY_MS: ${EVOLUTION_SEND_DELAY_MS}
      WHATSAPP_SEND_DEDUPE_MS: ${WHATSAPP_SEND_DEDUPE_MS}
    expose:
      - "3000"

  evolution-api:
    image: evoapicloud/evolution-api:latest
    container_name: prospectflow-evolution-api
    restart: always
    depends_on:
      - evolution-postgres
      - evolution-redis
    environment:
      SERVER_NAME: evolution
      SERVER_TYPE: http
      SERVER_PORT: 8080
      SERVER_URL: ${PUBLIC_BASE_URL}
      AUTHENTICATION_API_KEY: ${EVOLUTION_API_KEY}
      AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES: "true"
      CORS_ORIGIN: "*"
      CORS_METHODS: GET,POST,PUT,DELETE
      CORS_CREDENTIALS: "true"
      DATABASE_ENABLED: "true"
      DATABASE_PROVIDER: postgresql
      DATABASE_CONNECTION_URI: postgresql://evolution:${POSTGRES_PASSWORD}@evolution-postgres:5432/evolution?schema=evolution_api
      DATABASE_CONNECTION_CLIENT_NAME: prospectflow_vps
      DATABASE_SAVE_DATA_INSTANCE: "true"
      DATABASE_SAVE_DATA_NEW_MESSAGE: "true"
      DATABASE_SAVE_MESSAGE_UPDATE: "true"
      DATABASE_SAVE_DATA_CONTACTS: "true"
      DATABASE_SAVE_DATA_CHATS: "true"
      DATABASE_SAVE_DATA_LABELS: "true"
      DATABASE_SAVE_DATA_HISTORIC: "true"
      CACHE_REDIS_ENABLED: "true"
      CACHE_REDIS_URI: redis://evolution-redis:6379/0
      CACHE_REDIS_PREFIX_KEY: prospectflow
      CACHE_REDIS_SAVE_INSTANCES: "true"
      CACHE_LOCAL_ENABLED: "false"
      DEL_INSTANCE: "false"
      LOG_LEVEL: ERROR,WARN,INFO,LOG
      LOG_BAILEYS: error
      WEBHOOK_GLOBAL_ENABLED: "true"
      WEBHOOK_GLOBAL_URL: http://adapter:3000/api/webhooks/evolution
      WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS: "true"
      WEBHOOK_EVENTS_QRCODE_UPDATED: "true"
      WEBHOOK_EVENTS_CONNECTION_UPDATE: "true"
      WEBHOOK_EVENTS_MESSAGES_UPDATE: "true"
      WEBHOOK_EVENTS_SEND_MESSAGE: "true"
      WEBHOOK_EVENTS_SEND_MESSAGE_UPDATE: "true"
      WEBHOOK_REQUEST_TIMEOUT_MS: "60000"
    expose:
      - "8080"

  evolution-postgres:
    image: postgres:16-alpine
    container_name: prospectflow-evolution-postgres
    restart: always
    environment:
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: evolution
    volumes:
      - evolution-postgres-data:/var/lib/postgresql/data

  evolution-redis:
    image: redis:7-alpine
    container_name: prospectflow-evolution-redis
    command: ["redis-server", "--appendonly", "yes"]
    restart: always
    volumes:
      - evolution-redis-data:/data

  caddy:
    image: caddy:2-alpine
    container_name: prospectflow-whatsapp-caddy
    restart: always
    depends_on:
      - adapter
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config

volumes:
  evolution-postgres-data:
  evolution-redis-data:
  caddy-data:
  caddy-config:
EOF
}

write_caddyfile() {
  cat > "${STACK_DIR}/Caddyfile" <<EOF
${DOMAIN} {
  encode gzip
  reverse_proxy adapter:3000
}
EOF
}

start_stack() {
  cd "${STACK_DIR}"
  docker compose pull
  docker compose up -d --build
}

wait_for_http() {
  local url="$1"
  local header="${2:-}"
  local tries="${3:-60}"
  local i

  for ((i=1; i<=tries; i++)); do
    if [[ -n "${header}" ]]; then
      if curl -fsS -H "${header}" "${url}" >/dev/null 2>&1; then
        return 0
      fi
    else
      if curl -fsS "${url}" >/dev/null 2>&1; then
        return 0
      fi
    fi
    sleep 3
  done
  return 1
}

validate_stack() {
  # shellcheck disable=SC1090
  source "${STACK_DIR}/.env"

  echo
  echo "== Containers =="
  docker compose -f "${STACK_DIR}/docker-compose.yml" ps

  echo
  echo "== Validando Evolution interna =="
  wait_for_http "http://127.0.0.1:8080/" "apikey: ${EVOLUTION_API_KEY}" 80
  curl -fsS -H "apikey: ${EVOLUTION_API_KEY}" "http://127.0.0.1:8080/"

  echo
  echo
  echo "== Validando adapter interno =="
  wait_for_http "http://127.0.0.1:3000/api/health" "" 80
  curl -fsS "http://127.0.0.1:3000/api/health"

  echo
  echo
  echo "== Validando HTTPS publico =="
  wait_for_http "https://${DOMAIN}/api/health" "" 80
  curl -fsS "https://${DOMAIN}/api/health"

  echo
  echo
  echo "INSTALACAO CONCLUIDA"
  echo "API definitiva: https://${DOMAIN}"
  echo "Use no ProspectFlow/Lovable: VITE_WHATSAPP_API_URL=https://${DOMAIN}"
  echo "Koyeb pode ficar pausado como reserva."
}

main() {
  install_base_packages
  install_docker
  configure_firewall
  prepare_dirs
  write_env
  sync_adapter_repo
  write_compose
  write_caddyfile
  start_stack
  validate_stack
}

main "$@"
