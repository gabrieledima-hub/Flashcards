/* Flashcards — semplice SPA statica con routing via hash.
   Nessun framework, nessun build. Funziona su GitHub Pages.
   - Memoria dei progressi per carta (localStorage)
   - Gamification: streak, XP/livelli, combo, obiettivo giornaliero */

const app = document.getElementById("app");
const breadcrumb = document.getElementById("breadcrumb");
const hud = document.getElementById("hud");

const state = {
  materie: [],
  cache: {},
};

// Colori vivaci ruotati sulle tile dei capitoli
const TILE_COLORS = ["#ff2e93", "#8a5cff", "#00e0ff", "#2bff88", "#ffb83a", "#ff6a3a", "#b6ff3d", "#c44dff"];

/* ===================== Memoria progressi (per carta) ===================== */

const PROGRESS_KEY = "flashcards-progress-v2";

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; } catch { return {}; }
}
let progress = loadProgress();
function saveProgress() {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (e) { console.warn(e); }
}

function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return "h" + (h >>> 0).toString(36);
}
function cardKey(card) { return card.id ? "id:" + card.id : hashString(card.domanda || ""); }
function bucketId(materiaId, capId) { return materiaId + "::" + capId; }

function getCardState(materiaId, capId, card) {
  const b = progress[bucketId(materiaId, capId)];
  return b ? b[cardKey(card)] : undefined;
}
function recordAnswer(materiaId, capId, card, esito) {
  const bId = bucketId(materiaId, capId);
  if (!progress[bId]) progress[bId] = {};
  const k = cardKey(card);
  const prev = progress[bId][k] || { viste: 0, sapute: 0, ripassi: 0 };
  prev.viste += 1;
  if (esito === "known") prev.sapute += 1; else prev.ripassi += 1;
  prev.stato = esito;
  prev.ultimo = Date.now();
  progress[bId][k] = prev;
  saveProgress();
}
function resetCapitolo(materiaId, capId) {
  delete progress[bucketId(materiaId, capId)];
  saveProgress();
}
function statsCapitolo(materiaId, capId, cards) {
  let sapute = 0, daRipassare = 0, studiate = 0;
  for (const c of cards) {
    const s = getCardState(materiaId, capId, c);
    if (!s) continue;
    studiate++;
    if (s.stato === "known") sapute++; else daRipassare++;
  }
  const totale = cards.length;
  return { totale, studiate, sapute, daRipassare, nuove: totale - studiate };
}

/* ===================== Gamification ===================== */

const GAME_KEY = "flashcards-game-v1";
const XP_PER_LEVEL = 100;
const XP_KNOWN = 10;
const XP_REVIEW = 3;
const DAILY_BONUS = 50;

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayStr() { return dateStr(new Date()); }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return dateStr(d); }

function loadGame() {
  let g = null;
  try { g = JSON.parse(localStorage.getItem(GAME_KEY)); } catch {}
  return Object.assign(
    { xp: 0, streak: 0, lastStudyDate: null, dailyDate: null, dailyCount: 0, dailyGoal: 20, dailyBonusGiven: false, bestCombo: 0 },
    g || {}
  );
}
let game = loadGame();
function saveGame() { try { localStorage.setItem(GAME_KEY, JSON.stringify(game)); } catch {} }

function levelFromXp(xp) { return Math.floor(xp / XP_PER_LEVEL) + 1; }
function levelProgress(xp) { return xp % XP_PER_LEVEL; }

function ensureDaily() {
  const t = todayStr();
  if (game.dailyDate !== t) {
    game.dailyDate = t;
    game.dailyCount = 0;
    game.dailyBonusGiven = false;
  }
}
function registerStudyDay() {
  const t = todayStr();
  if (game.lastStudyDate === t) return;
  game.streak = game.lastStudyDate === yesterdayStr() ? (game.streak || 0) + 1 : 1;
  game.lastStudyDate = t;
}

// Registra una risposta e restituisce gli eventi per il feedback visivo.
function awardAnswer(esito, combo) {
  ensureDaily();
  registerStudyDay();
  let gain = esito === "known" ? XP_KNOWN : XP_REVIEW;
  if (esito === "known" && combo >= 3) gain += combo * 2; // bonus combo
  const prevLevel = levelFromXp(game.xp);
  game.xp += gain;
  game.dailyCount += 1;
  let dailyJustDone = false;
  if (!game.dailyBonusGiven && game.dailyCount >= game.dailyGoal) {
    game.dailyBonusGiven = true;
    game.xp += DAILY_BONUS;
    dailyJustDone = true;
  }
  if (combo > (game.bestCombo || 0)) game.bestCombo = combo;
  const newLevel = levelFromXp(game.xp);
  saveGame();
  return { gain, leveledUp: newLevel > prevLevel, newLevel, dailyJustDone };
}

