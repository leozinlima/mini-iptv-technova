#!/usr/bin/env bash
# ==========================================================================
# CONTROLE DE BANDA com a API TC (traffic control) - exigido no video/relatorio.
#
# O enlace PPP ja limita "de fato" a WAN em 115200 bps. Ainda assim, o TC
# permite DEMONSTRAR o gerenciamento de banda de forma explicita e mensuravel.
# Aplique no host R2, na interface da LAN #2 (saida para X e Y), OU no ppp0.
# ==========================================================================
IFACE=${1:-enxec9a0c1f7a88}   # interface a limitar (LAN2 de R2). Ajuste!

case "${2:-aplicar}" in
  aplicar)
    # tbf = Token Bucket Filter. ~110 kbit (proximo dos 115200 bps do enlace).
    sudo tc qdisc replace dev "$IFACE" root tbf rate 110kbit latency 50ms burst 1540
    echo ">> Limite de 110kbit aplicado em $IFACE"
    ;;
  mostrar)
    tc -s qdisc show dev "$IFACE"     # mostra rate, drops, overlimits
    ;;
  remover)
    sudo tc qdisc del dev "$IFACE" root 2>/dev/null
    echo ">> Limite removido de $IFACE"
    ;;
  *)
    echo "uso: bash tc_controle_banda.sh <iface> [aplicar|mostrar|remover]"
    ;;
esac
