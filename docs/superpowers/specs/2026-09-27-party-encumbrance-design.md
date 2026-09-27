# Ingombro della cassa comune — design

Data: 2026-09-27
Stato: approvato in brainstorming (domande poste e risolte in chat), da tradurre in piano di
implementazione

## Obiettivo

Il party usa un attore **Gruppo** di dnd5e come cassa comune (monete, equipaggiamento da vendere).
In dnd5e il Gruppo non ha un ingombro proprio: gli oggetti che contiene non pesano su nessuno, come
una borsa senza fondo. Nelle regole invece qualcuno deve portarli.

Lo strumento fa ricadere il peso della cassa sui membri del Gruppo, in una di tre modalità scelte
dal DM sulla scheda Gruppo, e permette di limitare la distribuzione a un sottoinsieme di membri
(es. solo il mulo da soma, o solo il guerriero e il barbaro).

Non è una house rule: non cambia una regola, fa valere quella vera. Per questo vive nel GM Toolkit e
non in `dnd5e-house-rules`.

## Ambito

Dentro:

- Nuovo strumento `party-encumbrance` (cartella `tools/party-encumbrance/`), con interruttore on/off
  in Configure Settings, disattivato di default, `requiresReload: true` come gli altri.
- Quota **virtuale**: gli oggetti restano nel Gruppo, a ogni portatore viene sommata al volo la sua
  parte di peso nel calcolo dell'ingombro. Niente viene scritto sui PG.
- Tre modalità di distribuzione più "Nessuna", scelte per singolo Gruppo dalla sua scheda.
- Scelta dei portatori per singolo membro, dalla scheda Gruppo.
- Tooltip sulla barra d'ingombro di PG e PNG che spiega quanta parte arriva dalla cassa.
- Stato di ingombro (effetti nativi di dnd5e) coerente con la quota.
- Lingua base inglese (`lang/en.json`), localizzazione italiana completa (`lang/it.json`), e un test
  che verifica l'allineamento delle chiavi fra le due lingue.

Fuori:

- **Veicoli** come portatori. dnd5e ha già la sua funzione nativa per il carro: un Veicolo membro
  del Gruppo impostato come "veicolo primario", con l'inventario del Gruppo che punta al veicolo e la
  capacità data dagli animali da tiro. I Veicoli non compaiono fra i portatori e non ricevono quota.
- Soglie della regola **Variante** d'ingombro nel calcolo del "carico disponibile". Il mondo usa la
  regola Standard: il carico disponibile si misura sulla capacità massima. Gli status della Variante
  restano comunque corretti, perché li applica dnd5e sul valore finale.
- Spostamento fisico degli oggetti dal Gruppo ai PG.

## Compatibilità verificata

Letto il sorgente di dnd5e **5.3.3** e **6.0.5** (entrambi compatibili con Foundry v14): i punti di
aggancio sotto sono identici nelle due versioni.

- `dnd5e.dataModels.actor.AttributesFields.prepareEncumbrance` (statico) calcola l'ingombro. È
  chiamato come `AttributesFields.prepareEncumbrance.call(this, rollData)` da `CharacterData`,
  `NPCData` e `VehicleData#prepareDerivedData`, quindi sostituire la proprietà statica ha effetto
  su tutte le chiamate. Scrive `encumbrance.value`, `thresholds`, `max`, `mod`, `stops`, `pct`,
  `encumbered`. Nessun altro calcolo derivato legge `encumbrance`: la riduzione di velocità passa
  dagli effetti di stato.
- `Actor5e#updateEncumbrance()` crea/aggiorna/cancella l'effetto di stato d'ingombro in base a
  `encumbrance.value` e alle soglie. dnd5e la chiama solo quando cambiano l'attore o i suoi
  oggetti, e solo sul client di chi ha fatto la modifica.
- `GroupData.members` è un array di `{ actor }` già filtrato (attori mancanti, gruppi annidati,
  duplicati) in `prepareBaseData`.
- `GroupActorSheet` (ApplicationV2): nella scheda Inventario c'è una colonna laterale con una card
  `.encumbrance.card[data-uuid]` per ogni membro (Veicolo primario escluso se l'inventario punta a
  lui), con la barra nativa letta da `actor.system.attributes.encumbrance`.
- Il flag `dnd5e.inventorySource` del Gruppo (`"group"` o `"vehicle"`) decide se l'inventario
  mostrato è quello del Gruppo o del veicolo primario.

## Decisioni e loro motivazione

### Quota calcolata al volo, non Effetto Attivo né spostamento

