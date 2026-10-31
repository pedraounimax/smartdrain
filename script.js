/* SmartDrain · Algorix — navegação, simulação, integrantes e integração com o ThingSpeak */

/* ============ CONFIGURE AQUI ============ */
const CONFIG = {
  channelId: "3525864",             // ID do canal no ThingSpeak
  readApiKey: "PV1DFF8KMZ8YWRLJ",   // Read API Key (pode ficar vazio se o canal for público)
  updateEveryMs: 5000,              // o site consulta o ThingSpeak a cada 5 s
  results: 40,                      // leituras buscadas para o gráfico
  maxDistance: 20,                  // distância (cm) do sensor até o fundo (bueiro vazio)
  critAt: 8,                        // distância <= 4 cm  -> CRÍTICO
  warnAt: 12                        // distância < 12 cm  -> ATENÇÃO (senão NORMAL)
  // Field 1 = distância medida pelo sensor, em cm
};
const MEMBERS = [
  // foto: caminho da imagem, ex: "fotos/ana.jpg". Vazio = mostra as iniciais.
  { nome: "Integrante 1", funcao: "Programação do ESP32", foto: "" },
  { nome: "Integrante 2", funcao: "Eletrônica e sensores", foto: "" },
  { nome: "Integrante 3", funcao: "Desenvolvimento do site", foto: "" },
  { nome: "Integrante 4", funcao: "Integração com o ThingSpeak", foto: "" },
  { nome: "Integrante 5", funcao: "Pesquisa e documentação", foto: "" },
  { nome: "Integrante 6", funcao: "Montagem e testes", foto: "" }
];
/* ======================================== */

const $ = s => document.querySelector(s);
const stateOf = d => d <= CONFIG.critAt ? "crit" : d < CONFIG.warnAt ? "warn" : "ok"; // d = distância em cm
const toLevel = d => Math.max(0, Math.min(100, (1 - d / CONFIG.maxDistance) * 100));  // distância -> nível %
const NIVEL = { ok: "Baixo", warn: "Médio", crit: "Alto" };
const LABEL = { ok: "Normal", warn: "Atenção", crit: "Crítico" };
const DESC = {
  ok: "O bueiro está com folga.",
  warn: "O nível está subindo. Vale agendar uma limpeza.",
  crit: "Nível muito alto. Há risco de transbordar e a limpeza é urgente."
};

/* ---- Navegação por abas ---- */
function show(tab){
  if(!document.getElementById(tab)) tab = "inicio";
  document.querySelectorAll("main section").forEach(s => s.hidden = s.id !== tab);
  document.querySelectorAll(".tabs button").forEach(b => {
    if(b.dataset.tab === tab) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
}
document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => { location.hash = b.dataset.tab; }));
window.addEventListener("hashchange", () => show(location.hash.slice(1)));

/* ---- Integrantes ---- */
$("#team").innerHTML = MEMBERS.map(m => {
  const ini = m.nome.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();
  const pic = m.foto ? `<img src="${m.foto}" alt="Foto de ${m.nome}">` : ini;
  return `<div class="card member"><div class="photo">${pic}</div><div><h3>${m.nome}</h3><p>${m.funcao}</p></div></div>`;
}).join("");

/* ---- Simulação do bueiro (página inicial) ---- */
const COLORS = { ok: "var(--ok)", warn: "var(--warn)", crit: "var(--crit)" };
function setLevel(v){
  const top = 334 - 298 * v / 100;
  $("#wRect").setAttribute("y", top); $("#wRect").setAttribute("height", 334 - top);
  $("#wTop").setAttribute("y", top);
  $("#beam").setAttribute("y2", top);
  const s = stateOf((1 - v / 100) * CONFIG.maxDistance);
  $("#water").style.color = COLORS[s];
  $("#simOut").textContent = `${Math.round(v)}% · ${LABEL[s]}`;
}
const rain = $("#rain");
let t = 0;
const auto = setInterval(() => { t += .03; rain.value = 50 + 42 * Math.sin(t); setLevel(+rain.value); }, 60);
rain.addEventListener("input", () => { clearInterval(auto); setLevel(+rain.value); });
setLevel(+rain.value);

/* ---- Monitoramento (ThingSpeak) ---- */
const demo = !CONFIG.channelId || CONFIG.channelId === "SEU_CHANNEL_ID";
let timer = null, demoData = null;

function demoRow(prev, at){
  const d = Math.min(CONFIG.maxDistance, Math.max(1, prev + (Math.random() - .58) * 2.5));
  return { created_at: new Date(at).toISOString(), field1: d.toFixed(1) };
}
async function fetchFeeds(){
  if(demo){
    if(!demoData){
      demoData = []; let d = 11; const now = Date.now();
      for(let i = CONFIG.results - 1; i >= 0; i--){ const r = demoRow(d, now - i * CONFIG.updateEveryMs); d = +r.field1; demoData.push(r); }
    } else { demoData.push(demoRow(+demoData.at(-1).field1, Date.now())); demoData.shift(); }
    return demoData;
  }
  const key = CONFIG.readApiKey ? `&api_key=${CONFIG.readApiKey}` : "";
  const r = await fetch(`https://api.thingspeak.com/channels/${CONFIG.channelId}/feeds.json?results=${CONFIG.results}${key}&_=${Date.now()}`, { cache: "no-store" });
  if(!r.ok) throw new Error("Erro ao acessar o ThingSpeak (HTTP " + r.status + ")");
  const feeds = (await r.json()).feeds || [];
  return feeds.filter(f => !isNaN(parseFloat(f.field1)));  // ignora leituras vazias
}

