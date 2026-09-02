# Rilevamento passivo — design

Data: 2026-09-02
Stato: approvato in brainstorming, da tradurre in piano di implementazione

## Obiettivo

Automatizzare i tiri che interrompono il flusso di gioco e che si basano su abilità passive.
Oggi il modulo copre un solo caso (trappole). Questo incremento generalizza il meccanismo e
aggiunge due soggetti nuovi, senza mai chiedere un tiro a nessuno.

Principio guida: **il modulo non tira mai i dadi**. Confronta un valore passivo dell'osservatore
con un valore passivo o una CD del bersaglio, e comunica il risultato a chi di dovere.

## Ambito

Dentro:

- **Nucleo condiviso** — decisione e notifica, riusabile da qualunque sorgente.
- **Motore 1, punti statici** — trappole e indizi nascosti (Region), porte segrete (muro).
- **Motore 2, creature nascoste** — percezione passiva contro furtività passiva, più la
  proposta di sorpresa a inizio combattimento.

Fuori, con spec propria in futuro:

- **Motore 3, intuizione passiva contro inganno di un PNG.** Escluso perché non è scatenato da
  alcun movimento: richiede un punto di ingresso nell'interfaccia che il modulo oggi non ha, e le
  sue domande di UI non devono bloccare il resto, che è già chiaro.
- **Modificatori automatici alla passiva** (−5 con svantaggio, +5 con vantaggio). Scartato.

## Decisioni e loro motivazione

### Furtività e Inganno si leggono come passive

`system.skills.ste.passive` (10 + mod) e non un tiro di Furtività memorizzato.

Conseguenza importante: **non serve alcuno stato per il bersaglio.** Cade il pattern
"chiedi una volta e ricorda su flag" usato da `lockpicking` per la CD delle serrature, che era
il candidato naturale. Niente dialog, niente flag, niente disallineamento. Vale anche per il
motore 3 quando arriverà.

Si scosta dalle regole scritte (nascondersi è una prova attiva di Furtività) ed è deliberato:
una prova attiva reintrodurrebbe esattamente l'interruzione che stiamo togliendo.

### Le porte segrete non vengono mai rivelate

Alla riuscita parte solo la notifica. Decide il giocatore cosa fare.

Oltre a essere la scelta di conduzione voluta, elimina un vincolo tecnico reale: un muro
`WALL_DOOR_TYPES.SECRET` è nascosto ai giocatori **a livello di mondo, non per utente**.
Rivelarlo al singolo PG che l'ha notata è impossibile; rivelarlo rivelerebbe a tutti. Non
rivelando nulla il problema semplicemente non esiste.

### I dati delle porte segrete stanno sul muro, non su una Region

Le trappole richiedono per forza una Region: in Foundry non esiste un oggetto nativo "trappola".
Le porte segrete sì — il muro `SECRET` è già disegnato. Chiedere anche una Region significherebbe
due oggetti da tenere allineati a mano, che divergono appena si sposta il muro.

Il modulo salva già dati per-muro come flag (`lockpicking` usa `wall.document.getFlag(moduleId,
"lockDC")`), quindi non è un pattern nuovo: l'unica parte nuova è dove il DM li digita.

### Una creatura è nascosta solo se ha entrambi i marcatori

Token nascosto sulla canvas (`token.hidden`) **e** status dnd5e `hiding`.

Il solo `hidden` produrrebbe falsi positivi: i DM nascondono token anche per motivi scenici
(PNG non ancora entrati, decorazioni). Il solo `hiding` lascerebbe passare creature che i
giocatori già vedono.

Il costo di richiederli entrambi è il fallimento silenzioso quando se ne dimentica uno, ed è
mitigato esplicitamente: vedi "Rete di sicurezza sui marcatori".

### La sorpresa è proposta, non applicata

Il modulo non può sapere se il combattimento parte davvero dall'imboscata o se i PG erano
allertati per altre vie. Applicare `surprised` da solo produrrebbe errori scoperti a iniziativa
già tirata, cioè troppo tardi. Un dialog con conferma costa un click e lascia il controllo.

