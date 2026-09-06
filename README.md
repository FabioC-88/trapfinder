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

## Installazione

In Foundry, **Add-on Modules > Install Module**, incolla il manifest:

```
https://github.com/FabioC-88/trapfinder/releases/latest/download/module.json
```

Poi attiva il modulo nel mondo (richiede il sistema `dnd5e`). Se hai anche
[libWrapper](https://foundryvtt.com/packages/lib-wrapper) installato, il modulo lo userà
automaticamente per lo scasso serrature (compatibilità migliore con altri moduli); in caso contrario
usa uno shim incluso, senza bisogno di installare nulla in più.

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

- **Riconoscimento Mostri** (`monster-recognition`, disattivato di default) — quando il
  combattimento comincia, ogni PG viene confrontato con ogni mostro ostile presente: conoscenza
  passiva corretta per il tipo di creatura (Arcano/Natura/Religione/Storia, secondo il tipo del
  PNG) contro CD **10 + Grado di Sfida**. Chi la supera riceve in chat quello che il suo
  personaggio ricorda, raccontato a parole: *"È un gigante di taglia grande. Ci vede bene anche al
  buio. Le sue ferite si richiudono da sole mentre stai ancora combattendo. Ha un olfatto
  acutissimo. Attacca con morso e artiglio."* Niente numeri, niente termini di regolamento —
  quello è il blocco statistiche, che ce l'hai già aperto tu. Ma le informazioni sotto sono vere:
  sensi, velocità particolari, resistenze, immunità, vulnerabilità, linguaggi, attacchi e tratti
  vengono letti dall'Actor che hai piazzato, quindi restano corretti anche per un mostro che hai
  modificato o reskinnato, e funzionano pure per PNG che non sono nel database interno.
  Il riconoscimento vale per tipo di creatura, non per singolo PNG: una volta riconosciuto
  un Goblin, i Goblin successivi vengono riconosciuti sempre, senza controllo, con un messaggio
  compatto (un click per rileggere la scheda). Il modulo include un database interno di ~60
  mostri comuni che copre la sola **lore** — la parte che un blocco statistiche non ha — abbinata
  per nome ai PNG già presenti nel mondo: dal pannello **Elenco Mostri** (in Configure Settings)
  puoi correggere l'abbinamento, l'abilità e scrivere una descrizione personalizzata per ciascun
  PNG. Un PNG ostile senza tipo risolvibile e senza correzione manuale
  viene saltato con un avviso solo per te, mai in silenzio.

  Se un giocatore vuole tentare un **tiro attivo** invece di affidarsi alla passiva, clicca
  l'icona a forma di libro sul Token HUD del PNG: fa tirare al PG attualmente
  controllato/selezionato la stessa abilità di conoscenza (tiro vero, pubblico in chat, con
  dialog nativo per vantaggio/bonus — qui, a differenza del resto del modulo, il dado si vede
  davvero perché il giocatore lo sta chiedendo esplicitamente). Se il PG ha già riconosciuto quel
  tipo di mostro, niente tiro: arriva subito il messaggio compatto.

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

## Aggiungere un nuovo strumento

1. Crea `tools/<nome>/index.js` che esporta `{ id, titleKey, hintKey, default: false, register(moduleId), onReady(moduleId) }`.
   - `register(moduleId)` registra il toggle on/off (`game.settings.register`, `config: true`,
     `requiresReload: true` — le registrazioni sotto girano una sola volta per caricamento pagina,
     quindi un toggle a runtime richiede un reload) e, se serve toccare `CONFIG.*` prima che Foundry
     inizializzi le impostazioni (es. status effect, Region Behavior custom), lo fa qui — non in
     `onReady()`.
   - `onReady(moduleId)` aggancia gli hook/API necessari, solo se il toggle è attivo.
2. Aggiungi le chiavi di traduzione in `lang/en.json` e `lang/it.json`.
3. Importa e registra il nuovo strumento in `tools/index.js`:
   ```js
   import passiveDetection from "./passive-detection/index.js";
   import hiddenCreatures from "./hidden-creatures/index.js";
   import lockpicking from "./lockpicking/index.js";
   import miaFunzionalita from "./mia-funzionalita/index.js";
   export const TOOLS = [passiveDetection, hiddenCreatures, lockpicking, miaFunzionalita];
   ```

Se lo strumento nuovo è un **rilevamento passivo** non serve toccare `core/`: basta una funzione
che produca *rilevabili* (la forma è documentata in `core/detection.js`) e passarli a
`runDetection`. Deduplica, raggio, linea di vista, confronto con la passiva e scelta dei
destinatari sono già fatti.

Non serve nessun bundler: Foundry carica i moduli ES direttamente, quindi il registro in
`tools/index.js` è l'unico punto da aggiornare per collegare una nuova cartella.

## Struttura

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

## Test

```
npm install
npm test
```

I test coprono **solo `core/`**, che è puro: la persistenza vi entra da callback, quindi si prova
senza Foundry. Le sorgenti e le iniezioni di interfaccia si verificano in gioco. Niente bundler:
`npm` serve solo ai test, Foundry continua a caricare i moduli ES direttamente.

## Release

Ogni push di un tag `v*` (es. `v0.2.0`) fa partire `.github/workflows/release.yml`, che:
1. aggiorna `version` e `download` in `module.json` in base al tag;
2. committa `module.json` su `main`;
3. crea lo zip del pacchetto;
4. pubblica una GitHub Release con `module.json` e lo zip allegati, pronti per il manifest URL
   sopra.

Attenzione: lo step "Create Zip Archive" elenca **esplicitamente** le cartelle da includere. Una
cartella nuova che non venga aggiunta a quell'elenco funziona in sviluppo e manca nella release,
dove il modulo va in errore al primo import.
