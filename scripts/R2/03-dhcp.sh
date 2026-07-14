#!/usr/bin/env bash
# R2 | ETAPA 03 - DHCP Server (atende X e Y na LAN #2)
source "$(dirname "$0")/../common/utils.sh"; need_root
NET_INET="$(inet_iface)"
LAN2="${IF_R2_LAN2:-$(all_eth | grep -v -x "$NET_INET" | head -1)}"
[ -z "$LAN2" ] && LAN2="$(first_eth)"
hr; log "R2 | 03-dhcp : servindo DHCP na $LAN2"
tee /etc/dhcp/dhcpd.conf >/dev/null <<'EOF'
option domain-name "tecnova.com.br";
option domain-name-servers 172.16.0.2;
default-lease-time 600; max-lease-time 7200; authoritative;
subnet 192.168.0.0 netmask 255.255.255.0 {
  range 192.168.0.100 192.168.0.200;
  option routers 192.168.0.1;
  option subnet-mask 255.255.255.0;
  option broadcast-address 192.168.0.255;
  option domain-name-servers 172.16.0.2;
}
EOF
sed -i "s/^INTERFACESv4=.*/INTERFACESv4=\"$LAN2\"/" /etc/default/isc-dhcp-server 2>/dev/null
grep -q INTERFACESv4 /etc/default/isc-dhcp-server 2>/dev/null || echo "INTERFACESv4=\"$LAN2\"" >> /etc/default/isc-dhcp-server
systemctl restart isc-dhcp-server 2>/dev/null && ok "DHCP ativo" || warn "DHCP falhou (confira a placa)"
ok "etapa 03 concluida"