### Due strumenti sopra una libreria condivisa

`Rilevamento passivo` e `Creature nascoste`, più `core/` non visibile nelle impostazioni.
Segue la convenzione documentata nel README (un tool = una cartella = un interruttore) e tiene
separabile la parte più opinabile: si possono avere trappole e porte segrete senza portarsi
dietro l'automazione delle creature e della sorpresa.

## Architettura

```
core/detection.js        decide: dedup, distanza, visuale, passiva vs CD, invoca notifica
core/notify.js           whisper mirato + toast; registra il socket
core/geometry.js         distanza punto/bbox, punto/segmento, test di visuale

tools/passive-detection/            (ex trap-detection)
  index.js                          toggle, registrazione behavior, migrazione, hook moveToken
  passive-detection-behavior.js     schema del Region behavior
  wall-config.js                    iniezione dei campi nella scheda muro

tools/hidden-creatures/
  index.js                          toggle, hook moveToken simmetrico
  surprise.js                       proposta di sorpresa al DM
```

`lib/` resta riservato al codice di terzi vendorizzato (oggi lo shim di libWrapper). `core/` è
codice nostro condiviso, sorella di `tools/`.

### Il confine portante

**Le sorgenti producono "rilevabili", il nucleo decide e notifica.** Una sorgente sa solo trovare
i candidati vicini a un osservatore e descriverli in forma normalizzata:

```js
{
  key,            // identità stabile, per la deduplica
  skill,          // "prc" | "inv"
  dc,             // number
  point,          // {x, y} per la misura e per il test di visuale
  range,          // in unità di scena
  message,        // testo personalizzato, o null
  fallbackKey,    // chiave i18n di default per questo tipo di soggetto
  requiresSight,  // boolean
  hasSeen(),      // → boolean
  markSeen()      // → Promise
}
```

`hasSeen`/`markSeen` sono chiusure già legate alla **coppia osservatore/bersaglio**: è la sorgente
a costruirle, perché solo lei sa dove vive lo stato (flag sul behavior, sul muro o sul token). Il
nucleo non tocca mai un documento Foundry.

Come le tre sorgenti riempiono la forma:

| Campo | Region | Muro `SECRET` | Creatura nascosta |
|---|---|---|---|
| `skill` | dal behavior (`prc`/`inv`) | sempre `prc` | sempre `prc` |
| `dc` | dal behavior | flag sul muro, o default di mondo | `system.skills.ste.passive` del PNG |
| `point` | punto più vicino del bounding box | punto più vicino del segmento | centro del token |
| `range` | dal behavior | flag sul muro, o default di mondo | impostazione di mondo |
| `message` | dal behavior | flag sul muro | sempre `null` |
| stato | flag sul behavior | flag sul muro | `detectedBy` sul token |

`core/detection.js` non sa cosa siano trappole, porte o goblin. Riceve un osservatore e una lista
di rilevabili, e per ciascuno esegue sempre la stessa sequenza:

1. `hasSeen()` → se sì, salta (nessuna ripetizione)
2. distanza osservatore/`point` > `range` → salta
3. `requiresSight` e visuale bloccata → salta
4. `osservatore.system.skills[skill].passive >= dc` → esito
5. notifica secondo l'esito, poi `markSeen()`

Perché questo confine: aggiungere il motore 3 domani significa scrivere **una sola sorgente
nuova**, zero modifiche al nucleo. Ed è la parte testabile in isolamento, perché la persistenza
entra da callback e non da Foundry.

## Modello dati

### Region behavior

Tipo rinominato da `trapfinder.trapDetection` a **`trapfinder.passiveDetection`**.

| Campo | Tipo | Note |
|---|---|---|
| `events` | `_createEventsField({events: []})` | resta, per la ragione già documentata nel commento esistente |
| `skill` | StringField, scelte `prc`/`inv` | default `prc` |
| `dc` | NumberField | invariato, initial 15 |
| `range` | NumberField | invariato, initial 10 |
| `message` | StringField | nuovo, opzionale: testo mostrato al giocatore |
| `requiresSight` | BooleanField | nuovo, default `true` |