function renderHUD() {
  ensureDaily();
  saveGame();
  const lvl = levelFromXp(game.xp);
  const prog = levelProgress(game.xp);
  const pct = (prog / XP_PER_LEVEL) * 100;
  const goalNow = Math.min(game.dailyCount, game.dailyGoal);
  const goalPct = Math.min(100, (game.dailyCount / game.dailyGoal) * 100);
  hud.innerHTML = `
    <div class="hud-item" title="Giorni consecutivi di studio">
      <span class="hud-ico">🔥</span><b>${game.streak || 0}</b><span class="hud-lbl">streak</span>
    </div>
    <div class="hud-item hud-level" title="Livello ed esperienza">
      <span class="hud-ico">⭐</span>
      <div class="hud-level-body">
        <div class="hud-level-top"><b>Liv. ${lvl}</b><span class="hud-lbl">${prog}/${XP_PER_LEVEL} XP</span></div>
        <div class="hud-xpbar"><span style="width:${pct}%"></span></div>
      </div>
    </div>
    <div class="hud-item hud-goal" title="Obiettivo di oggi">
      <span class="hud-ico">🎯</span>
      <div class="hud-level-body">
        <div class="hud-level-top"><b>${goalNow}/${game.dailyGoal}</b><span class="hud-lbl">oggi</span></div>
        <div class="hud-xpbar goal"><span style="width:${goalPct}%"></span></div>
      </div>
    </div>`;
}

function showToast(html, kind) {
  const t = document.createElement("div");
  t.className = "toast " + (kind || "");
  t.innerHTML = html;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 400); }, 2300);
}

/* ===================== Utilità ===================== */

