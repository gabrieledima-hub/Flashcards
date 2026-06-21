/* Flashcards — semplice SPA statica con routing via hash.
   Nessun framework, nessun build. Funziona su GitHub Pages.
   La memoria dei progressi è salvata nel browser (localStorage). */

const app = document.getElementById("app");
const breadcrumb = document.getElementById("breadcrumb");

const state = {
  materie: [],     // manifest caricato da data/subjects.json
  cache: {},       // cache dei capitoli già caricati (path -> data)
};

/* ---------- Memoria dei progressi (localStorage) ---------- */

const PROGRESS_KEY = "flashcards-progress-v2";

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
  } catch {
    return {};
  }
}

let progress = loadProgress();

function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch (e) {
    console.warn("Impossibile salvare i progressi:", e);
  }
}

// Chiave stabile di una carta: usa l'eventuale id, altrimenti un hash della domanda.
// Così i progressi reggono anche se le carte vengono riordinate.
function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return "h" + (h >>> 0).toString(36);
}
function cardKey(card) {
  return card.id ? "id:" + card.id : hashString(card.domanda || "");
}
function bucketId(materiaId, capId) {
  return materiaId + "::" + capId;
}

function getCardState(materiaId, capId, card) {
  const b = progress[bucketId(materiaId, capId)];
  return b ? b[cardKey(card)] : undefined;
}

// esito: "known" oppure "review"
function recordAnswer(materiaId, capId, card, esito) {
  const bId = bucketId(materiaId, capId);
  if (!progress[bId]) progress[bId] = {};
  const k = cardKey(card);
  const prev = progress[bId][k] || { viste: 0, sapute: 0, ripassi: 0 };
  prev.viste += 1;
  if (esito === "known") prev.sapute += 1;
  else prev.ripassi += 1;
  prev.stato = esito;           // ultimo esito: known | review
  prev.ultimo = Date.now();
  progress[bId][k] = prev;
  saveProgress();
}

function resetCapitolo(materiaId, capId) {
  delete progress[bucketId(materiaId, capId)];
  saveProgress();
}

// Statistiche di un capitolo, date le sue carte.
function statsCapitolo(materiaId, capId, cards) {
  let sapute = 0, daRipassare = 0, studiate = 0;
  for (const c of cards) {
    const s = getCardState(materiaId, capId, c);
    if (!s) continue;
    studiate++;
    if (s.stato === "known") sapute++;
    else daRipassare++;
  }
  const totale = cards.length;
  return { totale, studiate, sapute, daRipassare, nuove: totale - studiate };
}

/* ---------- Utilità ---------- */