Tre alternative valutate:

1. **Wrapper su `prepareEncumbrance`** (scelta). Dopo il calcolo originale si aggiunge la quota a
   `encumbrance.value` e si ricalcolano `pct` ed `encumbered`. È dato derivato: si ricalcola da solo,
   ogni client ottiene lo stesso risultato dagli stessi dati, spegnere lo strumento riporta tutto al
   nativo senza pulizia.
2. **Effetto Attivo sui membri.** dnd5e non ha un campo "peso extra": si potrebbe solo abbassare la
   capacità, e la barra mostrerebbe numeri falsi. In più andrebbero scritti e tenuti sincronizzati
   documenti su ogni PG.
3. **Spostare gli oggetti nei PG.** Non è ciò che si vuole: la cassa comune deve restare.

Il wrapper passa da libWrapper (o dallo shim già incluso in `lib/`), come lo scasso serrature.
Tipo `WRAPPER`: il calcolo originale viene sempre eseguito per primo, così un errore dello strumento
non può impedire a dnd5e di calcolare l'ingombro. Target:
`dnd5e.dataModels.actor.AttributesFields.prepareEncumbrance`. È un metodo statico: va verificato in
Foundry che libWrapper e lo shim lo avvolgano correttamente. Se non ci riescono, il ripiego è
sostituire la proprietà statica a mano, conservando l'originale.

### Una scelta per singolo Gruppo, non solo il Gruppo principale

La modalità vive su ogni Gruppo, con `none` come default. Funziona anche se il DM non ha impostato
il Gruppo principale di dnd5e, e non serve un interruttore separato: "Nessuna" è la posizione spenta.
Un attore che sta in più Gruppi attivi riceve la somma delle quote.

### Si esclude, non si include

Il flag conserva i membri **esclusi**, non i portatori. Di default portano tutti (il caso comune non
richiede nessuna configurazione); per dare tutto al mulo si tolgono le spunte agli altri. Se nessuno
porta, il peso non viene distribuito e la scheda lo dice: niente ripiego silenzioso su "tutti",
coerente con il resto del modulo.

### Solo il DM configura

Il menu della modalità e le spunte dei portatori sono modificabili solo dal DM. I giocatori vedono le
stesse informazioni in sola lettura. Evita che la distribuzione cambi a metà sessione senza che il
DM se ne accorga.

### "Carico disponibile" si misura sulla capacità massima

Il mondo usa la regola d'ingombro Standard: l'unica soglia che conta è la capacità massima
(`thresholds.maximum`, 15 × FOR per taglia media). Disponibile = `max(0, capacità − peso proprio)`.

### Se sono tutti pieni, si passa a "capacità massima"

In modalità "carico disponibile", se la somma dei disponibili è 0 la formula dividerebbe per zero e il
peso sparirebbe. Si usa allora la ripartizione per capacità massima: tutti vanno oltre in proporzione,
che è ciò che succede davvero a un party sovraccarico.

## Architettura

```
tools/party-encumbrance/
  index.js                  registrazione dello strumento (toggle, onReady)
  allocate.js               funzione pura: peso cassa + portatori + modalità → quote
  stash.js                  peso della cassa di un Gruppo; lettura del flag; elenco portatori
  encumbrance-wrapper.js    wrapper su prepareEncumbrance
  refresh.js                ricalcolo delle quote e aggiornamento degli attori interessati
  group-sheet.js            controlli sulla scheda Gruppo
  actor-sheet.js            tooltip sulla barra d'ingombro di PG e PNG
tests/
  party-encumbrance.test.js allocate() e peso della cassa
  lang.test.js              allineamento chiavi en/it
```

### Dati

Flag sul Gruppo, sotto lo scope del modulo, chiave `partyEncumbrance` (aggiunta a `FLAGS` in
`scripts/constants.js`):

```js
{ mode: "none" | "equal" | "available" | "maximum", excluded: string[] /* actor id */ }
```

Assente equivale a `{ mode: "none", excluded: [] }`.

Portatori di un Gruppo: membri con `type` `character` o `npc`, il cui id non è in `excluded`.

### `allocate.js` (puro)

```js
/**
 * @param {number} weight                 Peso della cassa, nelle unità di default del mondo.
 * @param {{id: string, own: number, max: number}[]} carriers
 * @param {"equal"|"available"|"maximum"} mode
 * @returns {Map<string, number>}          Quota per id, arrotondata a 0,1.
 */
export function allocate(weight, carriers, mode) {}
```

