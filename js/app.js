/* Flashcards — semplice SPA statica con routing via hash.
   Nessun framework, nessun build. Funziona su GitHub Pages. */

const app = document.getElementById("app");
const breadcrumb = document.getElementById("breadcrumb");

const state = {
  materie: [],        // manifest caricato da data/subjects.json
};

/* ---------- Utilità ---------- */

async function getJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Impossibile caricare ${path} (${res.status})`);
  return res.json();
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

/* ---------- Viste ---------- */

function viewHome() {
  setBreadcrumb([{ label: "Materie" }]);

  if (!state.materie.length) {
    app.innerHTML = `<div class="empty">Nessuna materia ancora. Aggiungine una in <code>data/subjects.json</code>.</div>`;
    return;
  }

  const tiles = state.materie
    .map((m) => {
      const nCap = (m.capitoli || []).length;
      const color = m.colore || "var(--accent)";
      return `
        <a class="tile" href="#/materia/${encodeURIComponent(m.id)}">
          <span class="accent-bar" style="background:${color}"></span>
          <h3>${m.nome}</h3>
          <p>${m.descrizione || "Flashcard per lo studio"}</p>
          <div class="meta">
            <span class="pill">${nCap} ${nCap === 1 ? "capitolo" : "capitoli"}</span>
          </div>
        </a>`;
    })
    .join("");

  app.innerHTML = `
    <div class="page-head">
      <h1>Le tue materie</h1>
      <p>Scegli una materia per iniziare a ripassare.</p>
    </div>
    <div class="grid">${tiles}</div>`;
}

async function viewMateria(id) {
  const m = findMateria(id);
  if (!m) {
    app.innerHTML = `<div class="empty">Materia non trovata.</div>`;
    return;
  }

  setBreadcrumb([
    { label: "Materie", href: "#/" },
    { label: m.nome },
  ]);

  const capitoli = m.capitoli || [];
  if (!capitoli.length) {
    app.innerHTML = `
      <div class="page-head"><h1>${m.nome}</h1></div>
      <div class="empty">Ancora nessun capitolo. Le flashcard verranno aggiunte qui presto. 📝</div>`;
    return;
  }

  // Carica i conteggi delle carte per ogni capitolo (in parallelo).
  app.innerHTML = `<div class="loading">Carico i capitoli…</div>`;
  const counts = await Promise.all(
    capitoli.map(async (c) => {
      try {
        const data = await getJSON(`${m.cartella}/${c.file}`);
        return (data.flashcards || []).length;
      } catch {
        return 0;
      }
    })
  );

  const tiles = capitoli
    .map((c, i) => {
      const n = counts[i];
      return `
        <a class="tile" href="#/studia/${encodeURIComponent(m.id)}/${encodeURIComponent(c.id)}">
          <span class="accent-bar" style="background:${m.colore || "var(--accent)"}"></span>
          <h3>${c.titolo}</h3>
          <p>${c.descrizione || ""}</p>
          <div class="meta"><span class="pill">${n} ${n === 1 ? "carta" : "carte"}</span></div>
        </a>`;
    })
    .join("");

  app.innerHTML = `
    <div class="page-head">
      <h1>${m.nome}</h1>
      <p>${capitoli.length} ${capitoli.length === 1 ? "capitolo" : "capitoli"} · scegli da dove ripartire.</p>
    </div>
    <div class="grid">${tiles}</div>`;
}

async function viewStudia(materiaId, capitoloId) {
  const m = findMateria(materiaId);
  const cap = m && (m.capitoli || []).find((c) => c.id === capitoloId);
  if (!m || !cap) {
    app.innerHTML = `<div class="empty">Capitolo non trovato.</div>`;
    return;
  }

  setBreadcrumb([
    { label: "Materie", href: "#/" },
    { label: m.nome, href: `#/materia/${encodeURIComponent(m.id)}` },
    { label: cap.titolo },
  ]);

  app.innerHTML = `<div class="loading">Carico le flashcard…</div>`;

  let data;
  try {
    data = await getJSON(`${m.cartella}/${cap.file}`);
  } catch (e) {
    app.innerHTML = `<div class="empty">Errore nel caricamento delle carte.<br><small>${e.message}</small></div>`;
    return;
  }

  let cards = data.flashcards || [];
  if (!cards.length) {
    app.innerHTML = `<div class="empty">Questo capitolo non ha ancora flashcard.</div>`;
    return;
  }

  runStudySession(m, cap, cards);
}

/* ---------- Sessione di studio ---------- */

function runStudySession(m, cap, originalCards) {
  let cards = originalCards.slice();
  let index = 0;
  let flipped = false;
  let known = 0;
  let review = 0;
  const reviewPile = [];

  function render() {
    if (index >= cards.length) return renderDone();

    const c = cards[index];
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
    if (act === "known") known++;
    if (act === "review") {
      review++;
      reviewPile.push(cards[index]);
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
        <h2>Capitolo completato!</h2>
        <div class="stats">
          <div><b>${total}</b>carte</div>
          <div><b>${known}</b>sapute</div>
          <div><b>${review}</b>da ripassare</div>
        </div>
        <div class="controls">
          ${reviewPile.length ? `<button class="btn btn-warn" id="redo-review">Ripassa le ${reviewPile.length} sbagliate</button>` : ""}
          <button class="btn btn-primary" id="restart">Ricomincia</button>
          <button class="btn btn-ghost" id="shuffle">Mescola e ricomincia</button>
          <a class="btn btn-ghost" href="#/materia/${encodeURIComponent(m.id)}">← Torna ai capitoli</a>
        </div>
      </div>`;

    const redo = document.getElementById("redo-review");
    if (redo)
      redo.onclick = () => {
        cards = reviewPile.slice();
        reset();
      };
    document.getElementById("restart").onclick = () => {
      cards = originalCards.slice();
      reset();
    };
    document.getElementById("shuffle").onclick = () => {
      cards = shuffle(originalCards);
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

  // Scorciatoie da tastiera (rimosse quando si cambia rotta).
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
  } else if (parts[0] === "studia" && parts[1] && parts[2]) {
    await viewStudia(parts[1], parts[2]);
  } else {
    viewHome();
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
