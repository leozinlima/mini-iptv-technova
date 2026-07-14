/* ==========================================================================
   Mini-IPTV - Servidor OAuth2 / OpenID Connect (Authorization Server)
   Roda no host S, porta 9000. Node PURO (sem npm install).
   --------------------------------------------------------------------------
   Implementa de verdade:
     - Authorization Code flow + PKCE (S256)   [cliente publico: o frontend]
     - Tokens JWT assinados em RS256 (chave RSA) -> access_token + id_token
     - Endpoints padrao: /oauth/authorize, /oauth/token, /oauth/userinfo,
       /oauth/jwks e discovery /.well-known/openid-configuration
     - grant_type=password tambem aceito (para testes via curl)
   O backend (server.js) e' o RESOURCE SERVER: valida os tokens pela chave
   publica exposta em /oauth/jwks (ou lida do arquivo data/oauth_public.pem).
   ========================================================================== */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT   = 9000;
const ISSUER = process.env.ISSUER || 'http://iptv.tecnova.com.br';  // URL publica (via gateway R1)
const CLIENT_ID = 'miniiptv';
const KID    = 'miniiptv-key-1';
const DATA   = path.join(__dirname, 'data');
const DB     = path.join(DATA, 'db.json');
const PRIV   = path.join(DATA, 'oauth_private.pem');
const PUB    = path.join(DATA, 'oauth_public.pem');

// ---------- chave RSA (gera 1x e reaproveita) ----------
let privateKey, publicKey;
if (fs.existsSync(PRIV) && fs.existsSync(PUB)) {
  privateKey = fs.readFileSync(PRIV, 'utf8');
  publicKey  = fs.readFileSync(PUB, 'utf8');
} else {
  const kp = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  privateKey = kp.privateKey; publicKey = kp.publicKey;
  fs.writeFileSync(PRIV, privateKey); fs.writeFileSync(PUB, publicKey);
}
const JWK = crypto.createPublicKey(publicKey).export({ format: 'jwk' });
JWK.use = 'sig'; JWK.alg = 'RS256'; JWK.kid = KID;

// ---------- helpers ----------
const b64url = x => Buffer.from(x).toString('base64url');
const users = () => JSON.parse(fs.readFileSync(DB, 'utf8')).users;

function signRS(payload) {
  const header = { alg: 'RS256', typ: 'JWT', kid: KID };
  const body = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(payload));
  const sig = crypto.createSign('RSA-SHA256').update(body).sign(privateKey);
  return body + '.' + Buffer.from(sig).toString('base64url');
}
function verifyRS(token) {
  try {
    const [h, p, s] = token.split('.');
    const ok = crypto.createVerify('RSA-SHA256').update(h + '.' + p)
                 .verify(publicKey, Buffer.from(s, 'base64url'));
    if (!ok) return null;
    const pl = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (pl.exp && pl.exp < Math.floor(Date.now() / 1000)) return null;
    return pl;
  } catch (e) { return null; }
}
function issueTokens(u, scope) {
  const now = Math.floor(Date.now() / 1000), exp = now + 8 * 3600;
  const access = signRS({ iss: ISSUER, sub: u.username, aud: 'miniiptv-api',
    username: u.username, name: u.name, role: u.role, scope: scope || 'openid profile', iat: now, exp });
  const id = signRS({ iss: ISSUER, sub: u.username, aud: CLIENT_ID,
    name: u.name, role: u.role, iat: now, exp, auth_time: now });
  return { access_token: access, id_token: id, token_type: 'Bearer', expires_in: 28800, scope: scope || 'openid profile' };
}

// codigos de autorizacao pendentes (Authorization Code): code -> {...}
const codes = {};
function pkceOK(verifier, challenge) {
  return b64url(crypto.createHash('sha256').update(verifier).digest()) === challenge;
}

// ---------- pagina de login (servida no /oauth/authorize) ----------
function loginPage(q, erro) {
  const hid = ['client_id','redirect_uri','state','code_challenge','code_challenge_method','scope','response_type']
    .map(k => `<input type="hidden" name="${k}" value="${(q[k]||'').replace(/"/g,'&quot;')}">`).join('');
  return `<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Login - OAuth2 TechNova</title>
<style>body{font-family:system-ui,sans-serif;background:#0f1220;color:#e8eaf2;display:flex;
min-height:100vh;align-items:center;justify-content:center;margin:0}
.box{background:#191d2e;border:1px solid #2a3048;border-radius:12px;padding:28px;width:340px}
h1{font-size:20px;margin:0 0 4px}.s{color:#9aa;font-size:12px;margin-bottom:18px}
input.f{width:100%;box-sizing:border-box;padding:11px;margin:6px 0;border-radius:8px;
border:1px solid #333a55;background:#0f1220;color:#fff}
button{width:100%;background:#4a7dff;color:#fff;border:0;padding:11px;border-radius:8px;
cursor:pointer;font-weight:600;margin-top:8px}.e{color:#ff6b6b;font-size:13px;min-height:16px}
.d{color:#889;font-size:11px;margin-top:12px;text-align:center}</style></head>
<body><form class="box" method="POST" action="/oauth/authorize">
<h1>Servidor OAuth2 / OpenID</h1><div class="s">Mini-IPTV TechNova - autentique-se para continuar</div>
${hid}
<input class="f" name="username" placeholder="Usuario" autocomplete="username">
<input class="f" name="password" type="password" placeholder="Senha" autocomplete="current-password">
<div class="e">${erro||''}</div>
<button type="submit">Entrar</button>
<div class="d">Teste: joao/123, pedro/123, admin/admin</div>
</form></body></html>`;
}

