#!/usr/bin/env bash
# R1 | ETAPA 05 - enlace PPP (WAN 115200) + roteamento multicast
# Dica: rode esta etapa no R1 e a etapa 02 do R2 por perto; se o ppp0 não subir
#       de primeira, rode este script de novo depois que o R2 estiver ligado.
source "$(dirname "$0")/../common/utils.sh"; need_root
LAB="${IF_R1_LAB:-$(inet_iface)}"
LAN1="${IF_R1_LAN1:-$(all_eth | grep -v -x "$LAB" | head -1)}"
SER="$(detect_serial)"
hr; log "R1 | 05-ppp-multicast : serial $SER (R1=$PPP_R1)"

pkill pppd 2>/dev/null; sleep 1
rm -f /var/lock/LCK..$(basename "$SER") /run/lock/LCK..$(basename "$SER") 2>/dev/null
pppd "$SER" "$BAUD" ${PPP_R1}:${PPP_R2} noauth local nocrtscts lock nodefaultroute persist maxfail 0
log "aguardando ppp0..."
if wait_ppp; then
  ok "ppp0 ativo"
  sysctl -w net.ipv4.conf.ppp0.rp_filter=0 >/dev/null
  ip route replace 192.168.0.0/24 via "$PPP_R2" dev ppp0
  ip link set ppp0 multicast on
  log "configurando multicast (smcroute) p/ $NCH canais"
  systemctl restart smcroute 2>/dev/null || smcrouted 2>/dev/null; sleep 1
  smcroutectl flush 2>/dev/null
  for C in $(seq 1 "$NCH"); do
    smcroutectl add "$LAN1" "$S_IP" 239.20.$GRUPO.$C ppp0 2>/dev/null || smcroute -a "$LAN1" "$S_IP" 239.20.$GRUPO.$C ppp0 2>/dev/null
    [ -n "$LAB" ] && { smcroutectl add "$LAN1" "$S_IP" 239.10.$GRUPO.$C "$LAB" 2>/dev/null || smcroute -a "$LAN1" "$S_IP" 239.10.$GRUPO.$C "$LAB" 2>/dev/null; }
  done
  ok "etapa 05 concluida (PPP + multicast)"
else
  err "ppp0 não subiu. Ligue/rode o R2 (etapa 02) e rode este script de novo."
  exit 1
fi
