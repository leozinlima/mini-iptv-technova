#!/usr/bin/env bash
# S | ETAPA 02 - IP fixo + rota multicast
source "$(dirname "$0")/../common/utils.sh"; need_root
IF="${IF_S:-$(first_eth)}"
hr; log "S | 02-network : placa $IF -> $S_IP"
[ -z "$IF" ] && { err "nenhuma placa ethernet; edite IF_S em common/vars.env"; exit 1; }
config_static "$IF" "$S_IP/24" "$R1_IP" 127.0.0.1   # S usa ele mesmo como DNS
ip route replace 239.0.0.0/8 dev "$IF"              # multicast sai por esta placa
ufw disable 2>/dev/null
ip -br addr show "$IF"; ok "etapa 02 concluida"
