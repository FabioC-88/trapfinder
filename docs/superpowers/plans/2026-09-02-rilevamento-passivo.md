# Rilevamento passivo — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalizzare il rilevamento trappole del modulo in un sistema di rilevamento passivo che copre trappole, indizi, porte segrete e creature nascoste, con notifica mirata al giocatore e proposta di sorpresa a inizio combattimento.

**Architecture:** Un nucleo puro in `core/` decide (dedup → raggio → visuale → passiva contro CD) e notifica; le sorgenti in `tools/` traducono Region, muri e token in una forma normalizzata detta *rilevabile*. Il nucleo non tocca mai un documento Foundry: la persistenza entra da callback, il che lo rende testabile con vitest senza Foundry.

**Tech Stack:** Foundry VTT v13+ (verificato 14), sistema dnd5e 4.0+, moduli ES caricati direttamente senza bundler, vitest solo per `core/`.

**Spec:** `docs/superpowers/specs/2026-09-02-rilevamento-passivo-design.md`

## Global Constraints

- Module id: `trapfinder`. Non cambia mai: è dentro gli URL di manifest/download e dentro il tipo dei RegionBehavior salvati nei mondi.
- Namespace i18n: `DND5E_GM_TOOLKIT`. Ogni stringa mostrata all'utente passa da `lang/en.json` **e** `lang/it.json`.
- Nessun bundler, nessuna dipendenza a runtime. Foundry carica i moduli ES direttamente: ogni import deve avere l'estensione `.js` esplicita e un percorso relativo.
- `core/` non importa **nulla** da `scripts/` né da `tools/`. Riceve `moduleId` come parametro, seguendo il pattern già in uso (`register(moduleId)`, `onReady(moduleId)`).
- Tutti gli hook girano **solo lato DM** (`if (!game.user.isGM) return;`), come già oggi.
- Ogni nuovo `game.settings.register` che influisce su registrazioni fatte una volta per caricamento pagina usa `requiresReload: true`, come i due esistenti.
- Il modulo **non tira mai i dadi**: confronta solo valori passivi.
- `.github/workflows/release.yml` zippa un **elenco esplicito** di cartelle. Ogni cartella nuova va aggiunta lì o la release esce rotta pur funzionando in sviluppo.

## Scostamenti dalla spec

Tre raffinamenti alla forma del *rilevabile*, decisi scrivendo il piano e già riportati nella spec:

1. `fallbackKey` si sdoppia in **`spottedKey`** e **`missedKey`**: servono due testi diversi e la spec ne prevedeva uno solo.
2. Nuovo campo **`sightPoint`**: il punto usato per il test di visuale, distinto da `point` usato per la distanza. Serve alle porte segrete, dove il bersaglio è il muro stesso.
3. Il `message` personalizzato vale **solo in caso di riuscita**. Al fallimento si usa sempre il testo generico: il testo personalizzato descrive ciò che si nota, e chi fallisce non nota niente.

## Struttura dei file

| File | Responsabilità | Puro? |
|---|---|---|
| `core/detection.js` | la sequenza decisionale, nient'altro | sì, testato |
| `core/recipients.js` | chi riceve chat e chi riceve toast | sì, testato |
| `core/geometry.js` | punto più vicino su segmento/bbox, arretramento | parte pura testata, wrapper Foundry no |
| `core/notify.js` | ChatMessage, socket, `ui.notifications` | no |
| `tools/passive-detection/index.js` | interruttore, registrazione behavior, hook | no |
| `tools/passive-detection/passive-detection-behavior.js` | schema del Region behavior | no |
| `tools/passive-detection/sources.js` | Region e muri → rilevabili | no |
| `tools/passive-detection/wall-config.js` | campi iniettati nella scheda muro | no |
| `tools/passive-detection/migration.js` | ricreazione dei behavior del tipo vecchio | no |
| `tools/hidden-creatures/index.js` | interruttore, hook simmetrici, reset | no |
| `tools/hidden-creatures/sources.js` | token nascosti → rilevabili | no |
| `tools/hidden-creatures/marker-guard.js` | avviso su marcatori incoerenti | no |
| `tools/hidden-creatures/surprise.js` | proposta di sorpresa | no |
| `scripts/constants.js` | chiavi di impostazioni e flag | — |

## Ordine e stato funzionante

Le task 1-4 costruiscono il nucleo **senza toccare** `trap-detection`, che resta funzionante. Le task 5-7 lo convertono in tre passi, ciascuno dei quali lascia il modulo funzionante. Dalla task 9 in poi si aggiungono soggetti nuovi.

Le due parti a rischio dichiarate nella spec sono la **task 8** (iniezione nella scheda muro) e la **task 9** (arretramento del punto di visuale). Chi esegue può anticipare una prova manuale della task 8 in Foundry prima di scrivere il resto: se l'hook non regge, il ripiego è già scritto nella task.

---

### Task 1: Nucleo decisionale e tooling di test

