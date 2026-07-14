#!/usr/bin/env bash
# X | ETAPA 02 - VLC Client + abre o portal no navegador  [use o MESMO no Y]
source "$(dirname "$0")/../common/utils.sh"; need_root
hr; log "CLIENTE | 02-client-app-vlc"
DEBIAN_FRONTEND=noninteractive apt-get install -y vlc tcpdump 2>/dev/null && ok "VLC instalado" || warn "sem internet? (o VLC talvez já esteja)"

# --- registra o "abrir VLC automatico" ao clicar Assistir no site (esquema iptv://) ---
U="${SUDO_USER:-$(logname 2>/dev/null)}"
UHOME="$(getent passwd "$U" | cut -d: -f6)"
tee /usr/local/bin/abrir-vlc >/dev/null <<'EOF'
#!/usr/bin/env bash
# recebe iptv://239.20.4.1:5004  ->  abre no VLC
addr="${1#iptv://}"; addr="${addr%/}"
exec vlc --network-caching=1500 "udp://@${addr}"
EOF
chmod +x /usr/local/bin/abrir-vlc
sudo -u "$U" mkdir -p "$UHOME/.local/share/applications"
sudo -u "$U" tee "$UHOME/.local/share/applications/iptv-vlc.desktop" >/dev/null <<'EOF'
[Desktop Entry]
Type=Application
Name=IPTV VLC
Exec=/usr/local/bin/abrir-vlc %u
MimeType=x-scheme-handler/iptv;
NoDisplay=true
Terminal=false
EOF
sudo -u "$U" xdg-mime default iptv-vlc.desktop x-scheme-handler/iptv 2>/dev/null
sudo -u "$U" update-desktop-database "$UHOME/.local/share/applications" 2>/dev/null
ok "abertura automatica do VLC registrada (esquema iptv://)"

echo "  Portal Mini-IPTV:  http://iptv.tecnova.com.br   (ou http://172.16.0.1)"
echo "  Login de teste:    joao/123 (WAN)   |   admin/admin (painel)"
echo "  Para ver o vídeo, o site mostra o endereço udp://@239.20.4.<canal>:5004"
echo "  que você abre no VLC (Mídia > Abrir Fluxo de Rede) ou pela playlist .m3u."

# tenta abrir o navegador na estação gráfica do usuário
U="${SUDO_USER:-$(logname 2>/dev/null)}"
if [ -n "$U" ] && command -v xdg-open >/dev/null 2>&1; then
  sudo -u "$U" env DISPLAY=:0 xdg-open "http://iptv.tecnova.com.br" >/dev/null 2>&1 &
  ok "tentei abrir o navegador em http://iptv.tecnova.com.br"
fi
ok "etapa 02 concluida"
