#!/usr/bin/env bash
set -euo pipefail

# Espera variáveis do ambiente do deploy:
#   APP_ENV           -> "staging" | "production" | "dev"
#   SUPABASE_URL      -> URL do projeto Supabase do ambiente
#   SUPABASE_ANON_KEY -> anon key do ambiente
#   APP_VERSION       -> (opcional) versão a exibir no rodapé

: "${APP_ENV:?APP_ENV não definido}"
: "${SUPABASE_URL:?SUPABASE_URL não definido}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY não definido}"
APP_VERSION="${APP_VERSION:-1.0.0}"

sed -e "s#__APP_ENV__#${APP_ENV}#g" \
    -e "s#__SUPABASE_URL__#${SUPABASE_URL}#g" \
    -e "s#__SUPABASE_ANON_KEY__#${SUPABASE_ANON_KEY}#g" \
    -e "s#__APP_VERSION__#${APP_VERSION}#g" \
    public/config.template.js > public/config.js

echo "[render-config] Gerado public/config.js para ${APP_ENV} (versão ${APP_VERSION})"