**Files:**
- Create: `package.json`
- Create: `core/detection.js`
- Test: `tests/detection.test.js`
- Modify: `.github/workflows/release.yml:41` (aggiungere `core` all'elenco zippato)

**Interfaces:**
- Consumes: niente.
- Produces: `runDetection({observer, detectables, measure, isSightBlocked, report}) -> Promise<DetectionResult[]>` dove `DetectionResult = {observer, detectable, passive, spotted}`. Definisce la forma `Detectable` usata da ogni task successiva.

- [ ] **Step 1: Installare vitest**

```bash
npm init -y
npm install --save-dev vitest
```

Poi sostituire il `package.json` generato con questo (rimuove i campi inutili di `npm init` e aggiunge gli script; lasciare la versione di vitest che npm ha appena scritto):

```json
{
  "name": "trapfinder",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

Nessun file di configurazione vitest: il pattern di default trova già `tests/*.test.js`.
`node_modules/` è già in `.gitignore`, e l'elenco esplicito dello zip di release esclude da sé `package.json`, `tests/` e `docs/`.

- [ ] **Step 2: Aggiungere `core` allo zip di release**

In `.github/workflows/release.yml`, nello step "Create Zip Archive":

```yaml
          zip -r "$ZIP_NAME" module.json scripts core tools lib lang templates styles README.md LICENSE
```

Senza questa riga la release esce senza il nucleo: in sviluppo tutto funziona, una volta installata dal manifest il modulo va in errore a ogni import.

- [ ] **Step 3: Scrivere i test che falliscono**

Creare `tests/detection.test.js`:

```js
import { describe, expect, it, vi } from "vitest";
import { runDetection } from "../core/detection.js";

function observer({ prc = 12, inv = 10 } = {}) {
  return { id: "pc1", name: "Elandra", system: { skills: { prc: { passive: prc }, inv: { passive: inv } } } };
}

function detectable(overrides = {}) {
  return {
    key: "t1",
    skill: "prc",
    dc: 10,
    point: { x: 0, y: 0 },
    sightPoint: { x: 0, y: 0 },
    range: 10,
    message: null,
    spottedKey: "spotted",
    missedKey: "missed",
    requiresSight: true,
    hasSeen: () => false,
    markSeen: vi.fn(async () => {}),
    ...overrides
  };
}

const near = () => 5;
const far = () => 50;
const clear = () => false;
const blocked = () => true;

describe("runDetection", () => {
  it("salta un rilevabile già visto senza notificare né segnare", async () => {
    const report = vi.fn();
    const d = detectable({ hasSeen: () => true });

    const results = await runDetection({
      observer: observer(), detectables: [d], measure: near, isSightBlocked: clear, report
    });

    expect(results).toEqual([]);
    expect(report).not.toHaveBeenCalled();
    expect(d.markSeen).not.toHaveBeenCalled();
  });

  it("salta un rilevabile fuori raggio senza segnarlo, così resta valutabile più avanti", async () => {
    const report = vi.fn();
    const d = detectable();

    await runDetection({
      observer: observer(), detectables: [d], measure: far, isSightBlocked: clear, report
    });

    expect(report).not.toHaveBeenCalled();
    expect(d.markSeen).not.toHaveBeenCalled();
  });

  it("individua quando la passiva eguaglia la CD", async () => {
    const report = vi.fn();
    const d = detectable({ dc: 12 });

    const [result] = await runDetection({
      observer: observer({ prc: 12 }), detectables: [d], measure: near, isSightBlocked: clear, report
    });

    expect(result.spotted).toBe(true);
    expect(result.passive).toBe(12);
    expect(report).toHaveBeenCalledWith(result);
  });

  it("segna come visto anche chi fallisce, per non ripetere la notifica al DM", async () => {
    const report = vi.fn();
    const d = detectable({ dc: 20 });

    const [result] = await runDetection({
      observer: observer({ prc: 12 }), detectables: [d], measure: near, isSightBlocked: clear, report
    });

    expect(result.spotted).toBe(false);
    expect(d.markSeen).toHaveBeenCalledOnce();
  });

  it("salta se la visuale è bloccata e il rilevabile la richiede", async () => {
    const report = vi.fn();
    const d = detectable({ requiresSight: true });

    await runDetection({
      observer: observer(), detectables: [d], measure: near, isSightBlocked: blocked, report
    });

    expect(report).not.toHaveBeenCalled();
    expect(d.markSeen).not.toHaveBeenCalled();
  });

  it("valuta comunque se il rilevabile non richiede visuale", async () => {
    const report = vi.fn();
    const d = detectable({ requiresSight: false });

    await runDetection({
      observer: observer(), detectables: [d], measure: near, isSightBlocked: blocked, report
    });

    expect(report).toHaveBeenCalledOnce();
  });

  it("usa sightPoint per la visuale e point per la distanza", async () => {
    const measure = vi.fn(() => 5);
    const isSightBlocked = vi.fn(() => false);
    const d = detectable({ point: { x: 1, y: 1 }, sightPoint: { x: 2, y: 2 } });

    await runDetection({
      observer: observer(), detectables: [d], measure, isSightBlocked, report: vi.fn()
    });

    expect(measure).toHaveBeenCalledWith({ x: 1, y: 1 });
    expect(isSightBlocked).toHaveBeenCalledWith({ x: 2, y: 2 });
  });

  it("legge la skill indicata dal rilevabile", async () => {
    const d = detectable({ skill: "inv", dc: 11 });

    const [result] = await runDetection({
      observer: observer({ prc: 20, inv: 11 }), detectables: [d], measure: near, isSightBlocked: clear, report: vi.fn()
    });

    expect(result.passive).toBe(11);
    expect(result.spotted).toBe(true);
  });

  it("tratta una skill assente come passiva 0 invece di esplodere", async () => {
    const d = detectable({ skill: "prc", dc: 1 });

    const [result] = await runDetection({
      observer: { id: "pc1", name: "Elandra", system: {} },
      detectables: [d], measure: near, isSightBlocked: clear, report: vi.fn()
    });

    expect(result.passive).toBe(0);
    expect(result.spotted).toBe(false);
  });

  it("valuta più rilevabili nello stesso passaggio", async () => {
    const report = vi.fn();

    const results = await runDetection({
      observer: observer({ prc: 15 }),
      detectables: [detectable({ key: "a", dc: 10 }), detectable({ key: "b", dc: 20 })],
      measure: near, isSightBlocked: clear, report
    });

    expect(results.map(r => r.spotted)).toEqual([true, false]);
    expect(report).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 4: Eseguire i test e verificare che falliscano**

Run: `npm test`
Expected: FAIL, `Failed to resolve import "../core/detection.js"`

- [ ] **Step 5: Scrivere l'implementazione minima**

Creare `core/detection.js`:

```js
/**
 * The one decision this module makes, for every kind of subject: has this observer already
 * resolved this target, is it close enough, can it be seen, and does the observer's passive
 * skill meet the DC.
 *
 * Deliberately free of Foundry globals: distance, line of sight, persistence and messaging all
 * enter as callbacks. That is what makes it unit-testable, and what lets a new kind of subject
 * ship as a new source with no change here.
 *
 * @typedef {object} Detectable
 * @property {string} key            Stable identity of the target, for debugging.
 * @property {string} skill          dnd5e skill key read on the observer, e.g. "prc" or "inv".
 * @property {number} dc             Passive value the observer must meet or beat.
 * @property {{x: number, y: number}} point       Measured against for range.
 * @property {{x: number, y: number}} sightPoint  Measured against for line of sight.
 * @property {number} range          In scene units.
 * @property {string|null} message   Custom text, used on success only.
 * @property {string} spottedKey     i18n key used on success when there is no custom message.
 * @property {string} missedKey      i18n key used on failure, always.
 * @property {boolean} requiresSight
 * @property {() => boolean} hasSeen
 * @property {() => Promise<void>} markSeen
 *
 * @typedef {object} DetectionResult
 * @property {object} observer
 * @property {Detectable} detectable
 * @property {number} passive
 * @property {boolean} spotted
 */

/**
 * @param {object} options
 * @param {object} options.observer                                Actor of the observing PC.
 * @param {Detectable[]} options.detectables
 * @param {(point: {x: number, y: number}) => number} options.measure          Scene-unit distance.
 * @param {(point: {x: number, y: number}) => boolean} options.isSightBlocked
 * @param {(result: DetectionResult) => Promise<void>} options.report
 * @returns {Promise<DetectionResult[]>}
 */
export async function runDetection({ observer, detectables, measure, isSightBlocked, report }) {
  const results = [];

  for (const detectable of detectables) {
    if (detectable.hasSeen()) continue;
    if (measure(detectable.point) > detectable.range) continue;
    if (detectable.requiresSight && isSightBlocked(detectable.sightPoint)) continue;

    const passive = observer.system?.skills?.[detectable.skill]?.passive ?? 0;
    const result = { observer, detectable, passive, spotted: passive >= detectable.dc };

    await report(result);
    // Marked even on a failure: the PC has had their chance at this target and a second
    // notification would only tell the GM the same thing again.
    await detectable.markSeen();
    results.push(result);
  }

  return results;
}
```

- [ ] **Step 6: Eseguire i test e verificare che passino**

Run: `npm test`
Expected: PASS, 10 test

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json core/detection.js tests/detection.test.js .github/workflows/release.yml
git commit -m "feat(core): nucleo decisionale del rilevamento passivo, con test"
```

---

### Task 2: Scelta dei destinatari

**Files:**
- Create: `core/recipients.js`
- Test: `tests/recipients.test.js`

**Interfaces:**
- Consumes: niente.
- Produces: `detectionRecipients({actor, spotted, users, toastEnabled}) -> {chat: string[], toast: string[]}`.

- [ ] **Step 1: Scrivere i test che falliscono**

Creare `tests/recipients.test.js`:

```js
import { describe, expect, it } from "vitest";
import { detectionRecipients } from "../core/recipients.js";

const gm = { id: "gm1", isGM: true, active: true };
const player = { id: "u1", isGM: false, active: true };
const offline = { id: "u2", isGM: false, active: false };
const stranger = { id: "u3", isGM: false, active: true };

/** An actor owned by everyone in `owners`. */
function actorOwnedBy(...owners) {
  const ids = owners.map(u => u.id);
  return { testUserPermission: (user, level) => level === "OWNER" && ids.includes(user.id) };
}

describe("detectionRecipients", () => {
  it("manda un fallimento solo al DM, mai al giocatore", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: false, users: [gm, player], toastEnabled: true
    });

    expect(result).toEqual({ chat: ["gm1"], toast: [] });
  });

  it("manda una riuscita al proprietario e al DM", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: true, users: [gm, player, stranger], toastEnabled: true
    });

    expect(result.chat.sort()).toEqual(["gm1", "u1"]);
  });

  it("manda il toast solo ai proprietari connessi", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player, offline), spotted: true, users: [gm, player, offline], toastEnabled: true
    });

    expect(result.toast).toEqual(["u1"]);
    expect(result.chat.sort()).toEqual(["gm1", "u1", "u2"]);
  });

  it("non manda toast al DM, che il messaggio lo vede già in chat", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: true, users: [gm, player], toastEnabled: true
    });

    expect(result.toast).not.toContain("gm1");
  });

  it("non manda alcun toast se l'impostazione è spenta", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: true, users: [gm, player], toastEnabled: false
    });

    expect(result.toast).toEqual([]);
    expect(result.chat.sort()).toEqual(["gm1", "u1"]);
  });

  it("con un PG senza proprietario avvisa solo il DM, senza rompersi", () => {
    const result = detectionRecipients({
      actor: actorOwnedBy(), spotted: true, users: [gm, stranger], toastEnabled: true
    });

    expect(result).toEqual({ chat: ["gm1"], toast: [] });
  });

  it("non duplica un DM che è anche proprietario del PG", () => {
    const gmOwner = { id: "gm1", isGM: true, active: true };
    const result = detectionRecipients({
      actor: actorOwnedBy(gmOwner), spotted: true, users: [gmOwner], toastEnabled: true
    });

    expect(result.chat).toEqual(["gm1"]);
  });

  it("avvisa tutti i DM presenti, non solo il primo", () => {
    const gm2 = { id: "gm2", isGM: true, active: true };
    const result = detectionRecipients({
      actor: actorOwnedBy(player), spotted: false, users: [gm, gm2, player], toastEnabled: true
    });

    expect(result.chat.sort()).toEqual(["gm1", "gm2"]);
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npm test`
Expected: FAIL, `Failed to resolve import "../core/recipients.js"`

- [ ] **Step 3: Scrivere l'implementazione minima**

Creare `core/recipients.js`:

```js
/**
 * Who hears about a detection.
 *
 * The asymmetry is deliberate: a success is news the character has, so it reaches the player;
 * a failure is news only the GM is allowed to have, because telling a player "you failed to
 * notice something" already tells them there was something to notice.
 *
 * Chat and toast are not alternatives. A whisper stays in the log and reaches a player who is
 * offline; a toast cannot. The whisper is the delivery, the toast is only the nudge.
 *
 * @param {object} options
 * @param {{testUserPermission: (user: object, level: string) => boolean}} options.actor
 * @param {boolean} options.spotted
 * @param {Array<{id: string, isGM: boolean, active: boolean}>} options.users
 * @param {boolean} options.toastEnabled
 * @returns {{chat: string[], toast: string[]}}
 */
export function detectionRecipients({ actor, spotted, users, toastEnabled }) {
  const gmIds = users.filter(u => u.isGM).map(u => u.id);

  if (!spotted) return { chat: gmIds, toast: [] };

  const owners = users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER"));

  return {
    chat: [...new Set([...gmIds, ...owners.map(u => u.id)])],
    toast: toastEnabled ? owners.filter(u => u.active).map(u => u.id) : []
  };
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `npm test`
Expected: PASS, 18 test in totale

- [ ] **Step 5: Commit**

```bash
git add core/recipients.js tests/recipients.test.js
git commit -m "feat(core): scelta dei destinatari di chat e toast, con test"
```

---

### Task 3: Geometria e visuale

**Files:**
- Create: `core/geometry.js`
- Test: `tests/geometry.test.js`

**Interfaces:**
- Consumes: niente.
- Produces: puri — `closestPointOnSegment(point, a, b) -> {x, y}`, `closestPointInBounds(point, bounds) -> {x, y}`, `pullBack(point, towards, distance) -> {x, y}|null`. Dipendenti da Foundry — `sceneDistance(from, to) -> number`, `isSightBlocked(from, to) -> boolean`.

- [ ] **Step 1: Scrivere i test che falliscono**

Creare `tests/geometry.test.js`. Nota il polyfill in testa: `Math.clamp` è un'estensione di
Foundry, non JavaScript standard, e in vitest non esiste. Definirlo qui fa provare ai test
esattamente lo stesso codice che gira in Foundry, invece di una variante scritta apposta.

```js
import { describe, expect, it } from "vitest";

// Foundry extends the Math global; vitest does not have it.
Math.clamp ??= (value, min, max) => Math.min(Math.max(value, min), max);

import { closestPointInBounds, closestPointOnSegment, pullBack } from "../core/geometry.js";

describe("closestPointOnSegment", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 0 };

  it("proietta un punto perpendicolare sul segmento", () => {
    expect(closestPointOnSegment({ x: 40, y: 30 }, a, b)).toEqual({ x: 40, y: 0 });
  });

  it("si ferma all'estremo A per un punto oltre A", () => {
    expect(closestPointOnSegment({ x: -50, y: 20 }, a, b)).toEqual({ x: 0, y: 0 });
  });

  it("si ferma all'estremo B per un punto oltre B", () => {
    expect(closestPointOnSegment({ x: 250, y: 20 }, a, b)).toEqual({ x: 100, y: 0 });
  });

  it("restituisce A per un segmento degenere, senza dividere per zero", () => {
    expect(closestPointOnSegment({ x: 10, y: 10 }, a, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe("closestPointInBounds", () => {
  const bounds = { left: 100, right: 200, top: 100, bottom: 200 };

  it("restituisce il punto stesso se è dentro", () => {
    expect(closestPointInBounds({ x: 150, y: 150 }, bounds)).toEqual({ x: 150, y: 150 });
  });

  it("blocca su un lato per un punto fuori su un solo asse", () => {
    expect(closestPointInBounds({ x: 50, y: 150 }, bounds)).toEqual({ x: 100, y: 150 });
  });

  it("blocca su uno spigolo per un punto fuori in diagonale", () => {
    expect(closestPointInBounds({ x: 50, y: 500 }, bounds)).toEqual({ x: 100, y: 200 });
  });
});

describe("pullBack", () => {
  it("arretra il punto verso l'osservatore della distanza chiesta", () => {
    expect(pullBack({ x: 100, y: 0 }, { x: 0, y: 0 }, 25)).toEqual({ x: 75, y: 0 });
  });

  it("arretra correttamente anche in diagonale", () => {
    const result = pullBack({ x: 30, y: 40 }, { x: 0, y: 0 }, 10);
    expect(result.x).toBeCloseTo(24);
    expect(result.y).toBeCloseTo(32);
  });

  it("restituisce null se l'osservatore è più vicino della distanza di arretramento", () => {
    expect(pullBack({ x: 10, y: 0 }, { x: 0, y: 0 }, 25)).toBeNull();
  });

  it("restituisce null se i due punti coincidono, senza dividere per zero", () => {
    expect(pullBack({ x: 10, y: 10 }, { x: 10, y: 10 }, 25)).toBeNull();
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npm test`
Expected: FAIL, `Failed to resolve import "../core/geometry.js"`

- [ ] **Step 3: Scrivere l'implementazione**

Creare `core/geometry.js`:

```js
/**
 * Geometry helpers for detection. The exported pure functions work in pixel space and know
 * nothing about Foundry, so they are unit-tested; the two wrappers at the bottom do touch
 * canvas globals and are verified in game instead.
 */

/**
 * Closest point to `point` on the segment a-b, clamped to the segment's ends.
 * @returns {{x: number, y: number}}
 */
export function closestPointOnSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = (dx * dx) + (dy * dy);

  // Degenerate segment: both ends are the same point, so there is nothing to project onto.
  if (lengthSquared === 0) return { x: a.x, y: a.y };

  const t = Math.clamp((((point.x - a.x) * dx) + ((point.y - a.y) * dy)) / lengthSquared, 0, 1);
  return { x: a.x + (t * dx), y: a.y + (t * dy) };
}

/**
 * Closest point to `point` inside an axis-aligned box (the point itself if already inside).
 * @returns {{x: number, y: number}}
 */
export function closestPointInBounds(point, bounds) {
  return {
    x: Math.clamp(point.x, bounds.left, bounds.right),
    y: Math.clamp(point.y, bounds.top, bounds.bottom)
  };
}

/**
 * Moves `point` toward `towards` by `distance` pixels.
 *
 * Exists for one specific problem: a secret door's target point lies ON a wall, so a sight test
 * aimed at it always collides with that very wall and nothing would ever be detected. Aiming
 * slightly short of the wall avoids the self-collision.
 *
 * @returns {{x: number, y: number}|null} null when `towards` is closer than `distance`, in which
 *   case there is no room to pull back and the caller should skip the sight test entirely - at
 *   that range the observer is against the wall anyway.
 */
export function pullBack(point, towards, distance) {
  const dx = towards.x - point.x;
  const dy = towards.y - point.y;
  const length = Math.hypot(dx, dy);

  if (length <= distance) return null;

  return { x: point.x + ((dx / length) * distance), y: point.y + ((dy / length) * distance) };
}

/* -------------------------------------------- */
/*  Foundry-dependent wrappers                  */
/* -------------------------------------------- */

/**
 * Distance between two pixel points, in scene units.
 * @returns {number}
 */
export function sceneDistance(from, to) {
  return canvas.grid.measurePath([from, to]).distance;
}

/**
 * Whether a wall blocks sight between two pixel points.
 * Signature verified against the v14.365 API: mode "any" returns a boolean.
 * @returns {boolean}
 */
export function isSightBlocked(from, to) {
  return foundry.canvas.geometry.ClockwiseSweepPolygon.testCollision(from, to, {
    type: "sight",
    mode: "any"
  });
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `npm test`
Expected: PASS, 29 test in totale

- [ ] **Step 5: Commit**

```bash
git add core/geometry.js tests/geometry.test.js
git commit -m "feat(core): geometria del rilevamento e test di visuale"
```

---

### Task 4: Notifiche e socket

**Files:**
- Create: `core/notify.js`
- Modify: `scripts/constants.js`
- Modify: `scripts/main.js`
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: `detectionRecipients` dalla task 2.
- Produces: `registerSocket(moduleId)`, `reportDetection({moduleId, observer, detectable, spotted, toastEnabled}) -> Promise<void>`, e da `scripts/constants.js` gli oggetti `SETTINGS` e `FLAGS`.

- [ ] **Step 1: Estendere le costanti**

Sostituire l'intero contenuto di `scripts/constants.js`:

```js
export const MODULE_ID = "trapfinder";

/** World setting keys. */
export const SETTINGS = {
  secretDoorDefaultDC: "secretDoorDefaultDC",
  secretDoorDefaultRange: "secretDoorDefaultRange",
  creatureDetectionRange: "creatureDetectionRange",
  screenAlert: "screenAlert",
  migrationVersion: "migrationVersion"
};

/** Document flag keys, all under this module's scope. */
export const FLAGS = {
  // On a Region behavior and on a secret-door wall: actor ids that have already resolved it.
  notifiedActorIds: "notifiedActorIds",
  // On a hidden creature's token: actor ids of the PCs that have spotted it.
  detectedBy: "detectedBy",
  // On a secret-door wall: per-door overrides of the world defaults.
  dc: "dc",
  range: "range",
  message: "message"
};
```

- [ ] **Step 2: Registrare l'impostazione dell'avviso a schermo**

In `scripts/main.js`, sostituire l'intero contenuto:

```js
import { MODULE_ID, SETTINGS } from "./constants.js";
import { registerSocket } from "../core/notify.js";
import { TOOLS } from "../tools/index.js";

Hooks.once("init", () => {
  // Shared by every tool that notifies, so it is registered here rather than inside one of them.
  // No requiresReload: it is read at notification time, so a change takes effect immediately.
  game.settings.register(MODULE_ID, SETTINGS.screenAlert, {
    name: "DND5E_GM_TOOLKIT.settings.screenAlert.name",
    hint: "DND5E_GM_TOOLKIT.settings.screenAlert.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  for (const tool of TOOLS) {
    tool.register(MODULE_ID);
  }
});

Hooks.once("ready", () => {
  // Unconditional, not gated behind any tool's toggle: a client with no listener would silently
  // drop toasts emitted by a GM whose tools are on, and the listener costs nothing when idle.
  registerSocket(MODULE_ID);

  for (const tool of TOOLS) {
    tool.onReady?.(MODULE_ID);
  }
});
```

- [ ] **Step 3: Scrivere il modulo di notifica**

Creare `core/notify.js`:

```js
import { detectionRecipients } from "./recipients.js";

/**
 * Delivery of a detection result: a whisper that persists in the log, plus an optional toast
 * that only draws the eye. See core/recipients.js for who gets which.
 */

const TOAST_ACTION = "toast";

/**
 * Listens for toasts addressed to this client. Every client runs this; the GM's own detections
 * are delivered to players through it.
 * @param {string} moduleId
 */
export function registerSocket(moduleId) {
  game.socket.on(`module.${moduleId}`, ({ action, userIds, text } = {}) => {
    if (action !== TOAST_ACTION) return;
    if (!userIds?.includes(game.user.id)) return;
    ui.notifications.info(text);
  });
}

/**
 * @param {object} options
 * @param {string} options.moduleId
 * @param {object} options.observer      Actor of the observing PC.
 * @param {object} options.detectable    See core/detection.js.
 * @param {boolean} options.spotted
 * @param {boolean} options.toastEnabled
 * @returns {Promise<void>}
 */
export async function reportDetection({ moduleId, observer, detectable, spotted, toastEnabled }) {
  const { chat, toast } = detectionRecipients({
    actor: observer,
    spotted,
    users: game.users.contents,
    toastEnabled
  });

  const text = detectionText({ observer, detectable, spotted });

  await ChatMessage.create({ content: text, whisper: chat });

  if (toast.length) {
    game.socket.emit(`module.${moduleId}`, { action: TOAST_ACTION, userIds: toast, text });
  }
}

/**
 * The custom message describes what the character notices, so it is only ever used on a success.
 * A failure always gets the generic line: the custom text would give away what was there.
 * @returns {string}
 */
function detectionText({ observer, detectable, spotted }) {
  const data = { name: observer.name, dc: detectable.dc };

  if (!spotted) return game.i18n.format(detectable.missedKey, data);

  const custom = detectable.message?.trim();
  return custom || game.i18n.format(detectable.spottedKey, data);
}
```

- [ ] **Step 4: Aggiungere le stringhe**

In `lang/en.json`, dentro `DND5E_GM_TOOLKIT`, aggiungere una chiave `settings` a pari livello di `tools`:

```json
    "settings": {
      "screenAlert": {
        "name": "On-screen alert as well as chat",
        "hint": "When a PC notices something, also pop a brief notification on the owning player's screen. The whisper in chat is sent either way - this only adds a nudge, since a chat line is easy to miss mid-scene."
      }
    }
```

In `lang/it.json`, nella stessa posizione:

```json
    "settings": {
      "screenAlert": {
        "name": "Avviso a schermo oltre alla chat",
        "hint": "Quando un PG nota qualcosa, mostra anche una breve notifica sullo schermo del giocatore che lo controlla. Il messaggio privato in chat parte comunque: questo aggiunge solo un richiamo, perché una riga di chat in mezzo alla scena sfugge facilmente."
      }
    }
```

- [ ] **Step 5: Verificare che i test esistenti passino ancora**

Run: `npm test`
Expected: PASS, 29 test. Nessun test nuovo: `core/notify.js` tocca `game`, `ChatMessage` e `ui`, quindi si verifica in gioco.

- [ ] **Step 6: Verifica manuale in Foundry**

Avviare il mondo. In Configure Settings deve comparire "Avviso a schermo oltre alla chat", attivo. Nessun errore in console all'avvio. Il modulo continua a funzionare come prima: il rilevamento trappole non è ancora stato toccato.

- [ ] **Step 7: Commit**

```bash
git add core/notify.js scripts/constants.js scripts/main.js lang/en.json lang/it.json
git commit -m "feat(core): notifica mirata via whisper e toast su socket"
```

---

### Task 5: Nuovi campi sul behavior esistente

Il tipo resta `trapfinder.trapDetection`: qui si aggiungono solo campi, così il modulo continua a funzionare e le Region esistenti restano valide. La rinomina arriva nella task 7.

**Files:**
- Modify: `tools/trap-detection/trap-detection-region-behavior.js`
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: niente.
- Produces: `behavior.system.skill` (`"prc"|"inv"`), `behavior.system.message` (string), `behavior.system.requiresSight` (boolean), consumati dalla task 6.

- [ ] **Step 1: Aggiungere i tre campi allo schema**

In `tools/trap-detection/trap-detection-region-behavior.js`, sostituire il corpo di `defineSchema()`:

```js
  static defineSchema() {
    const { BooleanField, NumberField, StringField } = foundry.data.fields;
    return {
      // Declared even though _handleRegionEvent is never implemented/used - the one real
      // reference implementation found for a custom dnd5e RegionBehaviorType always includes
      // this field, and omitting it is an unverified deviation from the only known-working example.
      events: this._createEventsField({ events: [] }),
      // Which passive the observer is checked on. A field rather than a separate behavior type:
      // a trap and a hidden clue are the same mechanism, only the skill read differs.
      // choices is a function, not a literal object, so the labels are resolved after i18nInit -
      // Function is a documented choices type as of the v14.365 API.
      skill: new StringField({
        required: true,
        blank: false,
        initial: "prc",
        choices: () => ({
          prc: game.i18n.localize("DND5E_GM_TOOLKIT.passiveDetection.skills.prc"),
          inv: game.i18n.localize("DND5E_GM_TOOLKIT.passiveDetection.skills.inv")
        })
      }),
      dc: new NumberField({ required: true, integer: true, min: 0, initial: 15 }),
      range: new NumberField({ required: true, min: 0, initial: 10 }),
      // Shown to the player instead of the generic line, on a success only.
      message: new StringField({ required: false, blank: true, initial: "" }),
      requiresSight: new BooleanField({ initial: true })
    };
  }
```

- [ ] **Step 2: Aggiungere le stringhe dei nuovi campi**

In `lang/en.json`, dentro `DND5E_GM_TOOLKIT`, aggiungere un blocco `passiveDetection` a pari livello di `trapDetection` (che per ora resta dov'è):

```json
    "passiveDetection": {
      "skills": {
        "prc": "Passive Perception",
        "inv": "Passive Investigation"
      }
    }
```

E dentro `DND5E_GM_TOOLKIT.trapDetection.behavior.FIELDS`, accanto a `dc` e `range`:

```json
          "skill": {
            "label": "Passive Skill",
            "hint": "Which passive the PC is checked on. Perception for something noticed in passing, Investigation for something that has to be pieced together."
          },
          "message": {
            "label": "Message on Success",
            "hint": "What the player is told when their PC notices this, e.g. 'One flagstone sits a finger lower than the others'. Leave empty for the generic line. Never shown on a failure."
          },
          "requiresSight": {
            "label": "Requires Line of Sight",
            "hint": "If set, a wall between the PC and this spot prevents detection. Turn off for something noticed by sound or smell around a corner."
          }
```

In `lang/it.json`, `passiveDetection` a pari livello di `trapDetection`:

```json
    "passiveDetection": {
      "skills": {
        "prc": "Percezione passiva",
        "inv": "Indagare passivo"
      }
    }
```

E dentro `DND5E_GM_TOOLKIT.trapDetection.behavior.FIELDS`:

```json
          "skill": {
            "label": "Abilità passiva",
            "hint": "Su quale passiva viene controllato il PG. Percezione per ciò che si nota di sfuggita, Indagare per ciò che va messo insieme."
          },
          "message": {
            "label": "Messaggio alla riuscita",
            "hint": "Cosa viene detto al giocatore quando il PG se ne accorge, ad esempio 'Una lastra del pavimento è più bassa delle altre di un dito'. Lascia vuoto per il testo generico. Non viene mai mostrato in caso di fallimento."
          },
          "requiresSight": {
            "label": "Richiede linea di vista",
            "hint": "Se attivo, un muro tra il PG e questo punto impedisce il rilevamento. Disattivalo per qualcosa che si nota dall'odore o dal rumore dietro l'angolo."
          }
```

- [ ] **Step 3: Verifica manuale in Foundry**

Ricaricare. Aprire una Region con il comportamento Rilevamento Trappole: devono comparire i tre campi nuovi, con il menù Abilità passiva popolato con due voci **tradotte** (se compaiono le chiavi grezze `DND5E_GM_TOOLKIT…`, `choices` come funzione non sta venendo rivalutata dopo `i18nInit`: in quel caso costruire le choices dentro l'hook `i18nInit` già presente in `tools/trap-detection/index.js`, assegnandole allo schema del campo). Una Region esistente deve aprirsi senza errori, con `skill` a Percezione.

- [ ] **Step 4: Commit**

```bash
git add tools/trap-detection/trap-detection-region-behavior.js lang/en.json lang/it.json
git commit -m "feat(trap-detection): campi skill, messaggio e linea di vista sul behavior"
```

---

### Task 6: Ricablare il rilevamento trappole sul nucleo

Rifattorizzazione a comportamento osservabile invariato, salvo i tre campi nuovi che ora hanno effetto. Il tipo e i nomi dei file non cambiano ancora.

**Files:**
- Create: `tools/trap-detection/sources.js`
- Modify: `tools/trap-detection/index.js`
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: `runDetection` (task 1), `reportDetection` (task 4), `closestPointInBounds`/`sceneDistance`/`isSightBlocked` (task 3), `SETTINGS`/`FLAGS` (task 4), i campi dello schema (task 5).
- Produces: `collectRegionDetectables({scene, observerCenter, actor, moduleId, typeId}) -> Detectable[]`, riusata dalla task 7 dopo la rinomina.

- [ ] **Step 1: Scrivere la sorgente delle Region**

Creare `tools/trap-detection/sources.js`:

```js
import { closestPointInBounds } from "../../core/geometry.js";
import { FLAGS } from "../../scripts/constants.js";

/**
 * Turns every enabled detection behavior on the scene into a detectable for one observer.
 *
 * @param {object} options
 * @param {object} options.scene
 * @param {{x: number, y: number}} options.observerCenter
 * @param {object} options.actor      Actor of the observing PC.
 * @param {string} options.moduleId
 * @param {string} options.typeId     RegionBehavior type to collect.
 * @returns {object[]} detectables, see core/detection.js
 */
export function collectRegionDetectables({ scene, observerCenter, actor, moduleId, typeId }) {
  const detectables = [];

  for (const region of scene.regions) {
    for (const behavior of region.behaviors) {
      if (behavior.type !== typeId) continue;
      if (behavior.disabled) continue;

      // Bounding-box approximation, not exact-shape distance: no built-in or third-party
      // reference for exact point-to-arbitrary-region-shape distance was found, and the extra
      // margin near the corners of an ellipse or polygon is a few feet at most - fine for a
      // detection buffer.
      const point = closestPointInBounds(observerCenter, region.bounds);
      const seen = behavior.getFlag(moduleId, FLAGS.notifiedActorIds) ?? [];

      detectables.push({
        key: behavior.uuid,
        skill: behavior.system.skill,
        dc: behavior.system.dc,
        point,
        sightPoint: point,
        range: behavior.system.range,
        message: behavior.system.message || null,
        spottedKey: "DND5E_GM_TOOLKIT.passiveDetection.spotted",
        missedKey: "DND5E_GM_TOOLKIT.passiveDetection.notSpotted",
        requiresSight: behavior.system.requiresSight,
        hasSeen: () => seen.includes(actor.id),
        markSeen: () => behavior.setFlag(moduleId, FLAGS.notifiedActorIds, [...seen, actor.id])
      });
    }
  }

  return detectables;
}
```

- [ ] **Step 2: Sostituire l'hook con la chiamata al nucleo**

In `tools/trap-detection/index.js`, sostituire il metodo `onReady` e **rimuovere** le due funzioni in fondo al file (`distanceToRegionBounds` e `postTrapDetectionMessage`), ora coperte da `core/geometry.js` e `core/notify.js`. Aggiungere in testa al file:

```js
import { runDetection } from "../../core/detection.js";
import { isSightBlocked, sceneDistance } from "../../core/geometry.js";
import { reportDetection } from "../../core/notify.js";
import { SETTINGS } from "../../scripts/constants.js";
import { collectRegionDetectables } from "./sources.js";
```

E sostituire `onReady`:

```js
  onReady(moduleId) {
    if (!game.settings.get(moduleId, this.id)) return;

    Hooks.on("moveToken", async (tokenDocument) => {
      if (!game.user.isGM) return;

      const actor = tokenDocument.actor;
      if (actor?.type !== "character") return;

      const scene = tokenDocument.parent;
      if (!scene) return;

      const gridSize = scene.grid.size;
      const observerCenter = {
        x: tokenDocument.x + ((tokenDocument.width * gridSize) / 2),
        y: tokenDocument.y + ((tokenDocument.height * gridSize) / 2)
      };

      const detectables = collectRegionDetectables({
        scene, observerCenter, actor, moduleId, typeId: TYPE_ID
      });
      if (!detectables.length) return;

      await runDetection({
        observer: actor,
        detectables,
        measure: (point) => sceneDistance(observerCenter, point),
        isSightBlocked: (point) => isSightBlocked(observerCenter, point),
        report: ({ observer, detectable, spotted }) => reportDetection({
          moduleId, observer, detectable, spotted,
          toastEnabled: game.settings.get(moduleId, SETTINGS.screenAlert)
        })
      });
    });
  }
```

- [ ] **Step 3: Spostare le stringhe dei messaggi**

Le chiavi `spotted` e `notSpotted` erano sotto `tools.trapDetection`; ora la sorgente punta a `passiveDetection`. In `lang/en.json` **spostare** le due chiavi da `DND5E_GM_TOOLKIT.tools.trapDetection` a `DND5E_GM_TOOLKIT.passiveDetection`, che diventa:

```json
    "passiveDetection": {
      "spotted": "{name} notices something suspicious nearby (passive check meets/beats DC {dc}).",
      "notSpotted": "{name} passes close to something hidden without noticing it (DC {dc}).",
      "skills": {
        "prc": "Passive Perception",
        "inv": "Passive Investigation"
      }
    }
```

In `lang/it.json`, allo stesso modo:

```json
    "passiveDetection": {
      "spotted": "{name} nota qualcosa di sospetto nei paraggi (prova passiva pari o superiore a CD {dc}).",
      "notSpotted": "{name} passa vicino a qualcosa di nascosto senza accorgersene (CD {dc}).",
      "skills": {
        "prc": "Percezione passiva",
        "inv": "Indagare passivo"
      }
    }
```

Il testo non nomina più le trappole: la stessa riga serve ora anche gli indizi.

- [ ] **Step 4: Verificare che i test passino ancora**

Run: `npm test`
Expected: PASS, 29 test

- [ ] **Step 5: Verifica manuale in Foundry**

Con una Region trappola già esistente (CD 15, raggio 10), muovere un token PG entro il raggio: deve arrivare un messaggio privato **al DM come prima**, e in più al giocatore proprietario, con il toast. Muoverlo di nuovo: nessuna ripetizione. Impostare un messaggio personalizzato e provarlo con un secondo PG. Impostare la skill su Indagare e verificare che confronti la passiva giusta. Mettere un muro tra PG e Region e verificare che non scatti.

- [ ] **Step 6: Commit**

```bash
git add tools/trap-detection/sources.js tools/trap-detection/index.js lang/en.json lang/it.json
git commit -m "refactor(trap-detection): usa il nucleo condiviso per decisione e notifica"
```

---

### Task 7: Rinomina del tipo, della cartella e migrazione

**Files:**
- Rename: `tools/trap-detection/` → `tools/passive-detection/`
- Rename: `tools/passive-detection/trap-detection-region-behavior.js` → `passive-detection-behavior.js`
- Create: `tools/passive-detection/migration.js`
- Modify: `tools/passive-detection/index.js`, `tools/index.js`, `module.json`
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: tutto quanto sopra.
- Produces: `migrateTrapDetectionBehaviors(moduleId) -> Promise<void>`; il tipo `trapfinder.passiveDetection`.

- [ ] **Step 1: Rinominare cartella e file mantenendo la storia in git**

```bash
git mv tools/trap-detection tools/passive-detection
git mv tools/passive-detection/trap-detection-region-behavior.js tools/passive-detection/passive-detection-behavior.js
```

Rinominare anche la classe dentro il file, da `TrapDetectionRegionBehaviorType` a `PassiveDetectionBehaviorType`, e aggiornare `static LOCALIZATION_PREFIXES` a `["DND5E_GM_TOOLKIT.passiveDetection.behavior"]`.

- [ ] **Step 2: Dichiarare entrambi i tipi in `module.json`**

```json
  "documentTypes": {
    "RegionBehavior": {
      "trapDetection": {},
      "passiveDetection": {}
    }
  },
```

Il tipo vecchio **deve restare dichiarato** per questa release: se sparisse, i behavior già salvati diventerebbero di tipo sconosciuto prima che la migrazione riesca a leggerli. Si rimuove in una release successiva, quando la migrazione è certamente girata ovunque.

- [ ] **Step 3: Scrivere la migrazione**

Creare `tools/passive-detection/migration.js`:

```js
import { FLAGS, SETTINGS } from "../../scripts/constants.js";

const OLD_TYPE = "trapfinder.trapDetection";
const NEW_TYPE = "trapfinder.passiveDetection";
const CURRENT_VERSION = 1;

/**
 * Converts behaviors of the pre-generalisation type to the new one.
 *
 * A document's type cannot be changed by an update, so each behavior is recreated and the old one
 * deleted. The version marker is written only after the whole pass succeeds: a partial run leaves
 * the marker untouched and simply retries next load, which is safer than recording a half-done
 * migration.
 *
 * @param {string} moduleId
 * @returns {Promise<void>}
 */
export async function migrateTrapDetectionBehaviors(moduleId) {
  if (game.settings.get(moduleId, SETTINGS.migrationVersion) >= CURRENT_VERSION) return;
  if (game.user !== game.users.activeGM) return;

  let migrated = 0;

  for (const scene of game.scenes) {
    for (const region of scene.regions) {
      const outdated = region.behaviors.filter(b => b.type === OLD_TYPE);
      if (!outdated.length) continue;

      const replacements = outdated.map(behavior => ({
        name: behavior.name,
        type: NEW_TYPE,
        disabled: behavior.disabled,
        system: {
          skill: "prc",
          dc: behavior._source.system.dc,
          range: behavior._source.system.range,
          message: "",
          requiresSight: true
        },
        flags: {
          [moduleId]: {
            [FLAGS.notifiedActorIds]: behavior.getFlag(moduleId, FLAGS.notifiedActorIds) ?? []
          }
        }
      }));

      await region.createEmbeddedDocuments("RegionBehavior", replacements);
      await region.deleteEmbeddedDocuments("RegionBehavior", outdated.map(b => b.id));
      migrated += outdated.length;
    }
  }

  await game.settings.set(moduleId, SETTINGS.migrationVersion, CURRENT_VERSION);

  if (migrated) {
    ui.notifications.info(
      game.i18n.format("DND5E_GM_TOOLKIT.passiveDetection.migrated", { count: migrated })
    );
  }
}
```

`skill: "prc"` e `requiresSight: true` sono i valori che riproducono il comportamento precedente: prima esisteva solo la percezione, e non c'era test di visuale ma il raggio era piccolo, quindi attivarlo è il default sensato e resta disattivabile per Region.

- [ ] **Step 4: Riscrivere `tools/passive-detection/index.js`**

Le modifiche a questo file sono troppe per applicarle a frammenti. Sostituire l'intero contenuto,
tenendo **invariati** i due commenti lunghi esistenti: spiegano perché la registrazione del tipo
non è dietro l'interruttore e perché sta in `register()` e non in `onReady()`, ed entrambe le
ragioni valgono ancora.

```js
import { runDetection } from "../../core/detection.js";
import { isSightBlocked, sceneDistance } from "../../core/geometry.js";
import { reportDetection } from "../../core/notify.js";
import { SETTINGS } from "../../scripts/constants.js";
import PassiveDetectionBehaviorType from "./passive-detection-behavior.js";
import { migrateTrapDetectionBehaviors } from "./migration.js";
import { collectRegionDetectables } from "./sources.js";

const TYPE_ID = "trapfinder.passiveDetection";

export default {
  id: "passive-detection",
  titleKey: "DND5E_GM_TOOLKIT.tools.passiveDetection.title",
  hintKey: "DND5E_GM_TOOLKIT.tools.passiveDetection.hint",
  default: false,

  register(moduleId) {
    game.settings.register(moduleId, this.id, {
      name: this.titleKey,
      hint: this.hintKey,
      scope: "world",
      config: true,
      type: Boolean,
      default: this.default,
      // CONFIG.RegionBehavior below is only (re)populated once per page load, at "init" - toggling
      // this mid-session without a reload would leave the behavior type missing from the Region
      // config sheet until the next refresh, so Foundry needs to prompt for one.
      requiresReload: true
    });

    // Bookkeeping, not a knob: never shown in Configure Settings.
    game.settings.register(moduleId, SETTINGS.migrationVersion, {
      scope: "world",
      config: false,
      type: Number,
      default: 0
    });

    // Unconditional (not gated behind the setting toggle): module.json declares this type under
    // documentTypes.RegionBehavior so Foundry's own type list (which is what actually drives the
    // "Add Behavior" dropdown - CONFIG.RegionBehavior.dataModels alone does not, verified by
    // comparing it against the dropdown's real rendered <select> options) always includes it,
    // regardless of the setting. Since the type is always selectable either way, registering the
    // class conditionally would let a GM add the behavior while the tool is off and hit a broken
    // data model with no class behind it - so this stays unconditional, and only the actual
    // detection hook in onReady() below is gated by the setting.
    //
    // CONFIG.RegionBehavior must be populated before the "i18nInit" hook runs (Foundry uses it to
    // pre-localize/prepare behavior type sheets), so this happens here in register() (init), not
    // in onReady() - same timing constraint already hit for the leader status in dnd5e-house-rules.
    CONFIG.RegionBehavior.dataModels[TYPE_ID] = PassiveDetectionBehaviorType;
    CONFIG.RegionBehavior.typeIcons[TYPE_ID] = "fa-solid fa-triangle-exclamation";
    // Without an explicit typeLabels entry, the "Add Behavior" type dropdown has nothing to
    // display for this entry and silently omits it (no error) - verified against several real,
    // working modules (pf2e-visioner, warhammer-dbc, Deathmarch-Witcher-TRPG) that all set this
    // explicitly alongside dataModels/typeIcons, unlike the one reference this was first modeled on.
    CONFIG.RegionBehavior.typeLabels[TYPE_ID] = "DND5E_GM_TOOLKIT.passiveDetection.behavior.label";
    Hooks.once("i18nInit", () => foundry.helpers.Localization.localizeDataModel(PassiveDetectionBehaviorType));
  },

  async onReady(moduleId) {
    // Before the toggle check on purpose: Regions saved under the old type must be converted even
    // in a world where the tool is currently off, or they would be left behind for good once the
    // old type declaration is dropped from module.json.
    await migrateTrapDetectionBehaviors(moduleId);

    if (!game.settings.get(moduleId, this.id)) return;

    Hooks.on("moveToken", async (tokenDocument) => {
      if (!game.user.isGM) return;

      const actor = tokenDocument.actor;
      if (actor?.type !== "character") return;

      const scene = tokenDocument.parent;
      if (!scene) return;

      const gridSize = scene.grid.size;
      const observerCenter = {
        x: tokenDocument.x + ((tokenDocument.width * gridSize) / 2),
        y: tokenDocument.y + ((tokenDocument.height * gridSize) / 2)
      };

      const detectables = collectRegionDetectables({
        scene, observerCenter, actor, moduleId, typeId: TYPE_ID
      });
      if (!detectables.length) return;

      await runDetection({
        observer: actor,
        detectables,
        measure: (point) => sceneDistance(observerCenter, point),
        isSightBlocked: (point) => isSightBlocked(observerCenter, point),
        report: ({ observer, detectable, spotted }) => reportDetection({
          moduleId, observer, detectable, spotted,
          toastEnabled: game.settings.get(moduleId, SETTINGS.screenAlert)
        })
      });
    });
  }
};
```

Attenzione: cambiare `id` da `trap-detection` a `passive-detection` **azzera l'interruttore**,
perché è la chiave dell'impostazione. Va scritto nelle note di release: lo strumento va riacceso
una volta sola dopo l'aggiornamento.

- [ ] **Step 5: Aggiornare il registro degli strumenti**

In `tools/index.js`:

```js
import passiveDetection from "./passive-detection/index.js";
import lockpicking from "./lockpicking/index.js";

/**
 * Explicit registry of every tool shipped by this module.
 * Foundry loads ES modules directly in the browser (no bundler), so folders under
 * tools/ cannot be auto-discovered at runtime: add a new tool by creating its folder
 * and importing it here.
 */
export const TOOLS = [
  passiveDetection,
  lockpicking
];
```

- [ ] **Step 6: Rinominare le chiavi i18n**

Due spostamenti nell'albero, identici in `lang/en.json` e `lang/it.json`:

| Da | A |
|---|---|
| `DND5E_GM_TOOLKIT.tools.trapDetection` | `DND5E_GM_TOOLKIT.tools.passiveDetection` |
| `DND5E_GM_TOOLKIT.trapDetection.behavior` | `DND5E_GM_TOOLKIT.passiveDetection.behavior` |

Dopo lo spostamento la chiave `DND5E_GM_TOOLKIT.trapDetection` **non esiste più**: cercarla nei due
file e verificare che non ne resti traccia. Le chiavi `spotted`/`notSpotted` si erano già spostate
sotto `passiveDetection` nella task 6, quindi `passiveDetection` ora contiene `spotted`,
`notSpotted`, `skills`, `behavior` e `migrated`.

Aggiornare i due titoli e i due suggerimenti, che parlano ancora solo di trappole:

`lang/en.json`:
```json
      "passiveDetection": {
        "title": "Passive Detection (traps, clues, secret doors)",
        "hint": "Draw a Region where something hidden really is, add the 'Passive Detection' behavior to set its skill, DC, range and the message the player gets. Whenever a PC comes within range, their passive score against the DC decides whether they notice it. Once per PC per spot. Secret doors are configured on the wall itself instead."
      }
```

E la chiave del messaggio di migrazione, dentro `passiveDetection`:
```json
      "migrated": "Passive Detection: {count} trap behavior(s) converted to the new format."
```

`lang/it.json`:
```json
      "passiveDetection": {
        "title": "Rilevamento passivo (trappole, indizi, porte segrete)",
        "hint": "Disegna una Region dove si trova davvero qualcosa di nascosto, aggiungi il comportamento 'Rilevamento Passivo' per impostare abilità, CD, raggio e il messaggio che riceve il giocatore. Quando un PG entra nel raggio, la sua passiva contro la CD decide se se ne accorge. Una volta per PG per punto. Le porte segrete si configurano invece sul muro stesso."
      }
```

```json
      "migrated": "Rilevamento passivo: {count} comportamenti trappola convertiti al nuovo formato."
```

E `passiveDetection.behavior.label` diventa `"Passive Detection"` / `"Rilevamento Passivo"`.

- [ ] **Step 7: Verificare che i test passino ancora**

Run: `npm test`
Expected: PASS, 29 test

- [ ] **Step 8: Verifica manuale della migrazione**

Su un mondo che ha **già** una Region trappola creata prima di questa modifica: ricaricare, e comparire la notifica "convertiti al nuovo formato". Aprire la Region: il comportamento ora si chiama Rilevamento Passivo, con CD e raggio identici a prima e skill Percezione. Riaccendere l'interruttore (è cambiata chiave) e verificare che il rilevamento funzioni ancora. Ricaricare una seconda volta: **nessuna** seconda notifica, la migrazione non deve rigirare.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(passive-detection): rinomina il tipo del behavior e migra le Region esistenti"
```

---

### Task 8: Campi delle porte segrete nella scheda muro

Questa è la parte a rischio dichiarata nella spec. Se `renderWallConfig` non regge in v14, il ripiego è nello Step 5.

**Files:**
- Create: `tools/passive-detection/wall-config.js`
- Modify: `tools/passive-detection/index.js`
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: `FLAGS`, `SETTINGS`.
- Produces: `registerWallConfigInjection(moduleId)`; i flag `dc`, `range`, `message` sui muri.

- [ ] **Step 1: Registrare le due impostazioni di default**

In `tools/passive-detection/index.js`, dentro `register(moduleId)`:

```js
    game.settings.register(moduleId, SETTINGS.secretDoorDefaultDC, {
      name: "DND5E_GM_TOOLKIT.settings.secretDoorDefaultDC.name",
      hint: "DND5E_GM_TOOLKIT.settings.secretDoorDefaultDC.hint",
      scope: "world",
      config: true,
      type: Number,
      default: 15
    });

    game.settings.register(moduleId, SETTINGS.secretDoorDefaultRange, {
      name: "DND5E_GM_TOOLKIT.settings.secretDoorDefaultRange.name",
      hint: "DND5E_GM_TOOLKIT.settings.secretDoorDefaultRange.hint",
      scope: "world",
      config: true,
      type: Number,
      default: 10
    });
```

- [ ] **Step 2: Scrivere l'iniezione**

Creare `tools/passive-detection/wall-config.js`:

```js
import { FLAGS, SETTINGS } from "../../scripts/constants.js";

/**
 * Adds per-door detection fields to the native Wall configuration sheet.
 *
 * Pattern verified against the real, v13-verified module "Wall Height" (theripper93/wall-height
 * v4.1.2, scripts/wall-height.js:108-135): in v13+ the hook's second argument is a native DOM
 * element, and an input named "flags.<moduleId>.<key>" is persisted by the sheet's own submit -
 * no listener and no setFlag call of our own.
 *
 * @param {string} moduleId
 */
export function registerWallConfigInjection(moduleId) {
  Hooks.on("renderWallConfig", (app, html) => {
    // ApplicationV2 can re-render partially without clearing what we injected, which would
    // duplicate the fieldset on every re-render. wall-height guards its light hook this way but
    // not its wall hook; the guard is cheap and the failure is visible, so we always guard.
    if (html.querySelector(`[name="flags.${moduleId}.${FLAGS.dc}"]`)) return;

    const doorField = html.querySelector('[name="door"]');
    if (!doorField) return;

    const document = app.document;
    const dc = document.getFlag(moduleId, FLAGS.dc) ?? "";
    const range = document.getFlag(moduleId, FLAGS.range) ?? "";
    const message = document.getFlag(moduleId, FLAGS.message) ?? "";

    const defaultDC = game.settings.get(moduleId, SETTINGS.secretDoorDefaultDC);
    const defaultRange = game.settings.get(moduleId, SETTINGS.secretDoorDefaultRange);

    const t = (key) => game.i18n.localize(`DND5E_GM_TOOLKIT.secretDoor.wallConfig.${key}`);

    doorField.closest("fieldset").insertAdjacentHTML("afterend", `
      <fieldset>
        <legend>${t("legend")}</legend>
        <p class="hint">${t("hint")}</p>
        <div class="form-group">
          <label>${t("dc")}</label>
          <input name="flags.${moduleId}.${FLAGS.dc}" type="number" step="1" min="0"
                 value="${dc}" placeholder="${defaultDC}">
        </div>
        <div class="form-group">
          <label>${t("range")}</label>
          <input name="flags.${moduleId}.${FLAGS.range}" type="number" step="any" min="0"
                 value="${range}" placeholder="${defaultRange}">
        </div>
        <div class="form-group">
          <label>${t("message")}</label>
          <input name="flags.${moduleId}.${FLAGS.message}" type="text"
                 value="${foundry.utils.escapeHTML(message)}">
        </div>
      </fieldset>
    `);

    app.setPosition({ height: "auto" });
  });
}
```

- [ ] **Step 3: Agganciare l'iniezione**

In `tools/passive-detection/index.js`, dentro `onReady(moduleId)` dopo il controllo dell'interruttore:

```js
    registerWallConfigInjection(moduleId);
```

con l'import `import { registerWallConfigInjection } from "./wall-config.js";`

- [ ] **Step 4: Aggiungere le stringhe**

In `lang/en.json`, dentro `DND5E_GM_TOOLKIT`:

```json
    "secretDoor": {
      "wallConfig": {
        "legend": "Passive Detection",
        "hint": "Only applies to walls whose door type is Secret. Leave a field empty to use the world default shown as its placeholder.",
        "dc": "Detection DC",
        "range": "Detection Range",
        "message": "Message on Success"
      }
    }
```

In `lang/it.json`:

```json
    "secretDoor": {
      "wallConfig": {
        "legend": "Rilevamento passivo",
        "hint": "Vale solo per i muri con tipo porta Segreta. Lascia un campo vuoto per usare il default del mondo, mostrato come suggerimento.",
        "dc": "CD di rilevamento",
        "range": "Raggio di rilevamento",
        "message": "Messaggio alla riuscita"
      }
    }
```

E dentro `DND5E_GM_TOOLKIT.settings`:

```json
      "secretDoorDefaultDC": {
        "name": "Secret doors: default DC",
        "hint": "Used by every secret door that has no DC of its own, so a freshly drawn one already works."
      },
      "secretDoorDefaultRange": {
        "name": "Secret doors: default range",
        "hint": "Distance in scene units within which a PC's passive Perception is checked against a secret door."
      }
```

```json
      "secretDoorDefaultDC": {
        "name": "Porte segrete: CD di default",
        "hint": "Usata da ogni porta segreta che non ha una CD propria, così una porta appena disegnata funziona già."
      },
      "secretDoorDefaultRange": {
        "name": "Porte segrete: raggio di default",
        "hint": "Distanza in unità di scena entro cui la percezione passiva di un PG viene confrontata con una porta segreta."
      }
```

- [ ] **Step 5: Verifica manuale, ed è il momento del ripiego se serve**

Ricaricare. Aprire la configurazione di un muro qualsiasi: sotto il tipo di porta deve comparire il riquadro "Rilevamento passivo" con tre campi e i suggerimenti dai default. Inserire CD 12, salvare, riaprire: il valore deve essere ancora lì. Riaprire e richiudere più volte: il riquadro **non deve duplicarsi**.

Se il riquadro non compare o `html.querySelector` va in errore, l'hook non regge in v14: ripiegare sul pattern già presente in `lockpicking`, cioè un pulsante nei controlli di scena che con un muro selezionato apre un `DialogV2` con gli stessi tre campi e li salva con `setFlag`. La forma dei dati non cambia, quindi la task 9 resta valida così com'è.

- [ ] **Step 6: Commit**

```bash
git add tools/passive-detection/wall-config.js tools/passive-detection/index.js lang/en.json lang/it.json
git commit -m "feat(passive-detection): campi di rilevamento nella configurazione del muro"
```

---

### Task 9: Rilevamento delle porte segrete

**Files:**
- Modify: `tools/passive-detection/sources.js`
- Modify: `tools/passive-detection/index.js`
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: `closestPointOnSegment`, `pullBack` (task 3), i flag della task 8.
- Produces: `collectSecretDoorDetectables({scene, observerCenter, actor, moduleId}) -> Detectable[]`.

- [ ] **Step 1: Aggiungere la sorgente dei muri**

In `tools/passive-detection/sources.js`, la task 6 ha già scritto in testa:

```js
import { closestPointInBounds } from "../../core/geometry.js";
import { FLAGS } from "../../scripts/constants.js";
```

**Estendere queste due righe esistenti**, non aggiungerne di nuove: importare due volte lo stesso
identificatore (`FLAGS`, `closestPointInBounds`) da moduli ES è un `SyntaxError`. Il risultato deve
essere:

```js
import { closestPointInBounds, closestPointOnSegment, pullBack } from "../../core/geometry.js";
import { FLAGS, SETTINGS } from "../../scripts/constants.js";
```

```js
/**
 * Turns every secret door on the scene into a detectable for one observer.
 *
 * @param {object} options
 * @param {object} options.scene
 * @param {{x: number, y: number}} options.observerCenter
 * @param {object} options.actor
 * @param {string} options.moduleId
 * @returns {object[]} detectables, see core/detection.js
 */
export function collectSecretDoorDetectables({ scene, observerCenter, actor, moduleId }) {
  const defaultDC = game.settings.get(moduleId, SETTINGS.secretDoorDefaultDC);
  const defaultRange = game.settings.get(moduleId, SETTINGS.secretDoorDefaultRange);
  const detectables = [];

  for (const wall of scene.walls) {
    if (wall.door !== CONST.WALL_DOOR_TYPES.SECRET) continue;

    const [x0, y0, x1, y1] = wall.c;
    const point = closestPointOnSegment(observerCenter, { x: x0, y: y0 }, { x: x1, y: y1 });

    // The target here IS a wall, so a sight ray aimed at it always collides with it and nothing
    // would ever be detected. Aim half a grid square short of the wall instead. When the observer
    // is closer than that there is no room to pull back - and at that range they are against the
    // wall anyway, so the sight test is simply skipped.
    const sightPoint = pullBack(point, observerCenter, canvas.grid.size / 2);
    const seen = wall.getFlag(moduleId, FLAGS.notifiedActorIds) ?? [];

    detectables.push({
      key: wall.uuid,
      skill: "prc",
      dc: wall.getFlag(moduleId, FLAGS.dc) ?? defaultDC,
      point,
      sightPoint: sightPoint ?? point,
      range: wall.getFlag(moduleId, FLAGS.range) ?? defaultRange,
      message: wall.getFlag(moduleId, FLAGS.message) || null,
      spottedKey: "DND5E_GM_TOOLKIT.secretDoor.spotted",
      missedKey: "DND5E_GM_TOOLKIT.secretDoor.notSpotted",
      requiresSight: sightPoint !== null,
      hasSeen: () => seen.includes(actor.id),
      markSeen: () => wall.setFlag(moduleId, FLAGS.notifiedActorIds, [...seen, actor.id])
    });
  }

  return detectables;
}
```

- [ ] **Step 2: Includere i muri nell'hook**

In `tools/passive-detection/index.js`, sostituire la costruzione dei rilevabili dentro l'hook:

```js
      const detectables = [
        ...collectRegionDetectables({ scene, observerCenter, actor, moduleId, typeId: TYPE_ID }),
        ...collectSecretDoorDetectables({ scene, observerCenter, actor, moduleId })
      ];
      if (!detectables.length) return;
```

e aggiornare l'import:

```js
import { collectRegionDetectables, collectSecretDoorDetectables } from "./sources.js";
```

- [ ] **Step 3: Aggiungere le stringhe**

In `lang/en.json`, dentro `DND5E_GM_TOOLKIT.secretDoor`, accanto a `wallConfig`:

```json
      "spotted": "{name} spots something odd about this stretch of wall (passive Perception meets/beats DC {dc}).",
      "notSpotted": "{name} passes a secret door without noticing it (DC {dc})."
```

In `lang/it.json`:

```json
      "spotted": "{name} nota qualcosa di strano in questo tratto di parete (percezione passiva pari o superiore a CD {dc}).",
      "notSpotted": "{name} passa davanti a una porta segreta senza accorgersene (CD {dc})."
```

- [ ] **Step 4: Verificare che i test passino ancora**

Run: `npm test`
Expected: PASS, 29 test

- [ ] **Step 5: Verifica manuale**

Disegnare un muro con tipo porta Segreta, senza toccarne i campi: muovere un PG entro il raggio di default e verificare che scatti con la CD di default. Impostare un messaggio personalizzato e provarlo con un secondo PG: il testo personalizzato deve arrivare solo a chi riesce. Mettere la porta segreta **dietro un altro muro** e verificare che non venga rilevata: è il caso che l'arretramento del punto di visuale deve continuare a bloccare. Avvicinare un PG a contatto con la porta: deve comunque essere rilevata, perché sotto mezza casella il test di visuale viene saltato. **La porta non deve mai essere rivelata**: nessun cambio di stato del muro.

- [ ] **Step 6: Commit**

```bash
git add tools/passive-detection/sources.js tools/passive-detection/index.js lang/en.json lang/it.json
git commit -m "feat(passive-detection): rilevamento passivo delle porte segrete"
```

---

### Task 10: Rilevamento delle creature nascoste

**Files:**
- Create: `tools/hidden-creatures/index.js`
- Create: `tools/hidden-creatures/sources.js`
- Modify: `tools/index.js`
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: nucleo e geometria.
- Produces: da `sources.js` — `collectCreatureDetectables({targets, actor, moduleId}) -> Detectable[]`, `isHiddenCreature(tokenDocument) -> boolean`, `tokenCenter(tokenDocument) -> {x, y}`, e la costante `HIDING_STATUS = "hiding"`, usata dalle task 11 e 12.

- [ ] **Step 1: Scrivere la sorgente delle creature**

Creare `tools/hidden-creatures/sources.js`:

```js
import { FLAGS, SETTINGS } from "../../scripts/constants.js";

export const HIDING_STATUS = "hiding";

/**
 * Centre of a token in pixel space.
 * @returns {{x: number, y: number}}
 */
export function tokenCenter(tokenDocument) {
  const gridSize = tokenDocument.parent.grid.size;
  return {
    x: tokenDocument.x + ((tokenDocument.width * gridSize) / 2),
    y: tokenDocument.y + ((tokenDocument.height * gridSize) / 2)
  };
}

/**
 * Both markers are required. `hidden` alone would catch tokens a GM hides for staging reasons
 * (NPCs not yet in play, scenery); the `hiding` status alone would catch creatures the players
 * can already see. See tools/hidden-creatures/marker-guard.js for the safety net that stops a
 * forgotten marker from failing silently.
 * @returns {boolean}
 */
export function isHiddenCreature(tokenDocument) {
  return tokenDocument.hidden === true
    && tokenDocument.actor?.statuses?.has(HIDING_STATUS) === true;
}

/**
 * Turns hidden creatures into detectables for one observing PC.
 *
 * The DC is the creature's passive Stealth, read live: no stored roll, so nothing to keep in
 * sync and no dialog to interrupt anyone.
 *
 * @param {object} options
 * @param {object[]} options.targets   TokenDocuments already known to be hidden creatures.
 * @param {object} options.actor       Actor of the observing PC.
 * @param {string} options.moduleId
 * @returns {object[]} detectables, see core/detection.js
 */
export function collectCreatureDetectables({ targets, actor, moduleId }) {
  const range = game.settings.get(moduleId, SETTINGS.creatureDetectionRange);

  return targets.map(token => {
    const point = tokenCenter(token);
    const seen = token.getFlag(moduleId, FLAGS.detectedBy) ?? [];

    return {
      key: token.uuid,
      skill: "prc",
      dc: token.actor.system.skills?.ste?.passive ?? 0,
      point,
      sightPoint: point,
      range,
      message: null,
      spottedKey: "DND5E_GM_TOOLKIT.hiddenCreatures.spotted",
      missedKey: "DND5E_GM_TOOLKIT.hiddenCreatures.notSpotted",
      requiresSight: true,
      hasSeen: () => seen.includes(actor.id),
      markSeen: () => token.setFlag(moduleId, FLAGS.detectedBy, [...seen, actor.id])
    };
  });
}
```

- [ ] **Step 2: Scrivere lo strumento**

Creare `tools/hidden-creatures/index.js`:

```js
import { runDetection } from "../../core/detection.js";
import { isSightBlocked, sceneDistance } from "../../core/geometry.js";
import { reportDetection } from "../../core/notify.js";
import { FLAGS, SETTINGS } from "../../scripts/constants.js";
import { HIDING_STATUS, collectCreatureDetectables, isHiddenCreature, tokenCenter } from "./sources.js";

/**
 * Passive Perception against a hidden creature's passive Stealth.
 *
 * The comparison is symmetric, so it runs on both sides of a movement: a creature crawling toward
 * the party exposes itself exactly as much as the party walking toward it, and only checking the
 * PC's movement would miss half the real cases.
 */
export default {
  id: "hidden-creatures",
  titleKey: "DND5E_GM_TOOLKIT.tools.hiddenCreatures.title",
  hintKey: "DND5E_GM_TOOLKIT.tools.hiddenCreatures.hint",
  default: false,

  register(moduleId) {
    game.settings.register(moduleId, this.id, {
      name: this.titleKey,
      hint: this.hintKey,
      scope: "world",
      config: true,
      type: Boolean,
      default: this.default,
      // The hooks below are attached once per page load, at "ready".
      requiresReload: true
    });

    game.settings.register(moduleId, SETTINGS.creatureDetectionRange, {
      name: "DND5E_GM_TOOLKIT.settings.creatureDetectionRange.name",
      hint: "DND5E_GM_TOOLKIT.settings.creatureDetectionRange.hint",
      scope: "world",
      config: true,
      type: Number,
      default: 30
    });
  },

  onReady(moduleId) {
    if (!game.settings.get(moduleId, this.id)) return;

    Hooks.on("moveToken", async (tokenDocument) => {
      if (!game.user.isGM) return;

      const scene = tokenDocument.parent;
      if (!scene) return;

      if (tokenDocument.actor?.type === "character") {
        const targets = scene.tokens.filter(isHiddenCreature);
        await detect({ observerToken: tokenDocument, targets, moduleId });
        return;
      }

      if (!isHiddenCreature(tokenDocument)) return;

      // The creature moved: re-check every PC against this one creature.
      for (const pcToken of scene.tokens) {
        if (pcToken.actor?.type !== "character") continue;
        await detect({ observerToken: pcToken, targets: [tokenDocument], moduleId });
      }
    });

    // A creature that stops hiding and hides again deserves a fresh chance against everyone,
    // so the record of who spotted it is wiped when the status comes off.
    Hooks.on("deleteActiveEffect", async (effect) => {
      if (!game.user.isGM) return;
      if (!effect.statuses?.has(HIDING_STATUS)) return;

      const actor = effect.parent;
      if (!(actor instanceof Actor)) return;

      const tokens = actor.isToken ? [actor.token] : actor.getActiveTokens(false, true);
      for (const token of tokens) {
        await token?.unsetFlag(moduleId, FLAGS.detectedBy);
      }
    });
  }
};

/**
 * @param {object} options
 * @param {object} options.observerToken  TokenDocument of the observing PC.
 * @param {object[]} options.targets      TokenDocuments of hidden creatures.
 * @param {string} options.moduleId
 * @returns {Promise<void>}
 */
async function detect({ observerToken, targets, moduleId }) {
  const actor = observerToken.actor;
  if (!actor) return;

  const detectables = collectCreatureDetectables({ targets, actor, moduleId });
  if (!detectables.length) return;

  const observerCenter = tokenCenter(observerToken);

  await runDetection({
    observer: actor,
    detectables,
    measure: (point) => sceneDistance(observerCenter, point),
    isSightBlocked: (point) => isSightBlocked(observerCenter, point),
    report: ({ observer, detectable, spotted }) => reportDetection({
      moduleId, observer, detectable, spotted,
      toastEnabled: game.settings.get(moduleId, SETTINGS.screenAlert)
    })
  });
}
```

- [ ] **Step 3: Registrare lo strumento**

In `tools/index.js`:

```js
import passiveDetection from "./passive-detection/index.js";
import hiddenCreatures from "./hidden-creatures/index.js";
import lockpicking from "./lockpicking/index.js";

/**
 * Explicit registry of every tool shipped by this module.
 * Foundry loads ES modules directly in the browser (no bundler), so folders under
 * tools/ cannot be auto-discovered at runtime: add a new tool by creating its folder
 * and importing it here.
 */
export const TOOLS = [
  passiveDetection,
  hiddenCreatures,
  lockpicking
];
```

- [ ] **Step 4: Aggiungere le stringhe**

In `lang/en.json`, dentro `tools`:

```json
      "hiddenCreatures": {
        "title": "Hidden Creatures (passive Perception)",
        "hint": "Mark an NPC's token as both hidden on the canvas and carrying the Hiding status, and every PC that comes within range is checked: their passive Perception against the creature's passive Stealth. Nothing is revealed - the player is told privately that they have noticed something. Once per PC until the creature hides again."
      }
```

E a primo livello dentro `DND5E_GM_TOOLKIT`:

```json
    "hiddenCreatures": {
      "spotted": "{name} catches movement that should not be there (passive Perception meets/beats DC {dc}).",
      "notSpotted": "{name} walks past something hidden and lying in wait (DC {dc})."
    }
```

E dentro `settings`:

```json
      "creatureDetectionRange": {
        "name": "Hidden creatures: detection range",
        "hint": "Distance in scene units within which a PC's passive Perception is compared with a hidden creature's passive Stealth. Without a limit, a high passive would notice an ambush across the whole map."
      }
```

In `lang/it.json`, dentro `tools`:

```json
      "hiddenCreatures": {
        "title": "Creature nascoste (percezione passiva)",
        "hint": "Marca il token di un PNG sia come nascosto sulla canvas sia con lo status Nascosto, e ogni PG che entra nel raggio viene controllato: percezione passiva contro furtività passiva della creatura. Non viene rivelato nulla, al giocatore arriva in privato che ha notato qualcosa. Una volta per PG, finché la creatura non si ri-nasconde."
      }
```

```json
    "hiddenCreatures": {
      "spotted": "{name} coglie un movimento che non dovrebbe esserci (percezione passiva pari o superiore a CD {dc}).",
      "notSpotted": "{name} passa accanto a qualcosa di nascosto e in agguato (CD {dc})."
    }
```

```json
      "creatureDetectionRange": {
        "name": "Creature nascoste: raggio di rilevamento",
        "hint": "Distanza in unità di scena entro cui la percezione passiva di un PG viene confrontata con la furtività passiva di una creatura nascosta. Senza un limite, una passiva alta noterebbe un agguato dall'altro capo della mappa."
      }
```

- [ ] **Step 5: Verificare che i test passino ancora**

Run: `npm test`
Expected: PASS, 29 test

- [ ] **Step 6: Verifica manuale**

Attivare lo strumento e ricaricare. Prendere un PNG con Furtività, nasconderne il token e applicargli lo status Nascosto. Muovere un PG entro 30: chi ha la passiva sufficiente riceve il messaggio, gli altri no e il DM vede il fallimento. Muovere di nuovo lo stesso PG: nessuna ripetizione. **Muovere la creatura** verso un PG fermo: il controllo deve scattare lo stesso, è il caso simmetrico. Togliere lo status Nascosto e rimetterlo: tutti devono avere una nuova occasione. Verificare che con un muro in mezzo non scatti.

- [ ] **Step 7: Commit**

```bash
git add tools/hidden-creatures/ tools/index.js lang/en.json lang/it.json
git commit -m "feat(hidden-creatures): percezione passiva contro furtività passiva"
```

---

### Task 11: Avviso sui marcatori incoerenti

**Files:**
- Create: `tools/hidden-creatures/marker-guard.js`
- Modify: `tools/hidden-creatures/index.js`
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: `HIDING_STATUS` dalla task 10.
- Produces: `registerMarkerGuard()`.

- [ ] **Step 1: Scrivere la guardia**

Creare `tools/hidden-creatures/marker-guard.js`:

```js
import { HIDING_STATUS } from "./sources.js";

/**
 * Requiring both markers means forgetting one produces no detection at all, silently - the worst
 * way for this to fail, because nothing looks broken. These two hooks turn that silence into a
 * one-line notice for the GM.
 *
 * It only ever tells: no marker is applied or removed automatically. Hiding a token and declaring
 * a creature hidden are two different intentions, and guessing which one was meant would be worse
 * than saying nothing.
 */
export function registerMarkerGuard() {
  Hooks.on("createActiveEffect", (effect) => {
    if (!game.user.isGM) return;
    if (!effect.statuses?.has(HIDING_STATUS)) return;

    const actor = effect.parent;
    if (!(actor instanceof Actor)) return;

    const tokens = actor.isToken ? [actor.token] : actor.getActiveTokens(false, true);
    const visible = tokens.filter(token => token && !token.hidden);
    if (!visible.length) return;

    ui.notifications.info(
      game.i18n.format("DND5E_GM_TOOLKIT.hiddenCreatures.markerWarning.needsHidden", {
        name: actor.name
      })
    );
  });

  Hooks.on("updateToken", (tokenDocument, changes) => {
    if (!game.user.isGM) return;
    if (changes.hidden !== true) return;
    if (tokenDocument.actor?.type === "character") return;
    if (tokenDocument.actor?.statuses?.has(HIDING_STATUS)) return;

    ui.notifications.info(
      game.i18n.format("DND5E_GM_TOOLKIT.hiddenCreatures.markerWarning.needsStatus", {
        name: tokenDocument.name
      })
    );
  });
}
```

- [ ] **Step 2: Agganciare la guardia**

In `tools/hidden-creatures/index.js`, in coda a `onReady(moduleId)`:

```js
    registerMarkerGuard();
```

con `import { registerMarkerGuard } from "./marker-guard.js";`

- [ ] **Step 3: Aggiungere le stringhe**

In `lang/en.json`, dentro `DND5E_GM_TOOLKIT.hiddenCreatures`:

```json
      "markerWarning": {
        "needsHidden": "{name} is marked as Hiding but its token is still visible to players, so it will not be detected. Hide the token too.",
        "needsStatus": "{name} is hidden from players but has no Hiding status, so it will not be detected. Add the status if it is meant to be lying in wait."
      }
```

In `lang/it.json`:

```json
      "markerWarning": {
        "needsHidden": "{name} è marcato come Nascosto ma il suo token è ancora visibile ai giocatori, quindi non verrà rilevato. Nascondi anche il token.",
        "needsStatus": "{name} è nascosto ai giocatori ma non ha lo status Nascosto, quindi non verrà rilevato. Aggiungi lo status se è in agguato."
      }
```

- [ ] **Step 4: Verifica manuale**

Applicare lo status Nascosto a un PNG col token visibile: deve comparire l'avviso, solo al DM. Nascondere il token: nessun avviso ulteriore, e da quel momento il rilevamento funziona. Nascondere un token senza status: avviso dell'altro tipo. Nascondere un token PG: **nessun** avviso, i PG non sono soggetti a questo controllo.

- [ ] **Step 5: Commit**

```bash
git add tools/hidden-creatures/marker-guard.js tools/hidden-creatures/index.js lang/en.json lang/it.json
git commit -m "feat(hidden-creatures): avvisa il DM quando i due marcatori sono incoerenti"
```

---

### Task 12: Proposta di sorpresa

**Files:**
- Create: `tools/hidden-creatures/surprise.js`
- Modify: `tools/hidden-creatures/index.js`
- Modify: `lang/en.json`, `lang/it.json`

**Interfaces:**
- Consumes: `isHiddenCreature` (task 10), `FLAGS`.
- Produces: `registerSurprisePrompt(moduleId)`.

- [ ] **Step 1: Scrivere la proposta**

Creare `tools/hidden-creatures/surprise.js`:

```js
import { FLAGS } from "../../scripts/constants.js";
import { isHiddenCreature } from "./sources.js";

const SURPRISED_STATUS = "surprised";

/**
 * Offers to mark as surprised every PC that failed to notice an ambusher.
 *
 * Timed on encounter creation, not on combat start: dnd5e reads statuses when initiative is
 * rolled (CONFIG.DND5E.conditionEffects.initiativeDisadvantage), and Foundry's usual flow rolls
 * initiative before "Begin Combat" is pressed. Applying the status at combatStart would therefore
 * be too late to grant the disadvantage, which is the whole point of applying it.
 *
 * At encounter creation the combatant list may still be empty, so the proposal is built from
 * scene state - which is the same record the detection already keeps.
 *
 * Nothing is applied without confirmation: the module cannot know whether the fight actually
 * started from the ambush or whether the party was alerted some other way.
 *
 * @param {string} moduleId
 */
export function registerSurprisePrompt(moduleId) {
  Hooks.on("createCombat", async (combat, options, userId) => {
    if (!game.user.isGM) return;
    if (game.user.id !== userId) return;

    const scene = combat.scene ?? canvas.scene;
    if (!scene) return;

    const ambushers = scene.tokens.filter(isHiddenCreature);
    if (!ambushers.length) return;

    const candidates = scene.tokens.filter(token => {
      if (token.actor?.type !== "character") return false;
      return ambushers.some(ambusher => {
        const detectedBy = ambusher.getFlag(moduleId, FLAGS.detectedBy) ?? [];
        return !detectedBy.includes(token.actor.id);
      });
    });
    if (!candidates.length) return;

    const chosen = await promptForSurprised(candidates);
    if (!chosen?.length) return;

    for (const token of candidates) {
      if (!chosen.includes(token.id)) continue;
      await token.actor.toggleStatusEffect(SURPRISED_STATUS, { active: true });
    }
  });
}

/**
 * @param {object[]} candidates  TokenDocuments of PCs that missed at least one ambusher.
 * @returns {Promise<string[]|null>} chosen token ids, or null if dismissed
 */
async function promptForSurprised(candidates) {
  const rows = candidates.map(token => `
    <div class="form-group">
      <label>
        <input type="checkbox" name="${token.id}" checked>
        ${foundry.utils.escapeHTML(token.name)}
      </label>
    </div>
  `).join("");

  return foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("DND5E_GM_TOOLKIT.surprise.title") },
    content: `<p>${game.i18n.localize("DND5E_GM_TOOLKIT.surprise.hint")}</p>${rows}`,
    ok: {
      label: game.i18n.localize("DND5E_GM_TOOLKIT.surprise.confirm"),
      callback: (_event, button) => candidates
        .filter(token => button.form.elements[token.id]?.checked)
        .map(token => token.id)
    },
    rejectClose: false
  });
}
```

- [ ] **Step 2: Agganciare la proposta**

In `tools/hidden-creatures/index.js`, in coda a `onReady(moduleId)`:

```js
    registerSurprisePrompt(moduleId);
```

con `import { registerSurprisePrompt } from "./surprise.js";`

- [ ] **Step 3: Aggiungere le stringhe**

In `lang/en.json`, a primo livello dentro `DND5E_GM_TOOLKIT`:

```json
    "surprise": {
      "title": "Surprised by the Ambush?",
      "hint": "These PCs did not notice at least one hidden creature on this scene. Uncheck anyone who should not be surprised, then confirm. Apply this before rolling initiative - dnd5e grants the disadvantage at roll time.",
      "confirm": "Mark as Surprised"
    }
```

In `lang/it.json`:

```json
    "surprise": {
      "title": "Sorpresi dall'imboscata?",
      "hint": "Questi PG non hanno individuato almeno una creatura nascosta su questa scena. Togli la spunta a chi non deve essere sorpreso, poi conferma. Applicalo prima di tirare l'iniziativa: dnd5e assegna lo svantaggio al momento del tiro.",
      "confirm": "Marca come sorpresi"
    }
```

- [ ] **Step 4: Verifica manuale**

Con una creatura nascosta sulla scena non individuata da almeno un PG, creare un incontro: deve comparire il dialog con l'elenco, tutti spuntati. Confermare: i PG scelti prendono l'icona Sorpreso. Tirare l'iniziativa e verificare che dnd5e applichi lo svantaggio. Annullare il dialog su un secondo incontro: **nessuno** status applicato. Creare un incontro su una scena **senza** creature nascoste: nessun dialog. Far individuare la creatura a tutti i PG e creare un incontro: nessun dialog.

- [ ] **Step 5: Commit**

```bash
git add tools/hidden-creatures/surprise.js tools/hidden-creatures/index.js lang/en.json lang/it.json
git commit -m "feat(hidden-creatures): proposta di sorpresa alla creazione dell'incontro"
```

---

### Task 13: Documentazione

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: tutto.
- Produces: niente codice.

- [ ] **Step 1: Sostituire l'intestazione e il paragrafo di apertura**

Il testo attuale dichiara "sono solo due" interruttori, cosa che non è più vera. Sostituire le
prime righe fino alla sezione Installazione con:

```markdown
# GM Toolkit (dnd5e)

Modulo Foundry VTT (v14+, `dnd5e` richiesto) con strumenti/automazioni per condurre la sessione —
**non house rules** (nessuna variante di regola opzionale: per quelle vedi il modulo separato
[dnd5e-house-rules](https://github.com/FabioC-88/dnd5e-house-rules)). Ogni strumento vive nella
propria cartella, e si attiva/disattiva da **Configure Settings**, sotto "GM Toolkit (dnd5e)":
tre interruttori più quattro impostazioni, in una lista piatta senza popup dedicato. **Dopo aver
attivato/disattivato uno strumento, Foundry ti chiederà di ricaricare**: è necessario, alcune
registrazioni (comportamenti, wrapper, hook) avvengono una sola volta all'avvio.

Il filo conduttore degli strumenti di rilevamento: **il modulo non tira mai i dadi**. Confronta
valori passivi e ti dice l'esito, così i controlli che spezzerebbero il ritmo non arrivano mai al
tavolo come richiesta di tirare.
```

- [ ] **Step 2: Riscrivere la sezione "Strumenti disponibili"**

Sostituire l'intera sezione, dal titolo fino alla nota sulla porta bloccata inclusa:

```markdown
## Strumenti disponibili

- **Rilevamento passivo** (`passive-detection`, disattivato di default) — copre due contenitori
  diversi per lo stesso concetto.

  *Trappole e indizi*: disegna una **Region** sul layer Regions (invisibile ai giocatori) nella
  vera posizione di ciò che è nascosto e aggiungile il comportamento "Rilevamento Passivo".
  Imposti **abilità** (percezione o indagare), **CD**, **raggio**, un **messaggio** facoltativo e
  se serve la **linea di vista**. Quando un token PG entra nel raggio, la sua passiva contro la CD
  decide se se ne accorge. Un solo esito per PG per punto.

  *Porte segrete*: non serve alcuna Region. Un muro con tipo porta **Segreta** partecipa da solo,
  con la CD e il raggio di default che imposti una volta per il mondo; nella configurazione del
  muro trovi i campi per sovrascriverli su quella singola porta e per scrivere un messaggio suo.
  **La porta non viene mai rivelata**: parte solo la notifica, e cosa farne decide il giocatore.

- **Creature nascoste** (`hidden-creatures`, disattivato di default) — percezione passiva del PG
  contro la **furtività passiva** della creatura (10 + modificatore, letta al volo: nessun tiro,
  niente da impostare sul PNG). Perché un token partecipi servono **entrambi** i marcatori: token
  nascosto sulla canvas **e** status "Nascosto". Se ne metti uno solo il modulo te lo dice, invece
  di non fare niente in silenzio. Il controllo è simmetrico: scatta anche quando è la creatura a
  muoversi verso il gruppo. Alla creazione di un incontro, se ci sono agguatanti non individuati,
  il modulo ti propone chi marcare come **Sorpreso** — con conferma, e prima che tu tiri
  l'iniziativa, perché è al momento del tiro che dnd5e applica lo svantaggio.

- **Scasso Serrature** (`lockpicking`, disattivato di default) — clicca una porta chiusa a chiave
  **come fai già normalmente**: invece del comportamento silenzioso di default (un suono e basta),
  compare la richiesta di tentare lo scasso con i Grimaldelli da Scasso del PG che hai attualmente
  controllato/selezionato. La prima volta su una porta ti chiede la CD della serratura e la ricorda
  per i tentativi successivi. Solo i click da DM vengono intercettati — per i giocatori il
  comportamento resta quello nativo di Foundry.

### Dove arrivano le notifiche

Chi **riesce** riceve un messaggio privato in chat, più un avviso a schermo se l'impostazione è
attiva; il DM ne riceve copia. Chi **fallisce** non riceve niente: il fallimento lo vedi solo tu,
perché dire a un giocatore che ha fallito gli dice già che c'era qualcosa da notare.

**Nota**: "porta bloccata/sbarrata" (un ulteriore stato oltre chiusa/aperta/chiusa a chiave, che
richiede di essere sfondata anche una volta scassinata) è rimandata a un incremento successivo — non
ha alcun analogo nativo in Foundry e dipende dallo stesso meccanismo di intercettazione dei click
usato per lo scasso, da validare al tavolo prima di estenderlo.

### Aggiornare da una versione precedente

Le Region trappola già disegnate vengono **convertite automaticamente** al primo avvio, e ricevi
una notifica con quante ne sono state migrate. Devi però **riaccendere l'interruttore** una volta:
lo strumento è passato da `trap-detection` a `passive-detection`, e con la chiave cambia anche
l'impostazione che ricorda se era attivo.
```

- [ ] **Step 3: Aggiornare "Aggiungere un nuovo strumento" e "Struttura"**

In fondo alla sezione "Aggiungere un nuovo strumento", prima del paragrafo sul bundler, aggiungere:

```markdown
Se lo strumento nuovo è un **rilevamento passivo** non serve toccare `core/`: basta una funzione
che produca *rilevabili* (la forma è documentata in `core/detection.js`) e passarli a
`runDetection`. Deduplica, raggio, linea di vista, confronto con la passiva e scelta dei
destinatari sono già fatti.
```

Sostituire il blocco della sezione "Struttura" con:

```markdown
```
module.json                        manifest Foundry
scripts/main.js                    hook "init"/"ready": registra tutti gli strumenti
scripts/constants.js               id del modulo, chiavi di impostazioni e flag
core/                              codice condiviso fra strumenti (non è uno strumento)
  detection.js                     la decisione: dedup, raggio, visuale, passiva vs CD
  recipients.js                    chi riceve il messaggio in chat e chi l'avviso a schermo
  geometry.js                      distanze e test di linea di vista
  notify.js                        messaggio privato in chat e avviso via socket
tools/<nome>/index.js              uno strumento per cartella
lib/libwrapper-shim.js             shim ufficiale di libWrapper (MIT, vendored da ruipin/fvtt-lib-wrapper)
lang/{en,it}.json                  traduzioni
tests/                             test del solo core, girano con vitest
```

`lib/` è riservato al codice di terzi vendorizzato; `core/` è codice nostro condiviso.
```

- [ ] **Step 4: Aggiungere test e avvertenza sulla release**

Prima della sezione "Release", aggiungere:

```markdown
## Test

```
npm install
npm test
```

I test coprono **solo `core/`**, che è puro: la persistenza vi entra da callback, quindi si prova
senza Foundry. Le sorgenti e le iniezioni di interfaccia si verificano in gioco. Niente bundler:
`npm` serve solo ai test, Foundry continua a caricare i moduli ES direttamente.
```

E in fondo alla sezione "Release", aggiungere:

```markdown
Attenzione: lo step "Create Zip Archive" elenca **esplicitamente** le cartelle da includere. Una
cartella nuova che non venga aggiunta a quell'elenco funziona in sviluppo e manca nella release,
dove il modulo va in errore al primo import.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: aggiorna il README per il rilevamento passivo"
```
