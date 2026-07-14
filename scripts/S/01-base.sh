#!/usr/bin/env bash
# S | ETAPA 01 - pacotes base (precisa de internet)
source "$(dirname "$0")/../common/utils.sh"; need_root
hr; log "S | 01-base : instalando pacotes"
apt-get update -y 2>/dev/null
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  vlc ffmpeg smcroute tcpdump iproute2 net-tools \
  bind9 bind9-utils dnsutils postfix dovecot-pop3d dovecot-imapd nodejs 2>/dev/null \
  && ok "pacotes instalados" || warn "sem internet? seguindo mesmo assim"
nmcli radio wifi off 2>/dev/null
ok "etapa 01 concluida"
