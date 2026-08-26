# GM Toolkit (dnd5e)

Modulo Foundry VTT (v14+, `dnd5e` richiesto) con strumenti/automazioni per condurre la sessione —
**non house rules** (nessuna variante di regola opzionale: per quelle vedi il modulo separato
[dnd5e-house-rules](https://github.com/FabioC-88/dnd5e-house-rules)). Ogni strumento vive nel proprio
file, si attiva/disattiva dal "GM Toolkit" (raggiungibile da **Configure Settings**).

## Installazione

In Foundry, **Add-on Modules > Install Module**, incolla il manifest:

```
https://github.com/FabioC-88/dnd5e-gm-toolkit/releases/latest/download/module.json
```

Poi attiva il modulo nel mondo (richiede il sistema `dnd5e`). Se hai anche
[libWrapper](https://foundryvtt.com/packages/lib-wrapper) installato, il modulo lo userà
automaticamente per lo scasso serrature (compatibilità migliore con altri moduli); in caso contrario
usa uno shim incluso, senza bisogno di installare nulla in più.

## Strumenti disponibili

- **Rilevamento Trappole** (`trap-detection`, disattivato di default) — disegna una **Region** sul
  layer Regions (invisibile ai giocatori) nella vera posizione della trappola, aggiungi ad essa il
  comportamento "Trap Detection", imposta **CD** e **Raggio di rilevamento**. Da quel momento, ogni
  volta che un token PG si avvicina entro quel raggio, ricevi un messaggio privato: la sua percezione
  passiva (`system.skills.prc.passive`) contro la CD decide se se ne accorge. Un solo avviso per PG
  per trappola (non si ripete se il gruppo passa avanti e indietro).
- **Scasso Serrature** (`lockpicking`, disattivato di default) — clicca una porta chiusa a chiave
  **come fai già normalmente**: invece del comportamento silenzioso di default (un suono e basta),
  compare la richiesta di tentare lo scasso con i Grimaldelli da Scasso del PG che hai attualmente
  controllato/selezionato. La prima volta su una porta ti chiede la CD della serratura e la ricorda
  per i tentativi successivi. Solo i click da DM vengono intercettati — per i giocatori il
  comportamento resta quello nativo di Foundry.

**Nota**: "porta bloccata/sbarrata" (un ulteriore stato oltre chiusa/aperta/chiusa a chiave, che
richiede di essere sfondata anche una volta scassinata) è rimandata a un incremento successivo — non
ha alcun analogo nativo in Foundry e dipende dallo stesso meccanismo di intercettazione dei click
usato per lo scasso, da validare al tavolo prima di estenderlo.

## Aggiungere un nuovo strumento

1. Crea `tools/<nome>/index.js` che esporta `{ id, titleKey, hintKey, default: false, register(moduleId), onReady(moduleId) }`.
   - `register(moduleId)` registra il toggle on/off (`game.settings.register`, `config: false`) e,
     se serve toccare `CONFIG.*` prima che Foundry inizializzi le impostazioni (es. status effect,
     Region Behavior custom), lo fa qui — non in `onReady()`.
   - `onReady(moduleId)` aggancia gli hook/API necessari, solo se il toggle è attivo.
2. Aggiungi le chiavi di traduzione in `lang/en.json` e `lang/it.json`.
3. Importa e registra il nuovo strumento in `tools/index.js`:
   ```js
   import miaFunzionalita from "./mia-funzionalita/index.js";
   export const TOOLS = [trapDetection, lockpicking, miaFunzionalita];
   ```

Non serve nessun bundler: Foundry carica i moduli ES direttamente, quindi il registro in
`tools/index.js` è l'unico punto da aggiornare per collegare una nuova cartella.

## Struttura

```
module.json                        manifest Foundry
scripts/main.js                    hook "init"/"ready": registra tutti gli strumenti
scripts/gm-toolkit-manager.js      app Settings Menu con i toggle
tools/<nome>/index.js              uno strumento per cartella
lib/libwrapper-shim.js             shim ufficiale di libWrapper (MIT, vendored da ruipin/fvtt-lib-wrapper)
lang/{en,it}.json                  traduzioni
templates/gm-toolkit-manager.hbs   markup dell'app Settings Menu
styles/gm-toolkit.css              stile minimo dell'app
```

## Release

Ogni push di un tag `v*` (es. `v0.2.0`) fa partire `.github/workflows/release.yml`, che:
1. aggiorna `version` e `download` in `module.json` in base al tag;
2. committa `module.json` su `main`;
3. crea lo zip del pacchetto;
4. pubblica una GitHub Release con `module.json` e lo zip allegati, pronti per il manifest URL
   sopra.