- `weight <= 0` o nessun portatore: mappa vuota.
- `equal`: `weight / n`.
- `available`: `weight × disp_i / Σdisp`, con `disp_i = max(0, max_i − own_i)`. Se `Σdisp = 0` si
  usa `maximum`.
- `maximum`: `weight × max_i / Σmax`. Se `Σmax = 0` si usa `equal`.
- Arrotondamento a 0,1 come dnd5e (`Math.round(x * 10) / 10`, stesso effetto di `toNearest(0.1)`,
  che nei test fuori Foundry non esiste).

Una seconda funzione pura somma le mappe di più Gruppi: `mergeShares(maps) → Map<id, {total,
bySource: [{groupId, groupName, share}]}>`. `bySource` alimenta il tooltip.

### `stash.js`

- `stashWeight(group)`: somma di `item.system.totalWeightIn?.(unità)` sugli oggetti del Gruppo con
  `!item.container` (i contenitori includono il loro contenuto, e una borsa conservante resta leggera
  come vuole dnd5e); più le monete se `game.settings.get("dnd5e", "currencyWeight")`, con la stessa
  formula di `prepareEncumbrance` (`CONFIG.DND5E.encumbrance.currencyPerWeight`). Unità: quelle di
  default del mondo (`CONFIG.DND5E.encumbrance.baseUnits.default`, imperiale o metrica secondo
  `metricWeightUnits`), le stesse di PG e PNG.
- Per essere testabile senza Foundry, riceve le dipendenze (oggetti, valute, impostazioni, config)
  come argomenti; il codice Foundry-dipendente è un sottile adattatore sopra.
- `readConfig(group)`: flag con i default.
- `carriersOf(group)`: portatori come sopra.

### `encumbrance-wrapper.js`

Dopo la chiamata originale, per attori `character` o `npc`:

1. Salva il peso proprio: `encumbrance.stash = { own: encumbrance.value, share: 0, bySource: [] }`.
   Lo salva sempre, anche a quota zero, perché `refresh.js` lo legge per la modalità "carico
   disponibile".
2. Se la mappa corrente (cache del modulo, calcolata da `refresh.js`) ha una quota per `actor.id`:
   `value = (own + share)` arrotondato a 0,1, `pct` ricalcolato con la stessa formula nativa
   (`clamp(value × 100 / max, 0, 100)`), `encumbered` ricalcolato come nativo, `stash.share` e
   `stash.bySource` valorizzati.

Il wrapper non calcola le quote: le legge soltanto. Così non dipende dall'ordine in cui Foundry
prepara gli attori all'avvio.

### `refresh.js`

`recompute()`:

1. Per ogni attore di tipo `group` con modalità diversa da `none`: peso della cassa, portatori con
   `{ id, own: encumbrance.stash?.own ?? encumbrance.value, max: encumbrance.max }`, `allocate()`.
2. `mergeShares()` delle mappe.
3. Confronto con la mappa precedente: sostituisce la cache, poi per ogni attore la cui quota è
   cambiata (compresi quelli che l'hanno persa) chiama `actor.reset()` (ri-prepara i dati derivati
   leggendo la nuova cache) e ne ridisegna le schede aperte. Ridisegna anche le schede dei Gruppi
   attivi.
4. Solo sul DM attivo (`game.users.activeGM?.isSelf`), per gli attori cambiati:
   `actor.updateEncumbrance()`, così l'effetto di stato segue la quota anche quando a cambiare è
   la cassa e non l'attore.

Quando si esegue: una volta su `ready` (a quel punto tutti gli attori e gli oggetti dei Gruppi sono
preparati), poi con `foundry.utils.debounce` (~100 ms) su:

- `createItem`, `updateItem`, `deleteItem`: oggetti della cassa o dei membri;
- `updateActor`, `deleteActor`: flag e membri del Gruppo, monete, FOR, taglia, `powerfulBuild`;
- `createActiveEffect`, `updateActiveEffect`, `deleteActiveEffect`: effetti che cambiano FOR o
  capacità;
- `updateSetting` per `dnd5e.currencyWeight`, `dnd5e.metricWeightUnits`, `dnd5e.encumbrance`.

Niente loop: `actor.reset()` non scatena hook di aggiornamento, e l'effetto di stato creato da
`updateEncumbrance()` innesca un ricalcolo che trova le stesse quote e si ferma.

Il ricalcolo è economico (pochi Gruppi, pochi membri), per questo si scatena su tutti questi eventi
senza filtrare in anticipo quale documento sia coinvolto.

### `group-sheet.js`

Hook `renderGroupActorSheet`, solo se la scheda Inventario è nel DOM.