async function getJSON(path) {
  if (state.cache[path]) return state.cache[path];
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Impossibile caricare ${path} (${res.status})`);
  const data = await res.json();
  state.cache[path] = data;
  return data;
}

function findMateria(id) {
  return state.materie.find((m) => m.id === id);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function setBreadcrumb(parts) {
  breadcrumb.innerHTML = parts
    .map((p, i) => {
      const sep = i > 0 ? '<span class="sep">/</span>' : "";
      return p.href ? `${sep}<a href="${p.href}">${p.label}</a>` : `${sep}<span>${p.label}</span>`;
    })
    .join(" ");
}

// Barra di avanzamento "sapute / da ripassare / nuove".
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

// Carica tutti i capitoli di una materia (in parallelo), con dati e statistiche.
async function caricaCapitoli(m) {
  const capitoli = m.capitoli || [];
  return Promise.all(
    capitoli.map(async (c) => {
      let cards = [];
      try {
        const data = await getJSON(`${m.cartella}/${c.file}`);
        cards = data.flashcards || [];
      } catch {
        cards = [];
      }
      return { cap: c, cards, st: statsCapitolo(m.id, c.id, cards) };
    })
  );
}

/* ---------- Viste ---------- */

async function viewHome() {
  setBreadcrumb([{ label: "Materie" }]);

  if (!state.materie.length) {
    app.innerHTML = `<div class="empty">Nessuna materia ancora. Aggiungine una in <code>data/subjects.json</code>.</div>`;
    return;
  }

  app.innerHTML = `<div class="loading">Carico le materie…</div>`;

  const tiles = await Promise.all(
    state.materie.map(async (m) => {
      const caps = await caricaCapitoli(m);
      const agg = caps.reduce(
        (a, c) => ({
          totale: a.totale + c.st.totale,
          studiate: a.studiate + c.st.studiate,
          sapute: a.sapute + c.st.sapute,
          daRipassare: a.daRipassare + c.st.daRipassare,
          nuove: a.nuove + c.st.nuove,
        }),
        { totale: 0, studiate: 0, sapute: 0, daRipassare: 0, nuove: 0 }
      );
      const nCap = caps.length;
      const color = m.colore || "var(--accent)";
      return `
        <a class="tile" href="#/materia/${encodeURIComponent(m.id)}">
          <span class="accent-bar" style="background:${color}"></span>
          <h3>${m.nome}</h3>
          <p>${m.descrizione || "Flashcard per lo studio"}</p>
          ${statBar(agg)}
          ${statLine(agg)}
          <div class="meta">
            <span class="pill">${nCap} ${nCap === 1 ? "capitolo" : "capitoli"}</span>
            <span class="pill">${agg.totale} carte</span>
          </div>
        </a>`;
    })
  );

  app.innerHTML = `
    <div class="page-head">
      <h1>Le tue materie</h1>
      <p>Scegli una materia per iniziare a ripassare.</p>
    </div>
    <div class="grid">${tiles.join("")}</div>`;
}

async function viewMateria(id) {
  const m = findMateria(id);
  if (!m) {
    app.innerHTML = `<div class="empty">Materia non trovata.</div>`;
    return;
  }

  setBreadcrumb([{ label: "Materie", href: "#/" }, { label: m.nome }]);

  if (!(m.capitoli || []).length) {
    app.innerHTML = `
      <div class="page-head"><h1>${m.nome}</h1></div>
      <div class="empty">Ancora nessun capitolo. Le flashcard verranno aggiunte qui presto. 📝</div>`;
    return;
  }

  app.innerHTML = `<div class="loading">Carico i capitoli…</div>`;
  const caps = await caricaCapitoli(m);

  const tiles = caps
    .map(({ cap, st }) => {
      return `
        <a class="tile" href="#/capitolo/${encodeURIComponent(m.id)}/${encodeURIComponent(cap.id)}">
          <span class="accent-bar" style="background:${m.colore || "var(--accent)"}"></span>
          <h3>${cap.titolo}</h3>
          <p>${cap.descrizione || ""}</p>
          ${statBar(st)}
          ${statLine(st)}
          <div class="meta"><span class="pill">${st.totale} ${st.totale === 1 ? "carta" : "carte"}</span></div>
        </a>`;
    })
    .join("");

  app.innerHTML = `
    <div class="page-head">
      <h1>${m.nome}</h1>
      <p>${caps.length} ${caps.length === 1 ? "capitolo" : "capitoli"} · scegli da dove ripartire.</p>
    </div>
    <div class="grid">${tiles}</div>`;
}

// Schermata del capitolo: statistiche + scelta della modalità di studio.
async function viewCapitolo(materiaId, capId) {
  const m = findMateria(materiaId);
  const cap = m && (m.capitoli || []).find((c) => c.id === capId);
  if (!m || !cap) {
    app.innerHTML = `<div class="empty">Capitolo non trovato.</div>`;
    return;
  }

  setBreadcrumb([
    { label: "Materie", href: "#/" },
    { label: m.nome, href: `#/materia/${encodeURIComponent(m.id)}` },
    { label: cap.titolo },
  ]);

  app.innerHTML = `<div class="loading">Carico…</div>`;
  let cards = [];
  try {
    cards = (await getJSON(`${m.cartella}/${cap.file}`)).flashcards || [];
  } catch (e) {
    app.innerHTML = `<div class="empty">Errore nel caricamento.<br><small>${e.message}</small></div>`;
    return;
  }

  const st = statsCapitolo(m.id, cap.id, cards);
  const daRipassareTot = st.daRipassare + st.nuove; // ciò che non sai ancora
  const base = `#/studia/${encodeURIComponent(m.id)}/${encodeURIComponent(cap.id)}`;

  app.innerHTML = `
    <div class="page-head">
      <h1>${cap.titolo}</h1>
      <p>${st.totale} carte in totale.</p>
    </div>

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
      <a class="btn btn-warn ${daRipassareTot ? "" : "disabled"}" href="${daRipassareTot ? base + "/ripassa" : "#"}">
        ↻ Ripassa ciò che non sai (${daRipassareTot})
      </a>
    </div>
    <div class="toolbar">
      <button class="btn btn-ghost" id="reset-cap">🗑 Azzera progressi del capitolo</button>
      <a class="btn btn-ghost" href="#/materia/${encodeURIComponent(m.id)}">← Torna ai capitoli</a>
    </div>`;

  document.getElementById("reset-cap").onclick = () => {
    if (confirm("Azzerare i progressi di questo capitolo? L'operazione non è reversibile.")) {
      resetCapitolo(m.id, cap.id);
      viewCapitolo(materiaId, capId);
    }
  };
}

