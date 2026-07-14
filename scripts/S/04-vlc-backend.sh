#!/usr/bin/env bash
# S | ETAPA 04 - vídeos + servidor OAuth2 + backend (VLC Server é acionado por ele)
source "$(dirname "$0")/../common/utils.sh"; need_root
hr; log "S | 04-vlc-backend : aplicação Mini-IPTV"

# vídeos (só gera se faltarem; normalmente já vêm no pendrive)
if command -v ffmpeg >/dev/null 2>&1 && [ ! -f "$BACKEND/videos/filme1_hd.mp4" ]; then
  log "gerando vídeos de teste (pode demorar)..."
  bash "$BACKEND/gerar_videos.sh" >/dev/null 2>&1 && ok "vídeos gerados" || warn "falha ao gerar vídeos"
else
  ok "vídeos já presentes em backend/videos"
fi

if ! command -v node >/dev/null 2>&1; then
  err "Node não instalado. Rode a etapa 01 com internet."; exit 1
fi
pkill -f "authserver.js" 2>/dev/null; fuser -k 3000/tcp 2>/dev/null; sleep 1
log "subindo servidor OAuth2/OpenID (porta 9000)..."
( cd "$BACKEND" && ISSUER="http://iptv.tecnova.com.br" setsid nohup node authserver.js > /tmp/iptv-oauth.log 2>&1 & )
sleep 1
log "subindo backend Mini-IPTV (porta 3000)..."
( cd "$BACKEND" && setsid nohup node server.js > /tmp/iptv-backend.log 2>&1 & )
sleep 2
ss -ltn 2>/dev/null | grep -q :9000 && ok "OAuth :9000 no ar" || warn "OAuth não subiu (veja /tmp/iptv-oauth.log)"
ss -ltn 2>/dev/null | grep -q :3000 && ok "backend :3000 no ar" || warn "backend não subiu (veja /tmp/iptv-backend.log)"
ok "etapa 04 concluida"
