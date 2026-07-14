#!/usr/bin/env bash
# ==========================================================================
# Roteamento MULTICAST -> host R2
# Recebe o fluxo WAN pelo PPP e entrega na LAN #2 (X e Y).
#   entrada: ppp0   ->  saida: LAN2 (239.20.<grupo>.<canal>)
# ==========================================================================
LAN2=enxec9a0c1f7a88     # placa de R2 ligada ao switch (X e Y). Ajuste!
GRUPO=4
S=172.16.0.2

sudo ip link set ppp0  multicast on
sudo ip link set "$LAN2" multicast on

sudo systemctl restart smcroute 2>/dev/null || sudo smcrouted
sudo smcroutectl flush 2>/dev/null

for CANAL in $(seq 1 18); do
  sudo smcroutectl add ppp0 $S 239.20.$GRUPO.$CANAL "$LAN2" 2>/dev/null \
    || sudo smcroute -a ppp0 $S 239.20.$GRUPO.$CANAL "$LAN2"
done

sudo smcroutectl show 2>/dev/null
ip mroute