`skill` è un campo e non un tool separato perché trappola e indizio sono lo stesso identico
meccanismo: cambia solo quale passiva si legge.

### Muro porta segreta

Input `flags.trapfinder.<chiave>` iniettati nella scheda del muro, **salvati dal submit nativo
senza codice nostro**: `dc`, `range`, `message`.

Un muro `SECRET` **partecipa da solo** usando due nuove impostazioni di mondo (CD e raggio di
default); i campi sul muro sono override facoltativi. Senza i default il DM dovrebbe editare ogni
singola porta perché il tool faccia qualcosa.

Vedi "Impostazioni di mondo" più sotto per il conto complessivo.

### Token creatura nascosta

Nessuna CD salvata: è `system.skills.ste.passive` del PNG, letta al volo.

Unico stato: `flags.trapfinder.detectedBy`, l'elenco degli id degli attori PG che l'hanno
individuata. **Azzerato quando lo status `hiding` viene rimosso**, così una creatura che si
ri-nasconde dà a tutti una nuova occasione.

Serve anche un raggio di rilevamento delle creature come impostazione di mondo (default
proposto 30 unità). Senza limite, una passiva alta noterebbe un agguato dall'altro capo della mappa.

**Nessun messaggio personalizzato per le creature** in questo incremento: si usa sempre il testo
i18n di default. Un campo per-token esisterebbe solo per essere quasi sempre vuoto.

## Migrazione

Il tipo di un documento **non si può cambiare con un update**: la migrazione deve ricreare il
behavior, non modificarlo.

Procedura, una tantum al `ready`, solo sul GM attivo:

1. Per ogni scena, per ogni Region, per ogni behavior di tipo `trapfinder.trapDetection`:
   leggere `dc` e `range` dal `_source`, creare un behavior `trapfinder.passiveDetection` sulla
   stessa Region con quei valori, `skill: "prc"`, stesso `name` e stesso `disabled`, riportare il
   flag `notifiedActorIds`, quindi eliminare il vecchio.
2. Segnare l'avvenuta migrazione in un'impostazione di mondo `migrationVersion` (`config: false`).

**`module.json` deve dichiarare entrambi i tipi per una versione:**

```json
"documentTypes": { "RegionBehavior": { "trapDetection": {}, "passiveDetection": {} } }
```

Se `trapDetection` sparisse subito, i behavior esistenti diventerebbero di tipo sconosciuto prima
che la migrazione possa leggerli. La dichiarazione vecchia si rimuove in una release successiva,
quando la migrazione è certamente girata ovunque.

## Notifiche

```js
const owners = game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER"));
```

- **Riuscita** → whisper ai proprietari e al DM; toast ai proprietari **connessi**.
- **Fallimento** → whisper solo al DM, come oggi. Nessun toast: dire al giocatore che ha fallito
  è già un'informazione che il personaggio non ha.
- Il whisper resta nel log anche a giocatore offline, il toast no. Quindi **la chat è il canale
  affidabile e il toast è solo il richiamo d'attenzione**: non sono alternativi, il toast non
  sostituisce mai il messaggio.
- PG senza proprietario (un alleato di tipo `character` gestito dal DM): tutto al DM, nessun
  toast. Nessun caso rotto.
- Testo: `message` personalizzato se impostato, altrimenti la chiave i18n di default del soggetto.

Il socket (`game.socket.on("module.trapfinder", …)`) si registra in `main.js` al `ready`
**sempre**, non dietro un interruttore: costa zero ed evita che un tool acceso emetta verso
client privi di ascoltatore.

Avviso a schermo oltre al messaggio in chat: impostazione di mondo, default sì.

## Impostazioni di mondo

Il modulo passa da 2 voci in Configure Settings a 7. Resta una lista piatta leggibile, quindi
nessun menu dedicato: la soglia per rivedere questa scelta è indicativamente una decina di voci.

