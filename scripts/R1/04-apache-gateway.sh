#!/usr/bin/env bash
# R1 | ETAPA 04 - Apache: página da intranet + API Gateway (proxy reverso p/ S)
source "$(dirname "$0")/../common/utils.sh"; need_root
hr; log "R1 | 04-apache-gateway : publicando site + proxy reverso"
mkdir -p /var/www/iptv
cp -r "$FRONTEND/"* /var/www/iptv/ 2>/dev/null && ok "frontend copiado p/ /var/www/iptv"
cp "$APIGW/iptv-gateway.conf" /etc/apache2/sites-available/iptv.conf 2>/dev/null
a2ensite iptv >/dev/null 2>&1; a2dissite 000-default >/dev/null 2>&1
a2enmod proxy proxy_http headers >/dev/null 2>&1
systemctl reload apache2 2>/dev/null || systemctl restart apache2 2>/dev/null
ss -ltn 2>/dev/null | grep -q ':80' && ok "Apache no ar (porta 80)" || warn "Apache não respondeu"
echo "  Portal: http://iptv.tecnova.com.br   (proxy /api e /oauth -> S)"
ok "etapa 04 concluida"
