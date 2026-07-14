#!/usr/bin/env bash
# ==========================================================================
# Converte UM video original em versao de baixa qualidade (compatível com
# o enlace WAN de 115200 bps). Este e' EXATAMENTE o comando do enunciado.
#
# Uso:   bash converter_ld.sh  v_original.mp4  v_wan.mp4
#        (arquivos ficam na pasta videos/)
# ==========================================================================
set -e
cd "$(dirname "$0")/videos"

ENTRADA="${1:-v_original.mp4}"
SAIDA="${2:-v_wan.mp4}"

echo ">> Convertendo $ENTRADA -> $SAIDA (perfil WAN115K)"
ffmpeg -i "$ENTRADA" -c:v libx264 -b:v 80k -r 10 -s 320x240 \
       -x264-params keyint=10:min-keyint=10:scenecut=0 \
       -c:a aac -b:a 16k -ac 1 -ar 22050 "$SAIDA"

echo ">> Metadados do arquivo gerado (ffprobe):"
ffprobe -v quiet -print_format json -show_format -show_streams "$SAIDA" \
  | grep -E '"duration"|"bit_rate"|"width"|"height"|"codec_name"' || true
