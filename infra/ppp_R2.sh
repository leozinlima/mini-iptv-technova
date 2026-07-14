#!/usr/bin/env bash
# ==========================================================================
# Enlace WAN PPP serial -> lado R2  (taxa exigida: 115200 bps)
# R2 = 10.0.0.2   |   R1 = 10.0.0.1
# Deixe este terminal ABERTO (pppd roda com nodetach).
# ==========================================================================
SERIAL=/dev/ttyUSB0     # ajuste conforme  ls /dev/ttyUSB*  (pode ser ttyS0)

sudo pppd "$SERIAL" 115200 10.0.0.2:10.0.0.1 \
  noauth local nocrtscts lock nodetach nodefaultroute debug

# Depois que o ppp0 subir, em OUTRO terminal do R2 rode:
#   sudo ip route replace 172.16.0.0/16 via 10.0.0.1 dev ppp0
#   sudo ip route replace default via 10.0.0.1 dev ppp0     # Internet via R1 (NAT)
#   sudo sysctl -w net.ipv4.conf.ppp0.rp_filter=0
