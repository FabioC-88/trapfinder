# Riconoscimento mostri — piano di implementazione

Riferimento: `docs/superpowers/specs/2026-09-06-riconoscimento-mostri-design.md`.

## 1. Dati e costanti

- [ ] `scripts/constants.js`: nuovi `FLAGS` (`monsterKey`, `descriptionOverride`, `skillOverride`,
      `recognizedMonsters`) e `SETTINGS.monsterCatalogMenu` per la chiave del menu impostazioni.
- [ ] `tools/monster-recognition/monsters-data.js`: array di ~60 mostri comuni (`key`, `name`,
      `type`, `aliases[]`), coprendo i 14 tipi dnd5e.
- [ ] `lang/it.json` + `lang/en.json`: chiave `monsterRecognition.monsters.<key>.description` per
      ogni voce del database (testo originale, non copiato da fonti coperte da copyright).

## 2. Logica pura (testabile)

- [ ] `tools/monster-recognition/monster-database.js`:
  - `normalizeName(name)`
  - `findMonsterByName(name, database)`
  - `TYPE_TO_SKILL` + `skillForType(type)`
  - `computeIdentificationDC(cr)`
  - `evaluateRecognition({ passive, dc, alreadyKnown })`
- [ ] `tests/monster-recognition.test.js`: casi elencati nella spec.

## 3. Risoluzione profilo e memoria (tocca Foundry)

- [ ] `tools/monster-recognition/profile.js`:
  - `resolveMonsterProfile(actor, moduleId)` → `{ key, displayName, type, skill, description, dc, source }`
  - `isRecognized(pcActor, key, moduleId)` / `markRecognized(pcActor, key, moduleId)`

## 3bis. Scheda meccanica letta dall'Actor

- [ ] `tools/monster-recognition/statblock.js` (puro): `summarizeStatblock(actor)` → sensi,
      percezione passiva, velocità diverse da quella a piedi, linguaggi, dr/di/dv/ci, nomi dei
      tratti e nomi degli attacchi, tutto come **chiavi grezze dnd5e**; più `formatCR`
- [ ] `tools/monster-recognition/narrate.js` (puro): `narrativeBeats(profile)` → quali frasi
      raccontare, con la mappa dei tratti comuni riconosciuti in inglese e in italiano; `joinList`
- [ ] `tests/narrate.test.js`
- [ ] `profile.js`: il profilo si porta dietro `type`, `size`, `cr` e `statblock`
- [ ] `tests/statblock.test.js`: casi elencati nella spec
- [ ] Il messaggio è **prosa**, senza numeri né termini di regolamento: la riga finale dice perché
      il personaggio lo sa, non quale passiva ha battuto quale CD (i numeri restano nel whisper di
      fallimento, che vede solo il DM)
- [ ] Localizzazione delle chiavi grezze **solo** in `chat.js`, via `CONFIG.DND5E`
      (`damageTypes`, `conditionTypes`, `languages`, `creatureTypes`, `actorSizes`,
      `movementUnits`), con lettura tollerante delle tre forme che dnd5e ha usato negli anni
      (stringa, `{label}`, albero con `{children}`)

## 4. Messaggi in chat

- [ ] `tools/monster-recognition/chat.js`:
  - testo completo (prima riuscita), compatto (`<details>` chiuso, già noto), whisper di
    fallimento solo DM
  - riuso di `core/recipients.js` per i destinatari e dello stesso canale socket/toast già
    registrato in `core/notify.js` (nessuna nuova registrazione socket)

## 5. Hook di combattimento

- [ ] `tools/monster-recognition/combat-hook.js`:
  - `registerCombatStartHook(moduleId)`: su `combatStart`, prende i combattenti con
    `actor.type === "npc"` e disposizione ostile, raggruppa per `profile.key`, valuta ogni PG
    (`actor.type === "character"`) una sola volta per gruppo
  - avviso solo al DM (`ui.notifications.warn`) per un mostro senza abilità risolvibile, poi si
    salta quel mostro

## 5bis. Tiro attivo (Token HUD)

- [ ] `chat.js`: parametro `checkMode` (`"passive"`/`"active"`) su `sendRecognitionResult`, due
      varianti testuali per riuscita/fallimento; esporta `skillLabelFor`
- [ ] `tools/monster-recognition/active-check.js`:
  - `registerActiveCheckButton(moduleId)`: su `renderTokenHUD`, aggiunge un'icona per i token PNG
    (solo per il DM)
  - al click: usa `canvas.tokens.controlled[0]?.actor` come PG che tira (stesso schema di
    `lockpicking`); se già noto, messaggio compatto senza tirare; altrimenti
    `actor.rollSkill({ skill }, {}, { data: { flavor } })` (stesso schema `(config, dialog,
    message)` già verificato per `rollToolCheck`), poi stessa `evaluateRecognition` e
    `sendRecognitionResult` del flusso passivo con `checkMode: "active"`
- [ ] `index.js`: registra `registerActiveCheckButton` in `onReady`, dietro lo stesso interruttore

## 6. Pannello "Elenco Mostri"

- [ ] `tools/monster-recognition/monster-list-app.js`: `ApplicationV2` (stessa famiglia di
      `DialogV2` già in uso in `lockpicking`/`hidden-creatures`), HTML costruito a mano (nessun
      template Handlebars, coerente con `wall-config.js`/`surprise.js`):
  - tabella: nome, GS, tipo, select abilità, stato descrizione, pulsante "Modifica"
  - dialog di modifica: select "mostro di riferimento" (voci del database) + textarea
    descrizione personalizzata
  - filtro testuale semplice sopra la tabella
- [ ] CSS minimo dedicato, incluso in `module.json` → `styles`

## 7. Registrazione strumento

- [ ] `tools/monster-recognition/index.js`: descrittore standard (`register`/`onReady`), toggle
      di mondo, `game.settings.registerMenu` per il pannello (sempre attivo, non dietro
      l'interruttore), hook `combatStart` registrato solo se lo strumento è acceso
- [ ] `tools/index.js`: importa e aggiunge alla lista `TOOLS`

## 8. Localizzazione e documentazione

- [ ] `lang/it.json` + `lang/en.json`: titolo/hint dello strumento, stringhe del pannello, testi
      dei messaggi in chat, avviso "abilità non risolvibile"
- [ ] `README.md`: nuova voce nell'elenco strumenti + eventuale aggiornamento del conteggio delle
      impostazioni di mondo

## 9. Verifica

- [ ] `npm test` (Vitest) verde
- [ ] Verifica manuale al tavolo secondo la checklist della spec

## Ordine di esecuzione

1→2→3→4→5→7 (schema minimo funzionante, senza pannello) →6 (pannello) →8→9. Il pannello è
posticipato rispetto all'hook di combattimento perché l'automazione è già utile con la sola
corrispondenza automatica per nome; il pannello aggiunge la possibilità di correggerla.