let lastAt = null;
function showAge(){
  if(!lastAt) return;
  const sec = Math.max(0, Math.round((Date.now() - new Date(lastAt).getTime()) / 1000));
  $("#lastUpdate").textContent = `Última leitura: ${new Date(lastAt).toLocaleString("pt-BR")} (há ${sec} s) · o ESP32 envia a cada ~15 s`;
}
setInterval(showAge, 1000);

function render(feeds){
  if(!feeds.length){
    $("#statusTitle").textContent = "Sem leitura";
    $("#statusText").textContent = "O canal ainda não recebeu nenhuma distância no Field 1.";
    return;
  }
  const last = feeds.at(-1), d = parseFloat(last.field1);
  const s = stateOf(d), lvl = toLevel(d);
  $("#status").dataset.s = s;
  document.querySelector(".statusinfo").dataset.s = s;
  $("#arc").style.strokeDasharray = `${lvl * 4.398} 440`;
  $("#gPct").textContent = Math.round(lvl) + "%";
  $("#statusTitle").textContent = LABEL[s].toUpperCase();
  $("#statusText").textContent = DESC[s];
  lastAt = last.created_at; showAge();

  $("#stats").innerHTML =
    `<div class="card stat"><small>Distância até a água</small><strong>${d.toFixed(1)}<em>cm</em></strong></div>
     <div class="card stat"><small>Nível do bueiro</small><strong>${NIVEL[s]}</strong></div>
     <div class="card stat"><small>Ocupação</small><strong>${Math.round(lvl)}<em>%</em></strong></div>`;

  drawChart(feeds); drawLog(feeds);
}

function drawChart(feeds){
  const pts = feeds.map(f => toLevel(parseFloat(f.field1)));
  if(pts.length < 2){ $("#chart").textContent = "Poucos dados para o gráfico."; return; }
  const W = 800, H = 260, p = { l: 42, r: 12, t: 12, b: 12 };
  const x = i => p.l + i * (W - p.l - p.r) / (pts.length - 1);
  const y = v => p.t + (1 - v / 100) * (H - p.t - p.b);
  const wl = toLevel(CONFIG.warnAt), cl = toLevel(CONFIG.critAt);
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const grid = [0, 25, 50, 75, 100].map(v => `<line x1="${p.l}" x2="${W - p.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${p.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="var(--mut)">${v}%</text>`).join("");
  $("#chart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico do nível de água">${grid}
    <line x1="${p.l}" x2="${W - p.r}" y1="${y(wl)}" y2="${y(wl)}" stroke="var(--warn)" stroke-dasharray="5 5"/>
    <line x1="${p.l}" x2="${W - p.r}" y1="${y(cl)}" y2="${y(cl)}" stroke="var(--crit)" stroke-dasharray="5 5"/>
    <path d="${line}L${x(pts.length - 1)} ${y(0)}L${x(0)} ${y(0)}Z" fill="var(--water)" opacity=".18"/>
    <path d="${line}" fill="none" stroke="var(--water)" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="${x(pts.length - 1)}" cy="${y(pts.at(-1))}" r="5" fill="var(--water)"/></svg>`;
}

function drawLog(feeds){
  const ev = []; let prev = null;
  feeds.forEach(f => {
    const d = parseFloat(f.field1), s = stateOf(d);
    if(s !== prev){ ev.push({ s, d, at: f.created_at }); prev = s; }
  });
  $("#log").innerHTML = ev.slice(-6).reverse().map(e =>
    `<li><i class="${e.s}"></i><span><b style="color:var(--ink)">${LABEL[e.s]}</b> · ${e.d.toFixed(1)} cm · ${new Date(e.at).toLocaleString("pt-BR")}</span></li>`).join("");
}

let busy = false;
async function tick(){
  if(busy) return;
  busy = true;
  $("#demoNote").hidden = !demo;
  try { render(await fetchFeeds()); }
  catch(e){
    $("#statusTitle").textContent = "Não foi possível carregar";
    $("#statusText").textContent = e.message + ". Confira o ID do canal, a Read API Key e a conexão.";
    console.error("Erro ao atualizar os dados:", e);
  }
  busy = false;
}
function startPolling(){ stopPolling(); tick(); timer = setInterval(tick, CONFIG.updateEveryMs); }
function stopPolling(){ clearInterval(timer); }

show(location.hash.slice(1) || "inicio");
startPolling();
document.addEventListener("visibilitychange", () => { if(!document.hidden) tick(); });
