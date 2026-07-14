#!/usr/bin/env bash
# X | TESTES  [use o MESMO no Y]
source "$(dirname "$0")/../common/utils.sh"
hr; log "CLIENTE | 99-tests"
echo "- IP e rota:"; ip -br addr; ip route
echo "- ping gateway (R2):"; ping -c1 -W2 "$R2_IP" >/dev/null 2>&1 && ok "R2 ok" || warn "R2 falhou"
echo "- ping S (via R2/PPP/R1):"; ping -c1 -W2 "$S_IP" >/dev/null 2>&1 && ok "S ok" || warn "S falhou"
echo "- internet (via R1 NAT):"; ping -c1 -W2 8.8.8.8 >/dev/null 2>&1 && ok "internet ok" || warn "sem internet"
echo "- DNS (nome externo):"; ping -c1 -W2 google.com >/dev/null 2>&1 && ok "DNS ok" || warn "DNS não resolve"
echo "- portal responde?"; curl -s -o /dev/null -w "  http://iptv.tecnova.com.br -> %{http_code}\n" http://iptv.tecnova.com.br 2>/dev/null
