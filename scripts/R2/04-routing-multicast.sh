#!/usr/bin/env bash
# R2 | ETAPA 04 - rotas via PPP + roteamento multicast (recebe o fluxo e entrega a X/Y)
source "$(dirname "$0")/../common/utils.sh"; need_root
NET_INET="$(inet_iface)"
LAN2="${IF_R2_LAN2:-$(all_eth | grep -v -x "$NET_INET" | head -1)}"
[ -z "$LAN2" ] && LAN2="$(first_eth)"
hr; log "R2 | 04-routing-multicast : LAN2=$LAN2"
if ! ip -br addr show ppp0 2>/dev/null | grep -q 10.0.0; then
  err "ppp0 não está ativo. Rode a etapa 02 (e a etapa 05 do R1) antes."; exit 1
fi
sysctl -w net.ipv4.conf.ppp0.rp_filter=0 >/dev/null
ip route replace 172.16.0.0/16 via "$PPP_R1" dev ppp0
ip route replace default via "$PPP_R1" dev ppp0        # internet via R1 (NAT)
ip link set ppp0 multicast on
systemctl restart smcroute 2>/dev/null || smcrouted 2>/dev/null; sleep 1
smcroutectl flush 2>/dev/null
for C in $(seq 1 "$NCH"); do
  smcroutectl add ppp0 "$S_IP" 239.20.$GRUPO.$C "$LAN2" 2>/dev/null || smcroute -a ppp0 "$S_IP" 239.20.$GRUPO.$C "$LAN2" 2>/dev/null
done
ip mroute 2>/dev/null | head
ok "etapa 04 concluida (rotas + multicast p/ $NCH canais)"
