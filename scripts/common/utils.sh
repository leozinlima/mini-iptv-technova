#!/usr/bin/env bash
# ==========================================================================
# Funções compartilhadas. Cada script de etapa começa com:
#     source "$(dirname "$0")/../common/utils.sh"
# Isso carrega as variáveis (vars.env) e as funções abaixo.
# ==========================================================================

_UTILS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# carrega variáveis
[ -f "$_UTILS_DIR/vars.env" ] && source "$_UTILS_DIR/vars.env"

# Raiz do projeto Mini-IPTV (dois níveis acima de common/)
PROJ="$(cd "$_UTILS_DIR/../.." && pwd)"
BACKEND="$PROJ/backend"
FRONTEND="$PROJ/frontend"
APIGW="$PROJ/apigateway"

# ---------- saída bonita ----------
log()  { echo -e ">> $*"; }
ok()   { echo -e "   [OK] $*"; }
warn() { echo -e "   [!] $*"; }
err()  { echo -e "   [ERRO] $*"; }
hr()   { echo "------------------------------------------------------------"; }
need_root() { [ "$(id -u)" -eq 0 ] || { echo "Rode com sudo:  sudo bash $0"; exit 1; }; }

# ---------- detecção de interfaces ----------
first_eth()  { ip -o link show | awk -F': ' '$2 ~ /^(en|eth)/ {print $2; exit}'; }
all_eth()    { ip -o link show | awk -F': ' '$2 ~ /^(en|eth)/ {print $2}'; }
inet_iface() { ip route get 8.8.8.8 2>/dev/null | grep -oP 'dev \K\S+'; }
detect_serial() {
  [ -n "$SERIAL" ] && { echo "$SERIAL"; return; }
  [ -e /dev/ttyUSB0 ] && echo /dev/ttyUSB0 || echo /dev/ttyS0
}

# ---------- rede NetworkManager-safe (Ubuntu Desktop) ----------
tem_nm() { command -v nmcli >/dev/null 2>&1 && systemctl is-active --quiet NetworkManager; }

config_static() {   # $1=placa  $2=ip/cidr  $3=gateway(opcional)  $4=dns(opcional)
  local IF="$1" CIDR="$2" GW="${3:-}" DNS="${4:-}"
  if tem_nm; then
    nmcli con delete "iptv-$IF" >/dev/null 2>&1
    local a=(con add type ethernet ifname "$IF" con-name "iptv-$IF" ipv4.method manual ipv4.addresses "$CIDR" ipv6.method disabled)
    [ -n "$GW" ] && a+=(ipv4.gateway "$GW")
    [ -n "$DNS" ] && a+=(ipv4.dns "$DNS")
    nmcli "${a[@]}" >/dev/null 2>&1 && nmcli con up "iptv-$IF" >/dev/null 2>&1
  else
    ip addr flush dev "$IF"; ip addr add "$CIDR" dev "$IF"; ip link set "$IF" up
    [ -n "$GW" ] && ip route replace default via "$GW" dev "$IF"
    [ -n "$DNS" ] && { rm -f /etc/resolv.conf; echo "nameserver $DNS" > /etc/resolv.conf; }
  fi
  ip link set "$IF" multicast on
}

config_dhcp() {   # $1=placa  -> pega IP por DHCP
  local IF="$1"
  if tem_nm; then
    nmcli dev set "$IF" managed yes >/dev/null 2>&1
    nmcli con delete "iptv-$IF" >/dev/null 2>&1
    nmcli con add type ethernet ifname "$IF" con-name "iptv-$IF" ipv4.method auto ipv6.method disabled >/dev/null 2>&1
    nmcli con up "iptv-$IF" >/dev/null 2>&1 || nmcli dev connect "$IF" >/dev/null 2>&1
  else
    ip link set "$IF" up; dhclient -r "$IF" 2>/dev/null; dhclient "$IF" 2>/dev/null
  fi
  ip link set "$IF" multicast on
}

# ---------- PPP ----------
wait_ppp() {  # espera ppp0 subir (ate 30s)
  local i; for i in $(seq 1 30); do
    ip -br addr show ppp0 2>/dev/null | grep -q '10.0.0' && return 0; sleep 1
  done; return 1
}