| Voce | Tipo | Default | Introdotta da |
|---|---|---|---|
| Rilevamento passivo | interruttore | off | questo incremento (ex Rilevamento Trappole) |
| Creature nascoste | interruttore | off | questo incremento |
| Scasso serrature | interruttore | off | esistente |
| CD di default porte segrete | numero | 15 | questo incremento |
| Raggio di default porte segrete | numero | 10 | questo incremento |
| Raggio rilevamento creature | numero | 30 | questo incremento |
| Avviso a schermo oltre alla chat | booleano | sì | questo incremento |

Più `migrationVersion`, non visibile (`config: false`).

Il README va aggiornato: oggi dichiara "sono solo due interruttori".

## Trigger

| Evento | Chi lo aggancia | Cosa fa |
|---|---|---|
| `moveToken` di un token PG | `passive-detection` | raccoglie Region e muri `SECRET` della scena entro raggio, li passa al nucleo |
| `moveToken` di un token PG | `hidden-creatures` | raccoglie le creature nascoste della scena entro raggio |
| `moveToken` di una creatura nascosta | `hidden-creatures` | raccoglie i PG entro raggio: il confronto è simmetrico, muoversi verso il gruppo espone tanto quanto il contrario |
| rimozione dello status `hiding` | `hidden-creatures` | azzera `flags.trapfinder.detectedBy` sul token |
| `createCombat` | `hidden-creatures` | propone la sorpresa |
| `renderWallConfig` | `passive-detection` | inietta i campi nella scheda muro |

I due strumenti registrano ciascuno il proprio `moveToken`, gestito dal rispettivo interruttore.
Restano indipendenti: nessuno dei due sa dell'altro. Tutti girano solo lato DM, come già oggi.

## Distanza e visuale