// ---------- utilitarios HTTP ----------
function readBody(req) {
  return new Promise(r => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>r(d)); });
}
function parseForm(s) {
  const o = {};
  (s||'').split('&').forEach(kv => { const [k,v]=kv.split('='); if(k) o[decodeURIComponent(k)]=decodeURIComponent((v||'').replace(/\+/g,' ')); });
  return o;
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
  res.end(JSON.stringify(obj));
}
function html(res, code, body) {
  res.writeHead(code, { 'Content-Type':'text/html; charset=utf-8' }); res.end(body);
}

// ---------- servidor ----------
http.createServer(async (req, res) => {
  const u = new URL(req.url, ISSUER);
  const p = u.pathname;

  // Discovery OIDC
  if (p === '/.well-known/openid-configuration' && req.method === 'GET') {
    return json(res, 200, {
      issuer: ISSUER,
      authorization_endpoint: ISSUER + '/oauth/authorize',
      token_endpoint: ISSUER + '/oauth/token',
      userinfo_endpoint: ISSUER + '/oauth/userinfo',
      jwks_uri: ISSUER + '/oauth/jwks',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code','password'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid','profile'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none']
    });
  }

  // JWKS (chave publica)
  if (p === '/oauth/jwks' && req.method === 'GET') return json(res, 200, { keys: [JWK] });

  // Authorization endpoint - mostra a tela de login
  if (p === '/oauth/authorize' && req.method === 'GET') {
    const q = Object.fromEntries(u.searchParams.entries());
    return html(res, 200, loginPage(q, ''));
  }

  // Authorization endpoint - recebe login e devolve um "code" via redirect
  if (p === '/oauth/authorize' && req.method === 'POST') {
    const f = parseForm(await readBody(req));
    const user = users().find(x => x.username === f.username && x.password === f.password);
    if (!user) return html(res, 401, loginPage(f, 'Usuario ou senha invalidos'));
    if (!f.redirect_uri) return json(res, 400, { error: 'invalid_request', desc: 'redirect_uri ausente' });
    const code = crypto.randomBytes(24).toString('hex');
    codes[code] = { username: user.username, challenge: f.code_challenge || '',
      redirect_uri: f.redirect_uri, scope: f.scope || 'openid profile',
      exp: Date.now() + 300000 };
    const sep = f.redirect_uri.includes('?') ? '&' : '?';
    const loc = f.redirect_uri + sep + 'code=' + code + (f.state ? '&state=' + encodeURIComponent(f.state) : '');
    res.writeHead(302, { Location: loc }); return res.end();
  }

  // Token endpoint
  if (p === '/oauth/token' && req.method === 'POST') {
    const ct = req.headers['content-type'] || '';
    const raw = await readBody(req);
    const f = ct.includes('application/json') ? JSON.parse(raw || '{}') : parseForm(raw);

    if (f.grant_type === 'authorization_code') {
      const c = codes[f.code];
      if (!c || c.exp < Date.now()) return json(res, 400, { error: 'invalid_grant', desc: 'codigo invalido/expirado' });
      if (c.redirect_uri !== f.redirect_uri) return json(res, 400, { error: 'invalid_grant', desc: 'redirect_uri diferente' });
      if (c.challenge && !pkceOK(f.code_verifier || '', c.challenge))
        return json(res, 400, { error: 'invalid_grant', desc: 'PKCE falhou' });
      delete codes[f.code];
      const user = users().find(x => x.username === c.username);
      return json(res, 200, issueTokens(user, c.scope));
    }

    if (f.grant_type === 'password') {   // atalho para testes/curl
      const user = users().find(x => x.username === f.username && x.password === f.password);
      if (!user) return json(res, 401, { error: 'invalid_grant', desc: 'credenciais invalidas' });
      return json(res, 200, issueTokens(user, f.scope));
    }

    return json(res, 400, { error: 'unsupported_grant_type' });
  }

  // UserInfo (OIDC)
  if (p === '/oauth/userinfo' && req.method === 'GET') {
    const h = req.headers['authorization'] || '';
    const pl = verifyRS(h.startsWith('Bearer ') ? h.slice(7) : '');
    if (!pl) return json(res, 401, { error: 'invalid_token' });
    return json(res, 200, { sub: pl.sub, name: pl.name, role: pl.role, preferred_username: pl.username });
  }

  json(res, 404, { error: 'not_found' });
}).listen(PORT, () => {
  console.log('==================================================');
  console.log(' Servidor OAuth2/OpenID (host S) na porta', PORT);
  console.log(' Issuer:', ISSUER, '| alg: RS256 | PKCE: S256');
  console.log(' Discovery: /.well-known/openid-configuration');
  console.log('==================================================');
});
