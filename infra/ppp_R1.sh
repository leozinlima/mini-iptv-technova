#!/usr/bin/env bash
# ==========================================================================
# Enlace WAN PPP serial -> lado R1  (taxa exigida: 115200 bps)
# R1 = 10.0.0.1   |   R2 = 10.0.0.2
# Deixe este terminal ABERTO (pppd roda com nodetach).
# ==========================================================================
SERIAL=/dev/ttyUSB0     # ajuste conforme  ls /dev/ttyUSB*  (pode ser ttyS0)

sudo pppd "$SERIAL" 115200 10.0.0.1:10.0.0.2 \
  noauth local nocrtscts lock nodetach nodefaultroute debug

# Depois que o ppp0 subir, em OUTRO terminal do R1 rode:
#   sudo ip route replace 192.168.0.0/24 via 10.0.0.2 dev ppp0
#   sudo sysctl -w net.ipv4.conf.ppp0.rp_filter=0
