#!/usr/bin/env bash
# R2 | ETAPA 02 - IP da LAN #2 + enlace PPP (WAN 115200)
# Dica: rode esta etapa e a etapa 05 do R1 por perto. Se o ppp0 não subir de
#       primeira, rode este script de novo depois que o R1 estiver ligado.
source "$(dirname "$0")/../common/utils.sh"; need_root
NET_INET="$(inet_iface)"
LAN2="${IF_R2_LAN2:-$(all_eth | grep -v -x "$NET_INET" | head -1)}"
[ -z "$LAN2" ] && LAN2="$(first_eth)"
SER="$(detect_serial)"
hr; log "R2 | 02-ppp : LAN2=$LAN2  serial=$SER (R2=$PPP_R2)"
[ -z "$LAN2" ] && { err "não achei a placa LAN2; preencha IF_R2_LAN2 em common/vars.env"; exit 1; }

config_static "$LAN2" "$R2_IP/24"
sysctl -w net.ipv4.ip_forward=1 >/dev/null
sysctl -w net.ipv4.conf.all.rp_filter=0 >/dev/null
sysctl -w net.ipv4.conf.default.rp_filter=0 >/dev/null
ufw disable 2>/dev/null

pkill pppd 2>/dev/null; sleep 1
rm -f /var/lock/LCK..$(basename "$SER") /run/lock/LCK..$(basename "$SER") 2>/dev/null
pppd "$SER" "$BAUD" ${PPP_R2}:${PPP_R1} noauth local nocrtscts lock nodefaultroute persist maxfail 0
log "aguardando ppp0..."
if wait_ppp; then ok "ppp0 ativo (R2=$PPP_R2)"; else err "ppp0 não subiu; rode a etapa 05 do R1 e este script de novo"; fi
ok "etapa 02 concluida"
