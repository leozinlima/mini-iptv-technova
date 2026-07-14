#!/usr/bin/env bash
# R1 | ETAPA 02 - IP da LAN #1 + roteamento (a internet vem pela placa do laboratório)
source "$(dirname "$0")/../common/utils.sh"; need_root
LAB="${IF_R1_LAB:-$(inet_iface)}"
LAN1="${IF_R1_LAN1:-$(all_eth | grep -v -x "$LAB" | head -1)}"
hr; log "R1 | 02-network : LAN1=$LAN1  LAB(internet)=$LAB"
[ -z "$LAN1" ] && { err "não achei a placa LAN1; preencha IF_R1_LAN1 em common/vars.env"; exit 1; }
config_static "$LAN1" "$R1_IP/24"                 # sem gateway (default vem do LAB)
sysctl -w net.ipv4.ip_forward=1 >/dev/null
sysctl -w net.ipv4.conf.all.rp_filter=0 >/dev/null
sysctl -w net.ipv4.conf.default.rp_filter=0 >/dev/null
ufw disable 2>/dev/null
ip -br addr show "$LAN1"; ok "etapa 02 concluida"
