/* ==========================================================================
   Mini-IPTV - Backend (roda no host S)
   FRC 2026.1 - Prof. Fernando W. Cruz - Grupo TechNova
   --------------------------------------------------------------------------
   Feito em Node.js PURO (sem npm install, sem internet). Usa somente modulos
   nativos: http, crypto, fs, path, child_process.
   Responsabilidades:
     - Autenticacao (login -> token JWT)  [papel de servidor OAuth2 simplificado]
     - Lista de canais, entrar/sair de canal, playlist .m3u
     - Regras dos dois perfis: LAN (qualidade original) e WAN115K (baixa, 1 por vez)
     - Liga/desliga o VLC Server (cvlc) para transmitir em multicast
     - Painel de Admin: usuarios conectados, canais ativos, processos VLC, etc.
   ========================================================================== */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

// ----------------------- CONFIGURACAO DO GRUPO ----------------------------
const GRUPO      = 4;                 // ID do grupo (2o... na verdade 3o byte do multicast)
const PORT       = 3000;              // porta do backend
const MCAST_PORT = 5004;             // porta UDP dos fluxos multicast
const S_IP       = '172.16.0.2';     // IP do host S (para montar as URLs udp://)
const LAN2_PREFIX = '192.168.0.';    // quem tem IP assim e' cliente WAN115K (X, Y)
const VIDEO_DIR  = path.join(__dirname, 'videos');
const DATA_FILE  = path.join(__dirname, 'data', 'db.json');
const FRONT_DIR  = path.join(__dirname, '..', 'frontend');

// ----------------------- BANCO DE DADOS (arquivo JSON) --------------------
function loadDB() { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function saveDB(db) { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
let db = loadDB();

// Endereco multicast do canal conforme a convencao 239.<perfil>.<grupo>.<canal>
function mcastFor(profile, ch) {
  const perfil = (profile === 'LAN') ? 10 : 20;
  return `239.${perfil}.${GRUPO}.${ch.number}`;
}
function udpUrl(profile, ch) { return `udp://@${mcastFor(profile, ch)}:${MCAST_PORT}`; }

// Video vinculado a um canal e o arquivo certo para cada perfil
function videoOf(ch) { return db.videos.find(v => v.id === ch.videoId) || null; }
function fileFor(profile, ch) {
  const v = videoOf(ch);
  if (!v) return '';
  return (profile === 'LAN') ? v.original : v.wan;   // LAN=original, WAN=baixa qualidade
}

// Estado das conversoes ffmpeg em andamento: videoId -> 'convertendo'|'ok'|'erro'
const convStatus = {};

// -------------- Validacao de JWT RS256 (tokens emitidos pelo authserver) ----
// Este backend e' o RESOURCE SERVER: nao emite token, so valida o que o
// servidor OAuth2/OpenID (authserver.js) assinou, usando a chave publica RSA.
const OAUTH_PUB_PATH = path.join(__dirname, 'data', 'oauth_public.pem');
let OAUTH_PUB = null;
function pubKey() {
  if (!OAUTH_PUB && fs.existsSync(OAUTH_PUB_PATH)) OAUTH_PUB = fs.readFileSync(OAUTH_PUB_PATH, 'utf8');
  return OAUTH_PUB;
}
function verifyJWT(token) {
  try {
    const key = pubKey();
    if (!key || !token) return null;
    const [h, p, s] = token.split('.');
    const ok = crypto.createVerify('RSA-SHA256').update(h + '.' + p)
                 .verify(key, Buffer.from(s, 'base64url'));
    if (!ok) return null;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now()/1000)) return null;
    return payload;
  } catch (e) { return null; }
}

// ----------------------- ESTADO EM MEMORIA --------------------------------
// streams: chave "PERFIL:canalId" -> { proc, mcast, viewers:Set<username>, profile, channelId, startedAt }
const streams = {};
// userWatching: username -> "PERFIL:canalId" (o que a pessoa esta assistindo agora)
const userWatching = {};
// sessions: username -> timestamp do ultimo acesso (para "usuarios conectados")
const sessions = {};
// lastBeat: username -> timestamp do ultimo "batimento" (sinal de que ainda esta assistindo)
const lastBeat = {};
const BEAT_TIMEOUT = 45000;   // sem batimento por 45s -> considera que saiu

function keyOf(profile, channelId) { return profile + ':' + channelId; }

// Sweep: remove quem parou de dar sinal de vida (fechou a aba / foi embora) e
// libera o canal se ninguem mais estiver assistindo.
setInterval(() => {
  const now = Date.now();
  for (const username of Object.keys(userWatching)) {
    if (now - (lastBeat[username] || 0) > BEAT_TIMEOUT) {
      console.log('[timeout] ' + username + ' parou de responder -> saindo do canal');
      leaveCurrent(username);
    }
  }
}, 20000);

