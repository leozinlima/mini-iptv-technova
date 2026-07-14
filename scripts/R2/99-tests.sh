#!/usr/bin/env bash
# R2 | TESTES
source "$(dirname "$0")/../common/utils.sh"
hr; log "R2 | 99-tests"
echo "- IPs e rotas:"; ip -br addr; ip route
echo "- ppp0:"; ip -br addr show ppp0 2>/dev/null || warn "sem ppp0"
echo "- DHCP ativo?"; systemctl is-active isc-dhcp-server 2>/dev/null
echo "- multicast (ip mroute):"; ip mroute 2>/dev/null | head
echo "- ping S (via ppp/R1):"; ping -c1 -W2 "$S_IP" >/dev/null 2>&1 && ok "S ok" || warn "S falhou"
echo "- internet (via R1 NAT):"; ping -c1 -W2 8.8.8.8 >/dev/null 2>&1 && ok "internet ok" || warn "sem internet"
