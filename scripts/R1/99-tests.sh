#!/usr/bin/env bash
# R1 | TESTES
source "$(dirname "$0")/../common/utils.sh"
LAB="${IF_R1_LAB:-$(inet_iface)}"
hr; log "R1 | 99-tests"
echo "- IPs e rotas:"; ip -br addr; ip route
echo "- ip_forward:"; cat /proc/sys/net/ipv4/ip_forward
echo "- NAT ativo?"; iptables -t nat -C POSTROUTING -o "$LAB" -j MASQUERADE 2>/dev/null && ok "MASQUERADE em $LAB" || warn "NAT ausente"
echo "- ppp0:"; ip -br addr show ppp0 2>/dev/null || warn "sem ppp0"
echo "- multicast (ip mroute):"; ip mroute 2>/dev/null | head
echo "- Apache proxy /api chega em S?"; curl -s -o /dev/null -w "  http://127.0.0.1/api/channels -> %{http_code}\n" http://127.0.0.1/api/channels
echo "- ping S e R2:"; ping -c1 -W2 "$S_IP" >/dev/null 2>&1 && ok "S ok" || warn "S falhou"; ping -c1 -W2 "$PPP_R2" >/dev/null 2>&1 && ok "ppp R2 ok" || warn "R2 falhou"
