#!/usr/bin/env bash
# scripts/tp-recovery.sh — wrapper que carrega creds e chama tp-recovery.js
#
# Uso (na maquina do Marco):
#   ./scripts/tp-recovery.sh --from 2026-05-04T17:00:00Z --dry-run
#   ./scripts/tp-recovery.sh --from 2026-05-04T17:00:00Z --skip ID1
#
# Le SUPABASE_PESSOAL_SECRET_KEY e SUPABASE_PESSOAL_URL do .env do
# repo assistant-sexta-feira (~/Documents/assistant-sexta-feira/.env).

set -euo pipefail

SF_ENV="$HOME/Documents/assistant-sexta-feira/.env"
if [[ -f "$SF_ENV" ]]; then
  TP_SUPABASE_URL="$(grep '^SUPABASE_PESSOAL_URL=' "$SF_ENV" | cut -d= -f2-)"
  TP_SUPABASE_KEY="$(grep '^SUPABASE_PESSOAL_SECRET_KEY=' "$SF_ENV" | cut -d= -f2-)"
  export TP_SUPABASE_URL TP_SUPABASE_KEY
else
  echo "WARN: $SF_ENV nao encontrado. Defina TP_SUPABASE_URL e TP_SUPABASE_KEY manualmente." >&2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/tp-recovery.js" "$@"
