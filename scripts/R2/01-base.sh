#!/usr/bin/env bash
# R2 | ETAPA 01 - pacotes base (precisa de internet)
source "$(dirname "$0")/../common/utils.sh"; need_root
hr; log "R2 | 01-base : instalando pacotes"
apt-get update -y 2>/dev/null
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ppp smcroute tcpdump iproute2 net-tools isc-dhcp-server 2>/dev/null \
  && ok "pacotes instalados" || warn "sem internet? seguindo"
ok "etapa 01 concluida"
