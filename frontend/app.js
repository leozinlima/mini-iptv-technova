/* =========================================================================
   Mini-IPTV - Frontend (servido pelo Apache em R1)
   Fala com a API pelo caminho relativo /api  ->  o Apache (proxy reverso)
   repassa para o backend em S (172.16.0.2:3000).
   ========================================================================= */

const API = '/api';                 // caminho relativo (funciona via proxy do R1)
let token = localStorage.getItem('token') || '';
let usuario = JSON.parse(localStorage.getItem('user') || 'null');
let perfil = '';
let assistindo = null;
const canalInfo = {};   // id do canal -> {mcast, porta} (para abrir o VLC no clique)

// ---- helper para chamar a API ----
async function api(rota, metodo = 'GET', corpo = null) {
  const opt = { method: metodo, headers: {} };
  if (token) opt.headers['Authorization'] = 'Bearer ' + token;
  if (corpo) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(corpo); }
  const r = await fetch(API + rota, opt);
  const texto = await r.text();
  let dado; try { dado = JSON.parse(texto); } catch { dado = texto; }
  return { ok: r.ok, status: r.status, dado };
}

// ---- LOGIN via OAuth2/OpenID Connect (Authorization Code + PKCE) ----
const REDIRECT = location.origin + location.pathname;   // volta para esta mesma pagina

function rand(n) {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return Array.from(a, b => ('0' + b.toString(16)).slice(-2)).join('');
}
async function sha256url(txt) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  let bin = ''; new Uint8Array(h).forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// 1) manda o navegador para o servidor OAuth (a tela de login fica la)
async function iniciarLogin() {
  const params = {
    response_type: 'code', client_id: 'miniiptv', redirect_uri: REDIRECT,
    scope: 'openid profile', state: rand(8)
  };
  // PKCE (code_challenge) so funciona em contexto seguro (HTTPS/localhost),
  // porque usa window.crypto.subtle. Em HTTP simples ele nao existe -> segue
  // sem PKCE (o authserver aceita fluxo sem code_challenge).
  try {
    if (window.crypto && window.crypto.subtle) {
      const verifier = rand(32);
      sessionStorage.setItem('pkce', verifier);
      params.code_challenge = await sha256url(verifier);
      params.code_challenge_method = 'S256';
    } else {
      sessionStorage.removeItem('pkce');
    }
  } catch (e) { sessionStorage.removeItem('pkce'); }
  location.href = '/oauth/authorize?' + new URLSearchParams(params).toString();
}

