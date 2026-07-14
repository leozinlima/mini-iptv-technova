#!/usr/bin/env bash
# R1 | ETAPA 03 - Source NAT (compartilha a internet do lab com S, R2, X e Y) + iptables
source "$(dirname "$0")/../common/utils.sh"; need_root
LAB="${IF_R1_LAB:-$(inet_iface)}"
hr; log "R1 | 03-nat-iptables : NAT saindo por $LAB"
[ -z "$LAB" ] && { err "sem placa de internet detectada; preencha IF_R1_LAB em common/vars.env"; exit 1; }
iptables -t nat -C POSTROUTING -o "$LAB" -j MASQUERADE 2>/dev/null || \
  iptables -t nat -A POSTROUTING -o "$LAB" -j MASQUERADE
iptables -P FORWARD ACCEPT
ok "Source NAT ativo (MASQUERADE em $LAB)"
warn "Exemplo de Destination NAT (publicar o portal para o lab):"
echo "     iptables -t nat -A PREROUTING -i $LAB -p tcp --dport 80 -j DNAT --to 172.16.0.1:80"
iptables -t nat -L POSTROUTING -n --line-numbers | head -5
ok "etapa 03 concluida"
