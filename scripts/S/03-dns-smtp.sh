#!/usr/bin/env bash
# S | ETAPA 03 - DNS (BIND9) + e-mail seguro (Postfix/Dovecot)
source "$(dirname "$0")/../common/utils.sh"; need_root
hr; log "S | 03-dns-smtp : configurando DNS e e-mail"

# ---------- DNS ----------
tee /etc/bind/named.conf.local >/dev/null <<'EOF'
zone "tecnova.com.br"          { type master; file "/etc/bind/db.tecnova"; };
zone "0.16.172.in-addr.arpa"   { type master; file "/etc/bind/db.rev1"; };
zone "0.168.192.in-addr.arpa"  { type master; file "/etc/bind/db.rev2"; };
EOF
tee /etc/bind/db.tecnova >/dev/null <<'EOF'
$TTL 86400
@   IN SOA s.tecnova.com.br. root.s.tecnova.com.br. ( 2026070901 21600 1800 604800 86400 )
    IN NS  s.tecnova.com.br.
    IN MX  10 s.tecnova.com.br.
s     IN A 172.16.0.2
dns   IN A 172.16.0.2
mail  IN A 172.16.0.2
iptv  IN A 172.16.0.1
r1    IN A 172.16.0.1
r2    IN A 192.168.0.1
EOF
tee /etc/bind/db.rev1 >/dev/null <<'EOF'
$TTL 86400
@ IN SOA s.tecnova.com.br. root.s.tecnova.com.br. ( 2026070901 21600 1800 604800 86400 )
  IN NS s.tecnova.com.br.
2 IN PTR s.tecnova.com.br.
1 IN PTR r1.tecnova.com.br.
EOF
tee /etc/bind/db.rev2 >/dev/null <<'EOF'
$TTL 86400
@ IN SOA s.tecnova.com.br. root.s.tecnova.com.br. ( 2026070901 21600 1800 604800 86400 )
  IN NS s.tecnova.com.br.
1 IN PTR r2.tecnova.com.br.
EOF
tee /etc/bind/named.conf.options >/dev/null <<'EOF'
options {
    directory "/var/cache/bind";
    recursion yes;
    allow-query     { localhost; 172.16.0.0/16; 192.168.0.0/24; };
    allow-recursion { localhost; 172.16.0.0/16; 192.168.0.0/24; };
    forwarders { 8.8.8.8; 1.1.1.1; };
    dnssec-validation no;
    listen-on { any; };
    listen-on-v6 { none; };
};
EOF
named-checkzone tecnova.com.br /etc/bind/db.tecnova >/dev/null && ok "zona DNS valida"
systemctl restart bind9 2>/dev/null || systemctl restart named 2>/dev/null

# ---------- SMTP seguro + POP3/IMAP ----------
echo "tecnova.com.br" > /etc/mailname
postconf -e "myhostname = s.tecnova.com.br" "mydomain = tecnova.com.br" \
  "myorigin = /etc/mailname" "inet_interfaces = all" "inet_protocols = ipv4" \
  "mydestination = \$myhostname, localhost.\$mydomain, localhost, \$mydomain" \
  "mynetworks = 127.0.0.0/8 172.16.0.0/16 192.168.0.0/24" \
  "home_mailbox = Maildir/" \
  "smtpd_tls_security_level = may" "smtp_tls_security_level = may" \
  "smtpd_tls_cert_file = /etc/ssl/certs/ssl-cert-snakeoil.pem" \
  "smtpd_tls_key_file = /etc/ssl/private/ssl-cert-snakeoil.key" \
  "smtpd_sasl_type = dovecot" "smtpd_sasl_path = private/auth" \
  "smtpd_sasl_auth_enable = yes" 2>/dev/null
postconf -M submission/inet="submission inet n - y - - smtpd" 2>/dev/null
postconf -P "submission/inet/syslog_name=postfix/submission" \
           "submission/inet/smtpd_tls_security_level=encrypt" \
           "submission/inet/smtpd_sasl_auth_enable=yes" \
           "submission/inet/smtpd_client_restrictions=permit_sasl_authenticated,reject" 2>/dev/null
sed -i 's|^#*mail_location =.*|mail_location = maildir:~/Maildir|' /etc/dovecot/conf.d/10-mail.conf 2>/dev/null
tee /etc/dovecot/conf.d/99-iptv.conf >/dev/null <<'EOF'
disable_plaintext_auth = no
ssl = yes
service auth {
  unix_listener /var/spool/postfix/private/auth { mode = 0660
    user = postfix
    group = postfix }
}
EOF
systemctl restart dovecot 2>/dev/null; systemctl restart postfix 2>/dev/null
SUDO_U="${SUDO_USER:-aluno}"
sudo -u "$SUDO_U" mkdir -p "/home/$SUDO_U/Maildir/new" "/home/$SUDO_U/Maildir/cur" "/home/$SUDO_U/Maildir/tmp" 2>/dev/null
ok "etapa 03 concluida (DNS + e-mail seguro)"
