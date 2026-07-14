#!/usr/bin/env bash
# ==========================================================================
# Roteamento MULTICAST -> host R1
# Encaminha os fluxos que saem de S (172.16.0.2):
#   - perfil WAN (239.20.<grupo>.<canal>) : LAN1 -> ppp0   (vai para R2/X/Y)
#   - perfil LAN (239.10.<grupo>.<canal>) : LAN1 -> LAB    (vai para Z/W do laboratorio)
# Ajuste os nomes das interfaces e o GRUPO.
# ==========================================================================
LAN1=enp2s0        # placa de R1 ligada a S
LAB=enp3s0         # placa de R1 ligada a rede do laboratorio (Z e W)
GRUPO=4
S=172.16.0.2

sudo ip link set "$LAN1" multicast on
sudo ip link set "$LAB"  multicast on
sudo ip link set ppp0    multicast on

sudo systemctl restart smcroute 2>/dev/null || sudo smcrouted
sudo smcroutectl flush 2>/dev/null

for CANAL in $(seq 1 18); do
  # WAN115K: 239.20.grupo.canal  ->  sai pelo PPP para R2
  sudo smcroutectl add "$LAN1" $S 239.20.$GRUPO.$CANAL ppp0 2>/dev/null \
    || sudo smcroute -a "$LAN1" $S 239.20.$GRUPO.$CANAL ppp0
  # LAN: 239.10.grupo.canal  ->  sai para a rede do laboratorio (Z e W)
  sudo smcroutectl add "$LAN1" $S 239.10.$GRUPO.$CANAL "$LAB" 2>/dev/null \
    || sudo smcroute -a "$LAN1" $S 239.10.$GRUPO.$CANAL "$LAB"
done

sudo smcroutectl show 2>/dev/null
ip mroute