// Descobre o perfil do cliente pelo IP de origem (X-Forwarded-For vem do Apache/R1).
// Se QUALQUER endereco visto for da LAN2 (192.168.0.x), e' cliente WAN115K.
function profileOf(req) {
  const cands = (req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim());
  cands.push(req.socket.remoteAddress || '');
  return cands.map(ip => ip.replace('::ffff:', ''))
              .some(ip => ip.startsWith(LAN2_PREFIX)) ? 'WAN115K' : 'LAN';
}

// Canal WAN atualmente em uso (regra: so um video WAN por vez em toda a rede)
function activeWanKey() {
  return Object.keys(streams).find(k => k.startsWith('WAN115K:') && streams[k].viewers.size > 0);
}

// ----------------------- CONTROLE DO VLC SERVER ---------------------------
function startStream(profile, ch) {
  const key = keyOf(profile, ch.id);
  if (streams[key]) return streams[key];
  const file = fileFor(profile, ch);
  const full = path.join(VIDEO_DIR, file);
  const mcast = mcastFor(profile, ch);
  const sout = `#standard{access=udp,mux=ts,dst=${mcast}:${MCAST_PORT}}`;
  const args = ['-vvv', full, '--loop', '--sout', sout, '--ttl', '16', '--sout-keep'];
  // O VLC se recusa a rodar como root. Se o backend estiver como root (rodado
  // com sudo), soltamos o privilegio para o usuario original (SUDO_UID).
  const opts = { stdio: 'ignore' };
  if (process.getuid && process.getuid() === 0) {
    opts.uid = parseInt(process.env.SUDO_UID || '1000', 10);
    opts.gid = parseInt(process.env.SUDO_GID || '1000', 10);
    opts.env = { ...process.env, HOME: '/tmp' };   // VLC precisa de um HOME gravavel
  }
  let proc = null;
  try {
    proc = spawn('cvlc', args, opts);
    proc.on('error', e => { console.log('[AVISO] cvlc falhou (' + e.message + ') - fluxo', mcast, 'apenas registrado.'); });
  } catch (e) {
    console.log('[AVISO] Falha ao iniciar cvlc:', e.message);
  }
  streams[key] = { proc, mcast, file, viewers: new Set(), profile, channelId: ch.id, startedAt: Date.now() };
  console.log(`[VLC] Iniciado ${profile} canal ${ch.number} -> ${mcast}:${MCAST_PORT} (${file})`);
  return streams[key];
}

function stopStream(key) {
  const s = streams[key];
  if (!s) return;
  try { if (s.proc && s.proc.pid) process.kill(s.proc.pid); } catch (e) {}
  console.log(`[VLC] Parado ${key} -> ${s.mcast}`);
  delete streams[key];
}

// Tira o usuario do canal que ele estava assistindo
function leaveCurrent(username) {
  const cur = userWatching[username];
  if (!cur) return;
  delete userWatching[username];
  const s = streams[cur];
  if (!s) return;
  s.viewers.delete(username);
  if (s.viewers.size === 0) stopStream(cur);  // ultimo saiu -> desliga o VLC
}

// ----------------------- HTTP: utilitarios --------------------------------
function send(res, code, obj, type) {
  if (type === 'text') {
    res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(obj);
  } else {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  }
}
function readBody(req) {
  return new Promise(resolve => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
  });
}
function auth(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = verifyJWT(token);
  if (payload) sessions[payload.username] = Date.now();
  return payload;
}
function ffprobe(file) {
  try {
    const full = path.join(VIDEO_DIR, file);
    if (!fs.existsSync(full)) return { erro: 'arquivo nao encontrado' };
    const out = execSync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${full}"`,
      { encoding: 'utf8' });
    const j = JSON.parse(out);
    const v = (j.streams || []).find(s => s.codec_type === 'video') || {};
    const a = (j.streams || []).find(s => s.codec_type === 'audio') || {};
    return {
      duracao: (+(j.format || {}).duration || 0).toFixed(1) + ' s',
      bitrate: Math.round((+(j.format || {}).bit_rate || 0) / 1000) + ' kbps',
      resolucao: (v.width && v.height) ? `${v.width}x${v.height}` : '?',
      codecVideo: v.codec_name || '?',
      codecAudio: a.codec_name || '?'
    };
  } catch (e) { return { erro: 'ffprobe indisponivel' }; }
}

