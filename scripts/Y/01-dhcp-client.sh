#!/usr/bin/env bash
# X | ETAPA 01 - pega IP por DHCP (do R2)  [use o MESMO script no Y]
source "$(dirname "$0")/../common/utils.sh"; need_root
IF="${IF_CLIENT:-$(first_eth)}"
hr; log "CLIENTE | 01-dhcp-client : placa $IF"
[ -z "$IF" ] && { err "não achei placa; preencha IF_CLIENT em common/vars.env"; exit 1; }
nmcli radio wifi off 2>/dev/null
config_dhcp "$IF"
ufw disable 2>/dev/null
sleep 2
ip -br addr show "$IF"
IPV=$(ip -4 -br addr show "$IF" | grep -oP '192\.168\.0\.\d+' | head -1)
echo "  Seu IP: ${IPV:-?}  (192.168.0.10x = DHCP do R2 funcionou = perfil WAN115K)"
ok "etapa 01 concluida"