async function getJSON(path) {
  if (state.cache[path]) return state.cache[path];
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Impossibile caricare ${path} (${res.status})`);
  const data = await res.json();
  state.cache[path] = data;
  return data;
}
function findMateria(id) { return state.materie.find((m) => m.id === id); }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function setBreadcrumb(parts) {
  breadcrumb.innerHTML = parts.map((p, i) => {
    const sep = i > 0 ? '<span class="sep">/</span>' : "";
    return p.href ? `${sep}<a href="${p.href}">${p.label}</a>` : `${sep}<span>${p.label}</span>`;
  }).join(" ");
}
function statBar(st) {
  if (!st.totale) return "";
  const pk = (st.sapute / st.totale) * 100;
  const pr = (st.daRipassare / st.totale) * 100;
  return `<div class="statbar" title="${st.sapute} sapute · ${st.daRipassare} da ripassare · ${st.nuove} nuove">
    <span class="seg seg-good" style="width:${pk}%"></span>
    <span class="seg seg-warn" style="width:${pr}%"></span>
  </div>`;
}
function statLine(st) {
  return `<div class="statline">
    <span class="dot good"></span>${st.sapute} sapute
    <span class="dot warn"></span>${st.daRipassare} da ripassare
    <span class="dot new"></span>${st.nuove} nuove
  </div>`;
}
async function caricaCapitoli(m) {
  const capitoli = m.capitoli || [];
  return Promise.all(capitoli.map(async (c) => {
    let cards = [];
    try { cards = (await getJSON(`${m.cartella}/${c.file}`)).flashcards || []; } catch { cards = []; }
    return { cap: c, cards, st: statsCapitolo(m.id, c.id, cards) };
  }));
}

/* ===================== Viste ===================== */

async function viewHome() {
  setBreadcrumb([{ label: "Materie" }]);
  if (!state.materie.length) {
    app.innerHTML = `<div class="empty">Nessuna materia ancora. Aggiungine una in <code>data/subjects.json</code>.</div>`;
    return;
  }
  app.innerHTML = `<div class="loading">Carico le materie…</div>`;
  const tiles = await Promise.all(state.materie.map(async (m, i) => {
    const caps = await caricaCapitoli(m);
    const agg = caps.reduce((a, c) => ({
      totale: a.totale + c.st.totale, studiate: a.studiate + c.st.studiate,
      sapute: a.sapute + c.st.sapute, daRipassare: a.daRipassare + c.st.daRipassare, nuove: a.nuove + c.st.nuove,
    }), { totale: 0, studiate: 0, sapute: 0, daRipassare: 0, nuove: 0 });
    const color = m.colore || TILE_COLORS[i % TILE_COLORS.length];
    return `
      <a class="tile" href="#/materia/${encodeURIComponent(m.id)}">
        <span class="accent-bar" style="background:${color}"></span>
        <h3>${m.nome}</h3>
        <p>${m.descrizione || "Flashcard per lo studio"}</p>
        ${statBar(agg)}${statLine(agg)}
        <div class="meta">
          <span class="pill">${caps.length} ${caps.length === 1 ? "capitolo" : "capitoli"}</span>
          <span class="pill">${agg.totale} carte</span>
        </div>
      </a>`;
  }));
  app.innerHTML = `
    <div class="page-head"><h1>Le tue materie</h1><p>Scegli una materia per iniziare a ripassare.</p></div>
    <div class="grid">${tiles.join("")}</div>`;
}

async function viewMateria(id) {
  const m = findMateria(id);
  if (!m) { app.innerHTML = `<div class="empty">Materia non trovata.</div>`; return; }
  setBreadcrumb([{ label: "Materie", href: "#/" }, { label: m.nome }]);
  if (!(m.capitoli || []).length) {
    app.innerHTML = `<div class="page-head"><h1>${m.nome}</h1></div>
      <div class="empty">Ancora nessun capitolo. 📝</div>`;
    return;
  }
  app.innerHTML = `<div class="loading">Carico i capitoli…</div>`;
  const caps = await caricaCapitoli(m);
  const tiles = caps.map(({ cap, st }, i) => {
    const color = TILE_COLORS[i % TILE_COLORS.length];
    return `
      <a class="tile" href="#/capitolo/${encodeURIComponent(m.id)}/${encodeURIComponent(cap.id)}">
        <span class="accent-bar" style="background:${color}"></span>
        <h3>${cap.titolo}</h3>
        <p>${cap.descrizione || ""}</p>
        ${statBar(st)}${statLine(st)}
        <div class="meta"><span class="pill">${st.totale} ${st.totale === 1 ? "carta" : "carte"}</span></div>
      </a>`;
  }).join("");
  app.innerHTML = `
    <div class="page-head"><h1>${m.nome}</h1><p>${caps.length} ${caps.length === 1 ? "capitolo" : "capitoli"} · scegli da dove ripartire.</p></div>
    <div class="grid">${tiles}</div>`;
}

async function viewCapitolo(materiaId, capId) {
  const m = findMateria(materiaId);
  const cap = m && (m.capitoli || []).find((c) => c.id === capId);
  if (!m || !cap) { app.innerHTML = `<div class="empty">Capitolo non trovato.</div>`; return; }
  setBreadcrumb([
    { label: "Materie", href: "#/" },
    { label: m.nome, href: `#/materia/${encodeURIComponent(m.id)}` },
    { label: cap.titolo },
  ]);
  app.innerHTML = `<div class="loading">Carico…</div>`;
  let cards = [];
  try { cards = (await getJSON(`${m.cartella}/${cap.file}`)).flashcards || []; }
  catch (e) { app.innerHTML = `<div class="empty">Errore nel caricamento.<br><small>${e.message}</small></div>`; return; }

  const st = statsCapitolo(m.id, cap.id, cards);
  const daRipassareTot = st.daRipassare + st.nuove;
  const base = `#/studia/${encodeURIComponent(m.id)}/${encodeURIComponent(cap.id)}`;
  app.innerHTML = `
    <div class="page-head"><h1>${cap.titolo}</h1><p>${st.totale} carte in totale.</p></div>
    <div class="stats-panel">
      ${statBar(st)}
      <div class="stats-grid">
        <div><b>${st.studiate}</b><span>studiate</span></div>
        <div class="good"><b>${st.sapute}</b><span>sapute</span></div>
        <div class="warn"><b>${st.daRipassare}</b><span>da ripassare</span></div>
        <div class="new"><b>${st.nuove}</b><span>non ancora viste</span></div>
      </div>
    </div>
    <div class="toolbar">
      <a class="btn btn-primary" href="${base}/tutte">▶︎ Studia tutte (${st.totale})</a>
      <a class="btn" href="${base}/mescola">🔀 Mescola tutte</a>
      <a class="btn btn-warn ${daRipassareTot ? "" : "disabled"}" href="${daRipassareTot ? base + "/ripassa" : "#"}">↻ Ripassa ciò che non sai (${daRipassareTot})</a>
    </div>
    <div class="toolbar">
      <button class="btn btn-ghost" id="reset-cap">🗑 Azzera progressi del capitolo</button>
      <a class="btn btn-ghost" href="#/materia/${encodeURIComponent(m.id)}">← Torna ai capitoli</a>
    </div>`;
  document.getElementById("reset-cap").onclick = () => {
    if (confirm("Azzerare i progressi di questo capitolo?")) { resetCapitolo(m.id, cap.id); viewCapitolo(materiaId, capId); }
  };
}

