# 📚 Flashcards

Una piccola piattaforma statica per studiare con le flashcard, una materia alla volta.
Nessun framework, nessun build: basta HTML, CSS e un po' di JavaScript. Perfetta per GitHub Pages.

## Come funziona

- **Home** → elenco delle materie
- **Materia** → elenco dei capitoli
- **Studio** → carte che si girano (clic o `Spazio`), con segna "la sapevo" / "da ripassare",
  mescola, ripeti solo le sbagliate.

Scorciatoie da tastiera: `Spazio` gira la carta · `1` da ripassare · `2` la sapevo · `←` carta precedente.

## Struttura del progetto

```
Flashcards/
├── index.html
├── css/style.css
├── js/app.js
├── data/subjects.json          ← elenco delle materie e dei capitoli
└── Tecnica della comunicazione/
    └── capitolo-01.json         ← le flashcard di un capitolo
```

## Aggiungere flashcard a un capitolo

Modifica il file JSON del capitolo (es. `Tecnica della comunicazione/capitolo-01.json`):

```json
{
  "titolo": "Capitolo 1 — Titolo",
  "flashcards": [
    { "domanda": "Che cos'è la comunicazione?", "risposta": "..." },
    { "domanda": "...", "risposta": "..." }
  ]
}
```

## Aggiungere un capitolo

1. Crea il file JSON nella cartella della materia (es. `capitolo-02.json`).
2. Aggiungilo all'elenco `capitoli` dentro `data/subjects.json`.

## Aggiungere una materia

1. Crea una cartella con il nome della materia.
2. Aggiungi un blocco in `data/subjects.json` con `id`, `nome`, `cartella` e i `capitoli`.

## Provare in locale

I browser non leggono i JSON aprendo il file direttamente dal disco. Avvia un mini server:

```bash
python3 -m http.server
# poi apri http://localhost:8000
```

## Pubblicare su GitHub Pages

1. Crea un repository su GitHub e carica questi file.
2. Settings → Pages → Source: `main` / root.
3. Il sito sarà online su `https://<utente>.github.io/<repo>/`.
