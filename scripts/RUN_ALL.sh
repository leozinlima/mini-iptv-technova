#!/usr/bin/env bash
# ==========================================================================
# Roda TODAS as etapas de uma máquina, em ordem.
# USO:  sudo bash scripts/RUN_ALL.sh S       (ou R1, R2, X, Y)
# (para rodar por etapa, chame os scripts NN-*.sh individualmente)
# ==========================================================================
HERE="$(cd "$(dirname "$0")" && pwd)"
M="${1:-}"
case "$M" in
  S|R1|R2|X|Y) : ;;
  *) echo "USO: sudo bash $0 <S|R1|R2|X|Y>"; exit 1 ;;
esac
DIR="$HERE/$M"
[ -d "$DIR" ] || { echo "Pasta $DIR não existe"; exit 1; }
echo "==== Rodando TODAS as etapas de $M ===="
for s in "$DIR"/[0-9]*.sh; do
  [ "$(basename "$s")" = "99-tests.sh" ] && continue   # testes por último
  echo ""; echo ">>>>> $(basename "$s")"
  sudo bash "$s" || { echo "!! Falha em $(basename "$s"). Corrija e rode de novo."; exit 1; }
done
echo ""; echo ">>>>> 99-tests.sh"
[ -f "$DIR/99-tests.sh" ] && sudo bash "$DIR/99-tests.sh"
echo "==== $M concluído ===="