| Soggetto | Misura |
|---|---|
| Region | punto → bounding box (invariata, resta il commento sull'approssimazione) |
| Muro | punto → segmento su `wall.c` |
| Creatura | centro → centro |

Test di visuale, verificato sulla API v14.365:

```js
foundry.canvas.geometry.ClockwiseSweepPolygon.testCollision(
  origin, target, { type: "sight", mode: "any" }
) // true = muro in mezzo → salta
```

### Trabocchetto: la porta segreta è essa stessa un muro

Il test di visuale da un PG a un punto **sul** muro collide sempre col muro stesso: nessuna porta
segreta verrebbe mai rilevata.

Rimedio: misurare la visuale fino a un punto arretrato dal punto più vicino sul segmento verso
l'osservatore, di `canvas.grid.size / 2` pixel lungo il versore osservatore→punto. Se l'osservatore
dista meno di mezza casella dal muro il punto arretrato lo oltrepassa: in quel caso si salta del
tutto il test di visuale, perché a quella distanza il PG è comunque a contatto con la parete.

È l'unica parte di questo design dedotta e **non verificata** contro un modulo reale. Va provata
per prima in implementazione; se non regge, il ripiego è disattivare il test di visuale per le
sole porte segrete e affidarsi al solo raggio.

## Rete di sicurezza sui marcatori

Richiedere sia `token.hidden` sia lo status `hiding` significa che dimenticarne uno fa fallire
tutto **in silenzio**, che è il modo peggiore di fallire.

Mitigazione: quando il DM applica `hiding` a un token ancora visibile ai giocatori, o nasconde un
token con `hiding` senza lo status, parte una `ui.notifications` solo per lui che spiega che quella
creatura non partecipa al rilevamento. Nessuna correzione automatica: il modulo segnala, non
decide.

## Sorpresa

Il momento è **la creazione dell'incontro** (`createCombat`), non il suo avvio.

Motivo: dnd5e legge gli status **quando tira l'iniziativa**
(`initiativeDisadvantage: new Set(["incapacitated", "surprised"])`, `module/config.mjs:3813`).
Il flusso normale di Foundry è creare l'incontro → aggiungere i combattenti → tirare l'iniziativa
→ premere Inizia Combattimento. `combatStart` arriverebbe quindi **dopo** i tiri, e lo status
non darebbe alcuno svantaggio: esattamente la cosa per cui lo si applica.

Alla creazione dell'incontro i combattenti possono non essere ancora presenti, quindi la proposta
si basa sullo **stato della scena** — token PG contro creature nascoste presenti — che è comunque
il dato che il modulo già possiede. Il dialog scatta solo se esistono davvero creature nascoste
non individuate, quindi fuori dalle imboscate non disturba.

Alla conferma si applica `surprised` con `actor.toggleStatusEffect("surprised", { active: true })`.
`surprised` è `pseudo: true` in dnd5e, che significa "non compare nell'appendice delle condizioni
ma **funziona da status effect**" (`module/_types.mjs:600`): è un'icona normale dell'HUD del token.
Per questo non serve alcun pulsante di riserva — se la proposta sfugge, si applica a mano.

## Test

Vitest **solo su `core/`**, senza job CI.

Il nucleo è puro: la persistenza entra da callback (`hasSeen`/`markSeen`), quindi si prova senza
Foundry. È anche il punto dove un bug fallisce in silenzio al tavolo: deduplica, raggio, filtro di
visuale, passiva contro CD, scelta dei destinatari.

Dev-only: Foundry continua a caricare i moduli ES grezzi, non entra alcun bundler e la struttura di
`tools/` resta caricabile direttamente come oggi.

Le sorgenti (Region, muro, token) e le iniezioni di UI si verificano a mano al tavolo:

- trappola con CD e raggio, riuscita e fallimento
- indizio con investigazione passiva invece di percezione
- porta segreta con messaggio personalizzato, e la stessa dietro un muro
- creatura con entrambi i marcatori, con uno solo, e dopo che si ri-nasconde
- proposta di sorpresa, confermata e annullata
- una Region trappola creata prima della migrazione, che deve continuare a funzionare

## Rischi noti

| Rischio | Mitigazione |
|---|---|
| L'iniezione in `renderWallConfig` è verificata su wall-height v4.1.2, che dichiara `verified: 13`; il modulo punta a 14 | Provarla per prima; ripiego: dialog da pulsante nei controlli di scena, riusando il pattern DialogV2 già presente in `lockpicking` |
| ApplicationV2 può ri-renderizzare parzialmente e duplicare i campi iniettati | Guardia in testa all'hook: se l'input esiste già, uscire. wall-height la usa nell'hook delle luci ma non in quello dei muri |
| Il test di visuale verso una porta segreta collide col muro stesso | Punto arretrato di mezza casella; se non regge, niente test di visuale per le sole porte segrete |
| La migrazione ricrea documenti: se fallisce a metà, restano behavior duplicati | Eseguire per Region con `Promise.all` e segnare `migrationVersion` solo a fine ciclo completo |
| Marcatore dimenticato su una creatura → nessuna notifica, in silenzio | Notifica al solo DM quando i due marcatori sono incoerenti |

## Riferimenti verificati

- Iniezione di campi in una scheda di configurazione: [wall-height v4.1.2](https://github.com/theripper93/wall-height), `scripts/wall-height.js:108-135`. `html` è DOM nativo in v13+; un input chiamato `flags.<moduleId>.<chiave>` è salvato dal submit nativo senza codice aggiuntivo; `app.setPosition({height: "auto"})` dopo l'iniezione.
- [`ClockwiseSweepPolygon.testCollision`](https://foundryvtt.com/api/classes/foundry.canvas.geometry.ClockwiseSweepPolygon.html) — v14.365, `mode: "any"` restituisce un booleano.
- [`combatStart`](https://foundryvtt.com/api/functions/hookEvents.combatStart.html) — v14.365, scatta sul client che avvia, prima dell'update sul database. Non usato, ma è ciò che ha portato a scegliere `createCombat`.
- dnd5e: status `hiding` (`module/config.mjs:3875`), `surprised` (`3769`), `initiativeDisadvantage` (`3813`), semantica di `pseudo` (`module/_types.mjs:600`).