async function viewStudia(materiaId, capId, mode) {
  const m = findMateria(materiaId);
  const cap = m && (m.capitoli || []).find((c) => c.id === capId);
  if (!m || !cap) { app.innerHTML = `<div class="empty">Capitolo non trovato.</div>`; return; }
  setBreadcrumb([
    { label: "Materie", href: "#/" },
    { label: m.nome, href: `#/materia/${encodeURIComponent(m.id)}` },
    { label: cap.titolo, href: `#/capitolo/${encodeURIComponent(m.id)}/${encodeURIComponent(cap.id)}` },
    { label: "Studio" },
  ]);
  app.innerHTML = `<div class="loading">Carico le flashcard…</div>`;
  let cards;
  try { cards = (await getJSON(`${m.cartella}/${cap.file}`)).flashcards || []; }
  catch (e) { app.innerHTML = `<div class="empty">Errore nel caricamento.<br><small>${e.message}</small></div>`; return; }

  if (mode === "ripassa") {
    cards = cards.filter((c) => { const s = getCardState(m.id, cap.id, c); return !s || s.stato !== "known"; });
  } else if (mode === "mescola") {
    cards = shuffle(cards);
  }
  if (!cards.length) {
    app.innerHTML = `<div class="empty">🎉 Niente da ripassare qui: sai già tutte le carte!<br><br>
      <a class="btn btn-ghost" href="#/capitolo/${encodeURIComponent(m.id)}/${encodeURIComponent(cap.id)}">← Torna al capitolo</a></div>`;
    return;
  }
  runStudySession(m, cap, cards);
}

/* ===================== Sessione di studio ===================== */