// ----------------------- ROTAS DA API -------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  const method = req.method;

  // ---- Proxy do OAuth2/OpenID -> authserver (porta 9000) ----
  // Assim o navegador fala so com um endereco (gateway), e /oauth vai ao authserver.
  if (p.startsWith('/oauth') || p.startsWith('/.well-known')) {
    const proxyReq = http.request(
      { hostname: '127.0.0.1', port: 9000, path: req.url, method, headers: req.headers },
      pres => { res.writeHead(pres.statusCode, pres.headers); pres.pipe(res); });
    proxyReq.on('error', () => send(res, 502, { erro: 'servidor OAuth offline (inicie authserver.js)' }));
    req.pipe(proxyReq);
    return;
  }

  // ---- daqui pra baixo exige token ----
  const user = auth(req);

  // ---- QUEM SOU EU + meu perfil ----
  if (p === '/api/me' && method === 'GET') {
    if (!user) return send(res, 401, { erro: 'token invalido' });
    return send(res, 200, { user, perfil: profileOf(req) });
  }

  // ---- LISTA DE CANAIS ----
  if (p === '/api/channels' && method === 'GET') {
    if (!user) return send(res, 401, { erro: 'token invalido' });
    const perfil = profileOf(req);
    const wanKey = activeWanKey();
    const lista = db.channels.map(ch => {
      const key = keyOf(perfil, ch.id);
      const s = streams[key];
      const ativo = !!s;
      // WAN115K: se ja tem outro canal WAN ligado, os demais ficam "indisponivel"
      let situacao = ativo ? 'ativo' : 'disponivel';
      if (perfil === 'WAN115K' && wanKey && wanKey !== key) situacao = 'indisponivel';
      const v = videoOf(ch);
      const file = fileFor(perfil, ch);
      return {
        id: ch.id, numero: ch.number, nome: ch.name, descricao: ch.description,
        perfil, situacao,
        expectadores: s ? s.viewers.size : 0,
        multicast: mcastFor(perfil, ch), porta: MCAST_PORT,
        url: udpUrl(perfil, ch),
        videoTitulo: v ? v.titulo : '(sem video)',
        video: file,
        metadados: ffprobe(file)
      };
    });
    return send(res, 200, { perfil, canais: lista });
  }

  // ---- ENTRAR NO CANAL (assistir) ----
  let m;
  if ((m = p.match(/^\/api\/channels\/(\d+)\/watch$/)) && method === 'POST') {
    if (!user) return send(res, 401, { erro: 'token invalido' });
    const ch = db.channels.find(c => c.id === +m[1]);
    if (!ch) return send(res, 404, { erro: 'canal nao existe' });
    const perfil = profileOf(req);
    const key = keyOf(perfil, ch.id);

    // Regra WAN115K: so um video por vez para todos os clientes WAN
    if (perfil === 'WAN115K') {
      const wanKey = activeWanKey();
      if (wanKey && wanKey !== key) {
        const busy = streams[wanKey];
        const canalBusy = db.channels.find(c => c.id === busy.channelId);
        return send(res, 409, {
          erro: 'WAN ocupada',
          mensagem: `A WAN (115200 bps) so transmite 1 canal por vez. Agora esta no canal ${canalBusy.number} - ${canalBusy.name}. Aguarde todos sairem.`,
          canalEmUso: canalBusy.number
        });
      }
    }
    leaveCurrent(user.username);           // sai do canal anterior
    const s = startStream(perfil, ch);     // liga o VLC se preciso
    s.viewers.add(user.username);
    userWatching[user.username] = key;
    lastBeat[user.username] = Date.now();  // marca sinal de vida
    return send(res, 200, {
      ok: true, perfil, canal: ch.number, nome: ch.name,
      multicast: mcastFor(perfil, ch), porta: MCAST_PORT, url: udpUrl(perfil, ch),
      expectadores: s.viewers.size
    });
  }

  // ---- SAIR DO CANAL ----
  if ((m = p.match(/^\/api\/channels\/(\d+)\/stop$/)) && method === 'POST') {
    if (!user) return send(res, 401, { erro: 'token invalido' });
    leaveCurrent(user.username);
    return send(res, 200, { ok: true });
  }

  // ---- BATIMENTO (a pagina avisa que ainda esta assistindo) ----
  if (p === '/api/heartbeat' && method === 'POST') {
    if (!user) return send(res, 401, { erro: 'token invalido' });
    if (userWatching[user.username]) lastBeat[user.username] = Date.now();
    return send(res, 200, { ok: true });
  }

  // ---- SAIDA por sendBeacon ao fechar a aba (token vem na query) ----
  if ((m = p.match(/^\/api\/channels\/(\d+)\/stop-beacon$/)) && method === 'POST') {
    const pl = verifyJWT(url.searchParams.get('token') || '');
    if (pl) leaveCurrent(pl.username);
    return send(res, 200, { ok: true });
  }

  // ---- PLAYLIST .m3u do perfil ----
  if (p === '/api/playlist.m3u' && method === 'GET') {
    if (!user) return send(res, 401, { erro: 'token invalido' });
    const perfil = profileOf(req);
    const wanKey = activeWanKey();
    let out = '#EXTM3U\n';
    for (const ch of db.channels) {
      if (perfil === 'WAN115K' && wanKey && wanKey !== keyOf(perfil, ch.id)) continue;
      out += `#EXTINF:-1,${ch.number} - ${ch.name}\n${udpUrl(perfil, ch)}\n`;
    }
    return send(res, 200, out, 'text');
  }

  // ---- ADMIN: status geral ----
  if (p === '/api/admin/status' && method === 'GET') {
    if (!user || user.role !== 'admin') return send(res, 403, { erro: 'apenas admin' });
    const agora = Date.now();
    const conectados = Object.entries(sessions)
      .filter(([, t]) => agora - t < 120000).map(([u]) => u);
    const ativos = Object.values(streams).map(s => {
      const ch = db.channels.find(c => c.id === s.channelId);
      return {
        perfil: s.profile, canal: ch ? ch.number : '?', nome: ch ? ch.name : '?',
        multicast: s.mcast, pid: s.proc ? s.proc.pid : null,
        expectadores: [...s.viewers], video: s.file
      };
    });
    const wanKey = activeWanKey();
    const wanCh = wanKey ? db.channels.find(c => c.id === streams[wanKey].channelId) : null;
    return send(res, 200, {
      usuariosConectados: conectados,
      canaisAtivos: ativos,
      processosVLC: ativos.filter(a => a.pid).map(a => ({ pid: a.pid, multicast: a.multicast })),
      fluxosMulticast: ativos.map(a => a.multicast),
      ocupacaoWAN: wanCh
        ? { ocupada: true, canal: wanCh.number, nome: wanCh.name, taxaAprox: '~96 kbps de 115 kbps' }
        : { ocupada: false }
    });
  }

  // ---- ADMIN: criar canal (vinculando a um video ja cadastrado) ----
  if (p === '/api/admin/channels' && method === 'POST') {
    if (!user || user.role !== 'admin') return send(res, 403, { erro: 'apenas admin' });
    const b = await readBody(req);
    const id = (db.channels.reduce((mx, c) => Math.max(mx, c.id), 0)) + 1;
    const ch = {
      id, number: +b.number || id, name: b.name || ('Canal ' + id),
      description: b.description || '', videoId: +b.videoId || null
    };
    db.channels.push(ch); saveDB(db);
    return send(res, 200, { ok: true, canal: ch });
  }

  // ---- ADMIN: remover canal ----
  if ((m = p.match(/^\/api\/admin\/channels\/(\d+)$/)) && method === 'DELETE') {
    if (!user || user.role !== 'admin') return send(res, 403, { erro: 'apenas admin' });
    stopStream(keyOf('LAN', +m[1])); stopStream(keyOf('WAN115K', +m[1]));
    db.channels = db.channels.filter(c => c.id !== +m[1]); saveDB(db);
    return send(res, 200, { ok: true });
  }

  // ==================== ADMIN: GESTAO DE VIDEOS ====================

  // ---- listar videos (com metadados via ffprobe do original e da versao WAN) ----
  if (p === '/api/admin/videos' && method === 'GET') {
    if (!user || user.role !== 'admin') return send(res, 403, { erro: 'apenas admin' });
    const lista = db.videos.map(v => ({
      id: v.id, titulo: v.titulo, descricao: v.descricao,
      original: v.original, wan: v.wan,
      temWan: !!(v.wan && fs.existsSync(path.join(VIDEO_DIR, v.wan))),
      conversao: convStatus[v.id] || null,
      metaOriginal: ffprobe(v.original),
      metaWan: v.wan ? ffprobe(v.wan) : null,
      usadoPorCanais: db.channels.filter(c => c.videoId === v.id).map(c => c.number)
    }));
    return send(res, 200, { videos: lista, arquivos: fs.readdirSync(VIDEO_DIR).filter(f => /\.(mp4|ts|mkv|avi)$/i.test(f)) });
  }

  // ---- cadastrar video (arquivos ja presentes em videos/) ----
  if (p === '/api/admin/videos' && method === 'POST') {
    if (!user || user.role !== 'admin') return send(res, 403, { erro: 'apenas admin' });
    const b = await readBody(req);
    if (!b.original) return send(res, 400, { erro: 'informe o arquivo original' });
    const id = (db.videos.reduce((mx, v) => Math.max(mx, v.id), 0)) + 1;
    const v = { id, titulo: b.titulo || b.original, descricao: b.descricao || '', original: b.original, wan: b.wan || '' };
    db.videos.push(v); saveDB(db);
    return send(res, 200, { ok: true, video: v });
  }

  // ---- remover video ----
  if ((m = p.match(/^\/api\/admin\/videos\/(\d+)$/)) && method === 'DELETE') {
    if (!user || user.role !== 'admin') return send(res, 403, { erro: 'apenas admin' });
    db.videos = db.videos.filter(v => v.id !== +m[1]); saveDB(db);
    return send(res, 200, { ok: true });
  }

  // ---- converter original -> versao WAN (baixa qualidade) com ffmpeg (comando do enunciado) ----
  if ((m = p.match(/^\/api\/admin\/videos\/(\d+)\/convert$/)) && method === 'POST') {
    if (!user || user.role !== 'admin') return send(res, 403, { erro: 'apenas admin' });
    const v = db.videos.find(x => x.id === +m[1]);
    if (!v) return send(res, 404, { erro: 'video nao existe' });
    const inFull = path.join(VIDEO_DIR, v.original);
    if (!fs.existsSync(inFull)) return send(res, 400, { erro: 'arquivo original nao encontrado' });
    const outName = v.original.replace(/\.[^.]+$/, '') + '_ld.mp4';
    const outFull = path.join(VIDEO_DIR, outName);
    convStatus[v.id] = 'convertendo';
    const args = ['-y', '-i', inFull, '-c:v', 'libx264', '-b:v', '80k', '-r', '10', '-s', '320x240',
                  '-c:a', 'aac', '-b:a', '16k', '-ac', '1', '-ar', '22050', outFull];
    try {
      const ff = spawn('ffmpeg', args, { stdio: 'ignore' });
      ff.on('error', () => { convStatus[v.id] = 'erro'; });
      ff.on('close', code => {
        if (code === 0) { convStatus[v.id] = 'ok'; v.wan = outName; saveDB(db); }
        else convStatus[v.id] = 'erro';
      });
    } catch (e) { convStatus[v.id] = 'erro'; }
    return send(res, 200, { ok: true, status: 'convertendo', saida: outName });
  }

  // ---- upload de arquivo de video (envio bruto: octet-stream) ----
  if (p === '/api/admin/upload' && method === 'POST') {
    if (!user || user.role !== 'admin') return send(res, 403, { erro: 'apenas admin' });
    const nome = path.basename(url.searchParams.get('name') || '');
    if (!nome || !/\.(mp4|ts|mkv|avi)$/i.test(nome)) return send(res, 400, { erro: 'nome de arquivo invalido' });
    const dest = path.join(VIDEO_DIR, nome);
    const out = fs.createWriteStream(dest);
    req.pipe(out);
    out.on('finish', () => send(res, 200, { ok: true, arquivo: nome }));
    out.on('error', () => send(res, 500, { erro: 'falha ao salvar arquivo' }));
    return;
  }

  // ---- Arquivos estaticos do frontend (facilita o teste local em S) ----
  if (method === 'GET' && !p.startsWith('/api/')) {
    let f = p === '/' ? '/index.html' : p;
    const full = path.join(FRONT_DIR, f);
    if (full.startsWith(FRONT_DIR) && fs.existsSync(full) && fs.statSync(full).isFile()) {
      const ext = path.extname(full);
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
      res.writeHead(200, { 'Content-Type': (types[ext] || 'text/plain') + '; charset=utf-8' });
      return res.end(fs.readFileSync(full));
    }
  }

  send(res, 404, { erro: 'rota nao encontrada' });
});

// Encerramento limpo: mata todos os cvlc ao parar o backend
function shutdown() {
  console.log('\n[Backend] Encerrando e desligando fluxos VLC...');
  Object.keys(streams).forEach(stopStream);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
  console.log('==================================================');
  console.log(' Mini-IPTV Backend (host S) rodando');
  console.log(' Porta:', PORT, '| Grupo:', GRUPO, '| Multicast porta:', MCAST_PORT);
  console.log(' LAN  -> 239.10.' + GRUPO + '.<canal>   (qualidade original)');
  console.log(' WAN  -> 239.20.' + GRUPO + '.<canal>   (baixa qualidade, 1 por vez)');
  console.log('==================================================');
});