- In cima al corpo dell'inventario: "Stash weight: 184.5 lb" e il menu della modalità (DM) o il suo
  testo (giocatori). Con "Nessuna" resta visibile il peso, così il DM lo vede prima di scegliere.
- In ogni card `.encumbrance.card[data-uuid]` di un membro `character` o `npc`: spunta "Carries" (DM)
  o icona ✓/✗ (giocatori), e "Stash share: 46 lb" quando la quota è diversa da zero.
- Avviso sotto il menu se la modalità è attiva ma non c'è nessun portatore: "No carriers: the stash
  weighs on no one".
- Il cambio di modalità o di spunta è un `group.setFlag(...)`: il ricalcolo parte dall'hook
  `updateActor`.

### `actor-sheet.js`

Hook di render delle schede PG e PNG di dnd5e: se `encumbrance.stash.share > 0`, aggiunge un
`data-tooltip` alla barra `.meter.progress` d'ingombro con una riga per Gruppo: "Of which 46 lb from
The Company's stash".

### Localizzazione

Tutte le stringhe in `lang/en.json` (lingua base, ripiego di Foundry) e `lang/it.json`, sotto
`DND5E_GM_TOOLKIT.tools.partyEncumbrance.*`. Nessun testo scritto a mano nel codice. Le etichette
d'esempio in inglese sopra sono indicative; la traduzione italiana va scritta per intero, non
lasciata al ripiego.

## Casi limite

| Caso | Comportamento |
|---|---|
| Nessun portatore | Peso non distribuito, avviso sulla scheda Gruppo. |
| Tutti pieni in "carico disponibile" | Ripartizione per capacità massima. |
| Attore in più Gruppi attivi | Somma delle quote, dettaglio per Gruppo nel tooltip. |
| Cassa vuota o modalità "Nessuna" | Quota zero, barra identica alla nativa. |
| Membro eliminato o tolto dal Gruppo | Già scartato da dnd5e; al ricalcolo la quota sparisce. |
| Inventario del Gruppo sul veicolo primario | Si distribuiscono solo gli oggetti rimasti nel Gruppo. |
| Token non collegato di un membro | Condivide l'id dell'attore base, quindi eredita la quota. |
| Strumento spento | Wrapper non registrato, comportamento nativo, nessuna pulizia. |
| libWrapper assente | Shim incluso in `lib/`. |
| Monete | Pesano solo con "currency weight" di dnd5e attivo. |
| Unità metriche | Cassa calcolata nelle stesse unità dei PG. |

Errori: se il ricalcolo di un Gruppo lancia, l'errore va in console (`console.error` con prefisso del
modulo), quel Gruppo viene saltato e gli altri proseguono. Il wrapper avvolge la propria parte in
`try/catch` dopo la chiamata originale: in caso di errore l'ingombro resta quello nativo.

## Test

Automatici (vitest, `npm test`):

- `allocate()`: le tre modalità; ripiego di "available" su "maximum"; ripiego di "maximum" su
  "equal" con capacità nulle; nessun portatore; peso zero o negativo; portatore unico (riceve tutto);
  portatore con peso proprio oltre la capacità (disponibile 0); arrotondamento a 0,1.
- `mergeShares()`: somma di più Gruppi e dettaglio per fonte.
- Peso della cassa: oggetti al primo livello, oggetti in contenitore non contati due volte, monete
  con impostazione attiva e spenta.
- `lang.test.js`: ogni chiave di `en.json` esiste in `it.json` e viceversa (copre anche gli
  strumenti esistenti).

Manuali in Foundry (checklist nel piano):

1. Attivare lo strumento, mettere oggetti nel Gruppo, scegliere ciascuna modalità: le barre dei membri
   nella scheda Gruppo e sulle schede PG cambiano di conseguenza.
2. Togliere la spunta a tutti tranne il mulo: tutto il peso va al mulo.
3. Togliere tutte le spunte: compare l'avviso, le barre tornano native.
4. Da giocatore: menu e spunte non modificabili, tooltip visibile sulla propria scheda.
5. Superare la capacità con la sola quota: compare lo stato d'ingombro; svuotare la cassa: sparisce.
6. Spegnere lo strumento e ricaricare: barre native.
7. Verificare su dnd5e 5.3.x e 6.0.x.

## Documentazione e rilascio

- Voce nel README sotto "Strumenti disponibili".
- `tools/index.js`: importare e registrare lo strumento.
- Il workflow di release zippa l'intera cartella `tools/`: nessuna modifica necessaria.