function runStudySession(m, cap, sessionCards) {
  let cards = sessionCards.slice();
  let index = 0, flipped = false, known = 0, review = 0, combo = 0;
  const reviewPile = [];

  function render() {
    if (index >= cards.length) return renderDone();
    const c = cards[index];
    const saved = getCardState(m.id, cap.id, c);
    const badge = saved
      ? `<span class="card-badge ${saved.stato === "known" ? "good" : "warn"}">${saved.stato === "known" ? "già saputa" : "da ripassare"}</span>`
      : `<span class="card-badge">nuova</span>`;
    const pct = Math.round((index / cards.length) * 100);
    const comboBadge = combo >= 2 ? `<span class="combo-badge">⚡ Combo x${combo}</span>` : "";

    app.innerHTML = `
      <div class="study-head">
        <h1>${cap.titolo}</h1>
        <div style="display:flex;gap:12px;align-items:center;">${comboBadge}<div class="progress">Carta ${index + 1} di ${cards.length}</div></div>
      </div>
      <div class="progress-bar"><span style="width:${pct}%"></span></div>
      <div class="flashcard ${flipped ? "flipped" : ""}" id="card">
        <div class="flashcard-inner">
          <div class="face face-front">
            <span class="tag">Domanda</span>${badge}
            <div class="content">${c.domanda}</div>
            <span class="hint">Clicca o premi spazio per girare</span>
          </div>
          <div class="face face-back">
            <span class="tag">Risposta</span>
            <div class="content">${c.risposta}</div>
            <span class="hint">Come è andata?</span>
          </div>
        </div>
      </div>
      <div class="controls">
        ${flipped
          ? `<button class="btn btn-warn" data-act="review">↻ Da ripassare</button>
             <button class="btn btn-good" data-act="known">✓ La sapevo</button>`
          : `<button class="btn btn-primary" data-act="flip">Mostra risposta</button>`}
      </div>
      <div class="shortcuts">
        <kbd>Spazio</kbd> gira · <kbd>1</kbd> da ripassare · <kbd>2</kbd> la sapevo · <kbd>←</kbd> indietro
      </div>`;

    document.getElementById("card").onclick = () => { flipped = !flipped; render(); };
    app.querySelectorAll("[data-act]").forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); handleAction(b.dataset.act); };
    });
  }

  function popXp(amount) {
    const fc = document.querySelector(".flashcard");
    if (!fc) return;
    const el = document.createElement("div");
    el.className = "xp-pop";
    el.textContent = "+" + amount + " XP";
    fc.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  function handleAction(act) {
    if (act === "flip") { flipped = true; return render(); }
    const c = cards[index];
    if (act === "known") { known++; combo++; recordAnswer(m.id, cap.id, c, "known"); }
    if (act === "review") { review++; combo = 0; reviewPile.push(c); recordAnswer(m.id, cap.id, c, "review"); }

    const ev = awardAnswer(act, combo);
    popXp(ev.gain);
    renderHUD();
    if (ev.leveledUp) showToast(`<span class="toast-big">⭐ Livello ${ev.newLevel}!</span>Continua così!`, "level");
    if (ev.dailyJustDone) showToast(`<span class="toast-big">🎯 Obiettivo del giorno!</span>+${DAILY_BONUS} XP bonus`, "goal");

    index++;
    flipped = false;
    render();
  }

  function prev() { if (index > 0) { index--; flipped = false; render(); } }

  function renderDone() {
    const total = cards.length;
    app.innerHTML = `
      <div class="done-card">
        <div class="big">🎉</div>
        <h2>Sessione completata!</h2>
        <div class="stats">
          <div><b>${total}</b>carte</div>
          <div><b>${known}</b>sapute</div>
          <div><b>${review}</b>da ripassare</div>
          <div><b>${game.bestCombo || 0}</b>combo record</div>
        </div>
        <p class="saved-note">Progressi e XP salvati ✓</p>
        <div class="controls">
          ${reviewPile.length ? `<button class="btn btn-warn" id="redo-review">Ripassa le ${reviewPile.length} da ripassare</button>` : ""}
          <button class="btn btn-ghost" id="shuffle">🔀 Mescola e ricomincia</button>
          <a class="btn btn-primary" href="#/capitolo/${encodeURIComponent(m.id)}/${encodeURIComponent(cap.id)}">← Torna al capitolo</a>
        </div>
      </div>`;
    const redo = document.getElementById("redo-review");
    if (redo) redo.onclick = () => { cards = reviewPile.slice(); reset(); };
    document.getElementById("shuffle").onclick = () => { cards = shuffle(sessionCards); reset(); };
  }

  function reset() { index = 0; flipped = false; known = 0; review = 0; combo = 0; reviewPile.length = 0; render(); }

  function onKey(e) {
    if (index >= cards.length) return;
    if (e.code === "Space") { e.preventDefault(); flipped = !flipped; render(); }
    else if (e.key === "1" && flipped) handleAction("review");
    else if (e.key === "2" && flipped) handleAction("known");
    else if (e.key === "ArrowLeft") prev();
  }
  document.addEventListener("keydown", onKey);
  currentCleanup = () => document.removeEventListener("keydown", onKey);
  render();
}

/* ===================== Router ===================== */

let currentCleanup = null;
function parseHash() {
  return location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
}
async function route() {
  if (currentCleanup) { currentCleanup(); currentCleanup = null; }
  const parts = parseHash();
  window.scrollTo(0, 0);
  renderHUD();
  if (parts[0] === "materia" && parts[1]) await viewMateria(parts[1]);
  else if (parts[0] === "capitolo" && parts[1] && parts[2]) await viewCapitolo(parts[1], parts[2]);
  else if (parts[0] === "studia" && parts[1] && parts[2]) await viewStudia(parts[1], parts[2], parts[3] || "tutte");
  else await viewHome();
}

/* ===================== Avvio ===================== */

async function init() {
  try {
    const manifest = await getJSON("data/subjects.json");
    state.materie = manifest.materie || [];
  } catch (e) {
    app.innerHTML = `<div class="empty">Non riesco a caricare le materie.<br><small>${e.message}</small><br><br>
      Avvia un server locale (<code>python3 -m http.server</code>) oppure pubblica su GitHub Pages.</div>`;
    return;
  }
  renderHUD();
  window.addEventListener("hashchange", route);
  route();
}
init();
