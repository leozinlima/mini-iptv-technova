#!/usr/bin/env bash
# R1 | ETAPA 01 - pacotes base (precisa de internet)
source "$(dirname "$0")/../common/utils.sh"; need_root
hr; log "R1 | 01-base : instalando pacotes"
apt-get update -y 2>/dev/null
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ppp smcroute tcpdump iproute2 net-tools iptables apache2 2>/dev/null \
  && ok "pacotes instalados" || warn "sem internet? seguindo"
a2enmod proxy proxy_http headers >/dev/null 2>&1
ok "etapa 01 concluida"
