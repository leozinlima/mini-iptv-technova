#!/usr/bin/env bash
# ==========================================================================
# Source NAT + roteamento -> roda no host R1
# R1 tem 3 "lados":
#   LAN1  = ligada a S            (172.16.0.1/24)   -> ex: enp2s0
#   LAB   = ligada a rede do Lab  (DHCP do laboratorio, unico com Internet)
#   ppp0  = enlace WAN serial ate R2 (10.0.0.1)
# Objetivo: X, Y, R2 e S acessam a Internet SAINDO pela interface do laboratorio
# (Source NAT / MASQUERADE), como pede o enunciado.
# --------------------------------------------------------------------------
# EDITE os nomes das interfaces conforme  ip -br link
# ==========================================================================
LAN1=enp2s0                 # placa de R1 ligada a S (LAN #1)
LAB=enp3s0                  # placa de R1 ligada a rede do LABORATORIO (tem Internet)

# 1) Liga o roteamento de pacotes (IPv4 forwarding)
sudo sysctl -w net.ipv4.ip_forward=1

# 2) rp_filter desligado (necessario para multicast/rotas assimetricas)
sudo sysctl -w net.ipv4.conf.all.rp_filter=0
sudo sysctl -w net.ipv4.conf.default.rp_filter=0

# 3) SOURCE NAT: tudo que sai para a rede do laboratorio "veste" o IP do LAB
sudo iptables -t nat -A POSTROUTING -o "$LAB" -j MASQUERADE

# 4) Libera o encaminhamento
sudo iptables -A FORWARD -i "$LAB" -o "$LAN1" -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
sudo iptables -A FORWARD -i "$LAN1" -o "$LAB" -j ACCEPT
sudo iptables -A FORWARD -i ppp0    -o "$LAB" -j ACCEPT
sudo iptables -A FORWARD -i "$LAB"  -o ppp0   -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
sudo iptables -P FORWARD ACCEPT

echo ">> NAT e forwarding configurados em R1."
echo ">> (exemplo de DESTINATION NAT, se quiser publicar o portal:"
echo "    sudo iptables -t nat -A PREROUTING -i $LAB -p tcp --dport 80 -j DNAT --to 172.16.0.1:80 )"
sudo iptables -t nat -L POSTROUTING -n --line-numbers
