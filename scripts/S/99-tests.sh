#!/usr/bin/env bash
# S | TESTES
source "$(dirname "$0")/../common/utils.sh"
hr; log "S | 99-tests"
echo "- IP e rotas:"; ip -br addr; ip route | grep -E 'default|239'
echo "- DNS (deve resolver iptv -> 172.16.0.1):"; dig @127.0.0.1 iptv.tecnova.com.br +short
echo "- MX:"; dig @127.0.0.1 tecnova.com.br MX +short
echo "- portas de e-mail (25/110/143/587):"; ss -ltn 2>/dev/null | grep -E ':25|:110|:143|:587' || echo "  (nenhuma)"
echo "- app (3000) e OAuth (9000):"; ss -ltn 2>/dev/null | grep -E ':3000|:9000' || echo "  (nenhuma)"
echo "- login OAuth (password grant):"
curl -s -X POST http://127.0.0.1:3000/oauth/token -d "grant_type=password&username=admin&password=admin" \
  | grep -q access_token && ok "OAuth emite token" || warn "OAuth não respondeu"