// 2) de volta com ?code=..., troca o code pelo token (com o verifier do PKCE)
async function trocarCodePorToken(code) {
  const p = { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: 'miniiptv' };
  const v = sessionStorage.getItem('pkce');
  if (v) p.code_verifier = v;   // so envia o verifier se usou PKCE
  const body = new URLSearchParams(p);
  const r = await fetch('/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const d = await r.json();
  if (!r.ok) { document.getElementById('erro-login').textContent = d.desc || d.error || 'Falha no login'; return false; }
  token = d.access_token;
  localStorage.setItem('token', token);
  return true;
}

function sair() {
  if (assistindo) pararDeAssistir();
  localStorage.clear(); sessionStorage.clear(); token = ''; usuario = null;
  document.getElementById('tela-app').classList.add('oculto');
  document.getElementById('tela-login').classList.remove('oculto');
}

async function entrarApp() {
  const me = await api('/me');
  if (!me.ok) return sair();
  usuario = me.dado.user; localStorage.setItem('user', JSON.stringify(usuario));
  perfil = me.dado.perfil;
  document.getElementById('tela-login').classList.add('oculto');
  document.getElementById('tela-app').classList.remove('oculto');
  document.getElementById('info-usuario').textContent = usuario.name;
  document.getElementById('info-perfil').textContent = 'Perfil: ' + perfil;
  if (usuario.role === 'admin') document.getElementById('btn-admin').classList.remove('oculto');
  carregarCanais();
}

// ---- LISTA DE CANAIS ----
async function carregarCanais() {
  const { ok, dado } = await api('/channels');
  if (!ok) return;
  perfil = dado.perfil;
  const div = document.getElementById('lista-canais');
  div.innerHTML = '';
  const bloqueado = dado.canais.some(c => c.situacao === 'indisponivel');
  document.getElementById('aviso-wan').textContent =
    (perfil === 'WAN115K' && bloqueado)
      ? 'Rede WAN115K: só 1 canal por vez. Enquanto alguém assiste, os outros ficam indisponíveis.'
      : '';

  dado.canais.forEach(c => {
    canalInfo[c.id] = { mcast: c.multicast, porta: c.porta };   // guarda p/ abrir o VLC no clique
    const cor = { disponivel: 'verde', ativo: 'azul', indisponivel: 'cinza' }[c.situacao];
    const md = c.metadados || {};
    const card = document.createElement('div');
    card.className = 'card canal ' + cor;
    card.innerHTML = `
      <div class="canal-topo">
        <b>${c.numero} - ${c.nome}</b>
        <span class="tag ${cor}">${c.situacao}</span>
      </div>
      <p class="desc">${c.descricao}</p>
      <p class="mono peq">${c.multicast}:${c.porta}</p>
      <p class="peq">${c.expectadores} assistindo · ${md.resolucao || '?'} · ${md.bitrate || '?'}</p>
      <button ${c.situacao === 'indisponivel' ? 'disabled' : ''} onclick="assistir(${c.id})">Assistir</button>
    `;
    div.appendChild(card);
  });
}

// ---- ASSISTIR ----
async function assistir(id) {
  // ABRE O VLC JA, no clique (antes de qualquer await), senao o Firefox bloqueia
  // a abertura de app externo por "perda do gesto do usuario".
  if (canalInfo[id]) { urlAtual = canalInfo[id]; abrirNoVlc(); }

  const { ok, status, dado } = await api('/channels/' + id + '/watch', 'POST');
  if (!ok) {
    if (status === 409) alert(dado.mensagem);   // WAN ocupada
    else alert(dado.erro || 'Erro');
    return carregarCanais();
  }
  assistindo = id;
  urlAtual = { mcast: dado.multicast, porta: dado.porta };
  document.getElementById('area-player').classList.remove('oculto');
  document.getElementById('area-admin').classList.add('oculto');
  document.getElementById('player-titulo').textContent = 'Assistindo: ' + dado.canal + ' - ' + dado.nome;
  document.getElementById('player-info').textContent =
    'Perfil ' + dado.perfil + ' · ' + dado.expectadores + ' espectador(es)';
  document.getElementById('player-url').textContent = dado.url;
  iniciarBatimento();    // avisa o servidor periodicamente que ainda esta assistindo
  carregarCanais();
}

// Abre o VLC no cliente via o esquema iptv:// (registrado pelo script do cliente).
// Ex.: iptv://239.20.4.1:5004  ->  vlc udp://@239.20.4.1:5004
let urlAtual = null;
function abrirNoVlc() {
  if (!urlAtual) return;
  const a = document.createElement('a');
  a.href = 'iptv://' + urlAtual.mcast + ':' + urlAtual.porta;
  document.body.appendChild(a); a.click(); a.remove();
}

// Batimento: enquanto a pagina esta aberta assistindo, avisa o servidor a cada 15s.
// Se parar (fechou a aba / foi embora), o servidor libera o canal em ~45s.
let batimento = null;
function iniciarBatimento() {
  pararBatimento();
  batimento = setInterval(() => api('/heartbeat', 'POST'), 15000);
}
function pararBatimento() { if (batimento) { clearInterval(batimento); batimento = null; } }

async function pararDeAssistir() {
  if (assistindo == null) return;
  pararBatimento();
  await api('/channels/' + assistindo + '/stop', 'POST');
  assistindo = null; urlAtual = null;
  document.getElementById('area-player').classList.add('oculto');
  carregarCanais();
}

// Ao fechar a aba / sair da pagina, avisa o servidor na hora (libera o canal).
window.addEventListener('pagehide', () => {
  if (assistindo != null && token) {
    navigator.sendBeacon('/api/channels/' + assistindo + '/stop-beacon?token=' + encodeURIComponent(token));
  }
});

// ---- PLAYLIST .m3u ----
async function baixarPlaylist() {
  const r = await fetch(API + '/playlist.m3u', { headers: { 'Authorization': 'Bearer ' + token } });
  const txt = await r.text();
  const blob = new Blob([txt], { type: 'audio/x-mpegurl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'canais_' + perfil + '.m3u';
  a.click();
}

// ---- ADMIN ----
function mostrarAdmin() {
  document.getElementById('area-admin').classList.remove('oculto');
  document.getElementById('area-player').classList.add('oculto');
  carregarStatus();
  carregarVideos();
}

// ---- ADMIN: vídeos ----
let arquivosDisponiveis = [];
async function carregarVideos() {
  const { ok, dado } = await api('/admin/videos');
  if (!ok) return;
  arquivosDisponiveis = dado.arquivos || [];
  // tabela de vídeos
  document.getElementById('lista-videos').innerHTML = `
    <table><tr><th>#</th><th>Título</th><th>Original</th><th>Versão WAN</th><th>Metadados (original)</th><th>Canais</th><th></th></tr>
    ${dado.videos.map(v => {
      const mo = v.metaOriginal || {};
      const wan = v.temWan ? v.wan
        : (v.conversao === 'convertendo' ? 'convertendo...'
        : `<button class="secundario" onclick="converter(${v.id})">Converter p/ WAN</button>`);
      return `<tr><td>${v.id}</td><td>${v.titulo}</td><td class="mono peq">${v.original}</td>
        <td class="mono peq">${wan}</td>
        <td class="peq">${mo.resolucao || '?'} · ${mo.bitrate || '?'} · ${mo.duracao || '?'}</td>
        <td>${v.usadoPorCanais.join(', ') || '-'}</td>
        <td><button class="secundario" onclick="removerVideo(${v.id})">Remover</button></td></tr>`;
    }).join('')}</table>`;
  // dropdown de vídeos para criar canal
  document.getElementById('nc-video').innerHTML =
    '<option value="">- escolha o vídeo -</option>' +
    dado.videos.map(v => `<option value="${v.id}">${v.titulo} (${v.original})</option>`).join('');
  // tabela de canais (para remover)
  const ch = await api('/channels');
  if (ch.ok) document.getElementById('lista-canais-admin').innerHTML =
    `<table><tr><th>Canal</th><th>Nome</th><th>Vídeo</th><th></th></tr>
    ${ch.dado.canais.map(c => `<tr><td>${c.numero}</td><td>${c.nome}</td><td class="peq">${c.videoTitulo}</td>
      <td><button class="secundario" onclick="removerCanal(${c.id})">Remover</button></td></tr>`).join('')}</table>`;
}
async function uploadVideo() {
  const inp = document.getElementById('up-file');
  if (!inp.files.length) return alert('Escolha um arquivo');
  const f = inp.files[0];
  document.getElementById('up-msg').textContent = 'enviando ' + f.name + '...';
  const r = await fetch(API + '/admin/upload?name=' + encodeURIComponent(f.name),
    { method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: f });
  const d = await r.json();
  document.getElementById('up-msg').textContent = r.ok ? ('enviado: ' + d.arquivo) : ('Erro: ' + d.erro);
  document.getElementById('nv-orig').value = f.name;
  carregarVideos();
}
async function cadastrarVideo() {
  const corpo = {
    titulo: document.getElementById('nv-titulo').value,
    original: document.getElementById('nv-orig').value,
    wan: document.getElementById('nv-wan').value
  };
  const { ok, dado } = await api('/admin/videos', 'POST', corpo);
  if (ok) { carregarVideos(); } else alert(dado.erro);
}
async function converter(id) {
  const { ok, dado } = await api('/admin/videos/' + id + '/convert', 'POST');
  if (ok) { alert('Conversão iniciada (ffmpeg). Atualize em alguns segundos.'); carregarVideos(); }
  else alert(dado.erro);
}
async function removerVideo(id) {
  if (!confirm('Remover este vídeo?')) return;
  await api('/admin/videos/' + id, 'DELETE'); carregarVideos();
}
async function removerCanal(id) {
  if (!confirm('Remover este canal?')) return;
  await api('/admin/channels/' + id, 'DELETE'); carregarVideos(); carregarCanais();
}
async function carregarStatus() {
  const { ok, dado } = await api('/admin/status');
  if (!ok) return;
  const w = dado.ocupacaoWAN.ocupada
    ? `OCUPADA (canal ${dado.ocupacaoWAN.canal} - ${dado.ocupacaoWAN.nome}, ${dado.ocupacaoWAN.taxaAprox})`
    : 'LIVRE';
  document.getElementById('admin-status').innerHTML = `
    <div class="status-grid">
      <div><b>Usuários conectados</b><br>${dado.usuariosConectados.join(', ') || '-'}</div>
      <div><b>Ocupação WAN</b><br>${w}</div>
      <div><b>Fluxos multicast ativos</b><br>${dado.fluxosMulticast.join('<br>') || '-'}</div>
      <div><b>Processos VLC</b><br>${dado.processosVLC.map(p => 'PID ' + p.pid + ' → ' + p.multicast).join('<br>') || '-'}</div>
    </div>
    <h3>Canais ativos</h3>
    <table><tr><th>Perfil</th><th>Canal</th><th>Multicast</th><th>Espectadores</th></tr>
    ${dado.canaisAtivos.map(c => `<tr><td>${c.perfil}</td><td>${c.canal} ${c.nome}</td><td class="mono">${c.multicast}</td><td>${c.expectadores.join(', ')}</td></tr>`).join('')}
    </table>`;
}
async function criarCanal() {
  const corpo = {
    number: +document.getElementById('nc-num').value,
    name: document.getElementById('nc-nome').value,
    videoId: +document.getElementById('nc-video').value
  };
  if (!corpo.videoId) return alert('Escolha um vídeo para o canal');
  const { ok, dado } = await api('/admin/channels', 'POST', corpo);
  if (ok) { alert('Canal criado!'); carregarCanais(); carregarVideos(); } else alert(dado.erro);
}

// ---- Inicializacao: trata a volta do OAuth (?code=...) ou reusa o token salvo ----
(async function init() {
  const params = new URLSearchParams(location.search);
  if (params.get('code')) {
    const ok = await trocarCodePorToken(params.get('code'));
    history.replaceState({}, '', REDIRECT);   // limpa o ?code da URL
    if (ok) return entrarApp();
  }
  if (token) entrarApp();
})();