async function viewStudia(materiaId, capId, mode) {
  const m = findMateria(materiaId);
  const cap = m && (m.capitoli || []).find((c) => c.id === capId);
  if (!m || !cap) {
    app.innerHTML = `<div class="empty">Capitolo non trovato.</div>`;
    return;
  }

  setBreadcrumb([
    { label: "Materie", href: "#/" },
    { label: m.nome, href: `#/materia/${encodeURIComponent(m.id)}` },
    { label: cap.titolo, href: `#/capitolo/${encodeURIComponent(m.id)}/${encodeURIComponent(cap.id)}` },
    { label: "Studio" },
  ]);

  app.innerHTML = `<div class="loading">Carico le flashcard…</div>`;
  let cards;
  try {
    cards = (await getJSON(`${m.cartella}/${cap.file}`)).flashcards || [];
  } catch (e) {
    app.innerHTML = `<div class="empty">Errore nel caricamento delle carte.<br><small>${e.message}</small></div>`;
    return;
  }

  if (mode === "ripassa") {
    // Solo ciò che non sai ancora: stato "review" oppure mai viste.
    cards = cards.filter((c) => {
      const s = getCardState(m.id, cap.id, c);
      return !s || s.stato !== "known";
    });
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

/* ---------- Sessione di studio ---------- */

function runStudySession(m, cap, sessionCards) {
  let cards = sessionCards.slice();
  let index = 0;
  let flipped = false;
  let known = 0;
  let review = 0;
  const reviewPile = [];

  function render() {
    if (index >= cards.length) return renderDone();

    const c = cards[index];
    const saved = getCardState(m.id, cap.id, c);
    const badge = saved
      ? `<span class="card-badge ${saved.stato === "known" ? "good" : "warn"}">${saved.stato === "known" ? "già saputa" : "da ripassare"}</span>`
      : `<span class="card-badge new">nuova</span>`;
    const pct = Math.round((index / cards.length) * 100);

    app.innerHTML = `
      <div class="study-head">
        <h1>${cap.titolo}</h1>
        <div class="progress">Carta ${index + 1} di ${cards.length}</div>
      </div>
      <div class="progress-bar"><span style="width:${pct}%"></span></div>

      <div class="flashcard ${flipped ? "flipped" : ""}" id="card">
        <div class="flashcard-inner">
          <div class="face face-front">
            <span class="tag">Domanda</span>
            ${badge}
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
        ${
          flipped
            ? `<button class="btn btn-warn" data-act="review">↻ Da ripassare</button>
               <button class="btn btn-good" data-act="known">✓ La sapevo</button>`
            : `<button class="btn btn-primary" data-act="flip">Mostra risposta</button>`
        }
      </div>

      <div class="shortcuts">
        <kbd>Spazio</kbd> gira · <kbd>1</kbd> da ripassare · <kbd>2</kbd> la sapevo · <kbd>←</kbd> indietro
      </div>`;

    document.getElementById("card").onclick = () => {
      flipped = !flipped;
      render();
    };
    app.querySelectorAll("[data-act]").forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        handleAction(b.dataset.act);
      };
    });
  }

  function handleAction(act) {
    if (act === "flip") {
      flipped = true;
      return render();
    }
    const c = cards[index];
    if (act === "known") {
      known++;
      recordAnswer(m.id, cap.id, c, "known");   // ← memoria persistente
    }
    if (act === "review") {
      review++;
      reviewPile.push(c);
      recordAnswer(m.id, cap.id, c, "review");  // ← memoria persistente
    }
    index++;
    flipped = false;
    render();
  }

  function prev() {
    if (index > 0) {
      index--;
      flipped = false;
      render();
    }
  }

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
        </div>
        <p class="saved-note">I progressi sono stati salvati ✓</p>
        <div class="controls">
          ${reviewPile.length ? `<button class="btn btn-warn" id="redo-review">Ripassa le ${reviewPile.length} da ripassare</button>` : ""}
          <button class="btn btn-ghost" id="shuffle">🔀 Mescola e ricomincia</button>
          <a class="btn btn-primary" href="#/capitolo/${encodeURIComponent(m.id)}/${encodeURIComponent(cap.id)}">← Torna al capitolo</a>
        </div>
      </div>`;

    const redo = document.getElementById("redo-review");
    if (redo)
      redo.onclick = () => {
        cards = reviewPile.slice();
        reset();
      };
    document.getElementById("shuffle").onclick = () => {
      cards = shuffle(sessionCards);
      reset();
    };
  }

  function reset() {
    index = 0;
    flipped = false;
    known = 0;
    review = 0;
    reviewPile.length = 0;
    render();
  }

  function onKey(e) {
    if (index >= cards.length) return;
    if (e.code === "Space") {
      e.preventDefault();
      flipped = !flipped;
      render();
    } else if (e.key === "1" && flipped) {
      handleAction("review");
    } else if (e.key === "2" && flipped) {
      handleAction("known");
    } else if (e.key === "ArrowLeft") {
      prev();
    }
  }
  document.addEventListener("keydown", onKey);
  currentCleanup = () => document.removeEventListener("keydown", onKey);

  render();
}

/* ---------- Router ---------- */

let currentCleanup = null;

function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  return h.split("/").filter(Boolean).map(decodeURIComponent);
}

async function route() {
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }
  const parts = parseHash();
  window.scrollTo(0, 0);

  if (parts[0] === "materia" && parts[1]) {
    await viewMateria(parts[1]);
  } else if (parts[0] === "capitolo" && parts[1] && parts[2]) {
    await viewCapitolo(parts[1], parts[2]);
  } else if (parts[0] === "studia" && parts[1] && parts[2]) {
    await viewStudia(parts[1], parts[2], parts[3] || "tutte");
  } else {
    await viewHome();
  }
}

/* ---------- Avvio ---------- */

async function init() {
  try {
    const manifest = await getJSON("data/subjects.json");
    state.materie = manifest.materie || [];
  } catch (e) {
    app.innerHTML = `<div class="empty">Non riesco a caricare le materie.<br>
      <small>${e.message}</small><br><br>
      Se stai aprendo il file direttamente dal disco, avvia un piccolo server locale
      (es. <code>python3 -m http.server</code>) oppure pubblica su GitHub Pages.</small></div>`;
    return;
  }
  window.addEventListener("hashchange", route);
  route();
}

init();
