# Riconoscimento mostri — design

Data: 2026-09-06
Stato: approvato in brainstorming (domande poste e risolte in chat), da tradurre in piano di
implementazione

## Obiettivo

Automatizzare il controllo "il PG riconosce questa creatura?" a inizio combattimento: si confronta
la conoscenza passiva corretta di ogni PG con una CD legata al Grado di Sfida del mostro, e se la
supera arriva in chat un messaggio con le informazioni sul mostro. Stesso principio guida degli
altri strumenti del modulo: **non si tira mai un dado**, si confronta un valore passivo con una CD.

Rispetto al Rilevamento Passivo esistente, qui il trigger non è un movimento nello spazio ma
l'inizio di un combattimento, e il "bersaglio" non è un punto sulla mappa ma un tipo di creatura.

## Ambito

Dentro:

- Database interno di mostri comuni (nome, tipo, abilità di conoscenza suggerita, descrizione)
  usato come proposta automatica.
- Un pannello ("Elenco Mostri") che elenca i PNG del mondo, mostra a quale mostro del database
  ciascuno corrisponde e permette di correggere l'abbinamento, scrivere una descrizione personale
  e correggere l'abilità.
- Controllo automatico all'inizio del combattimento (`combatStart`): ogni PNG ostile viene
  confrontato con ogni PG, e chi supera la CD riceve il messaggio.
- Per ogni PG, memoria di quali mostri (per nome/specie) ha già riconosciuto: alla prossima
  comparsa dello stesso tipo di mostro, niente controllo, messaggio diretto ma compatto.

Fuori, con spec propria in futuro:

- Importazione/pre-configurazione di mostri dai compendi non ancora presenti nel mondo. Il
  database serve solo ad abbinare per nome i PNG che il DM ha già piazzato: se non c'è
  corrispondenza, o se il DM vuole un'altra descrizione, il pannello lo lascia scegliere o
  scrivere a mano, ma non introduce un browser di compendio.
- CD personalizzabile a livello di mondo (es. modificatore fisso oltre a 10+GS). Nessuna richiesta
  in questo senso: se servirà, è un campo in più sul pannello, non un cambio di architettura.

## Decisioni e loro motivazione

### CD = 10 + GS, arrotondato per eccesso

`dc = 10 + Math.ceil(actor.system.details.cr)`. Il GS di un PNG in dnd5e è spesso frazionario
(1/8, 1/4, 1/2): sommarlo direttamente a 10 darebbe una CD non intera. Arrotondare per eccesso
tiene tutte le creature sotto GS 1 alla stessa CD 11 (tranne GS 0, che resta 10) invece di
introdurre una soglia finissima a metà via che nessuno al tavolo distinguerebbe a mente. Il GS
usato è sempre quello dell'Actor piazzato in quel momento, non un valore nel database dei mostri:
un boss rinominato con GS più alto del suo tipo base usa comunque il proprio GS reale.

### Il riconoscimento vale per nome/specie, non per singolo Actor

Riconoscere un Goblin vale per tutti i Goblin futuri di quel PG. È così che funziona la
conoscenza nelle regole (sai cos'è un tipo di creatura, non riconosci il singolo individuo), ed
è più semplice da tracciare: un solo flag sul PG (`recognizedMonsters`, elenco di chiavi) invece di
un elenco per ogni Actor/Token piazzato.

Conseguenza pratica: la chiave di riconoscimento **non è il nome letto sul token**, ma
l'identità di mostro risolta (vedi sotto "Abbinamento mostro"). Un "Goblin Sciamano" a cui il DM
ha associato manualmente la voce "goblin" del database viene ricordato come "goblin": se in
un'altra scena compare un semplice "Goblin" già riconosciuto, il PG lo riconosce subito.

### Database interno con corrispondenza per nome, non un browser di compendio

Il DM ha chiesto esplicitamente: un file con l'elenco di mostri e relative descrizioni, confrontato
per nome con i PNG già presenti nel mondo. Se il nome combacia (anche per alias, es. "Goblin" /
"goblin"), si propone la descrizione di serie. Se non c'è corrispondenza, non si inventa nulla: il
pannello lascia scegliere una voce del database da associare comunque (utile per varianti o nomi
in italiano diversi dal database) o scrivere una descrizione personalizzata da zero.

Il database è un file interno al modulo (`monster-database.js` + testi in `lang/*.json`, così le
descrizioni sono localizzate come il resto del modulo), non un servizio esterno: query di rete
non hanno senso in un modulo Foundry che deve restare offline-first.

**Set iniziale, non esaustivo.** La prima versione copre circa 60 creature comuni tra i 14 tipi
di dnd5e, scelte per frequenza al tavolo (umanoidi comuni, non-morti classici, bestie, alcuni
draghi cromatici, ecc.). Aggiungere un mostro significa aggiungere una voce a
`monsters-data.js` e le sue due chiavi di traduzione: nessun cambio di codice.

### Abbinamento mostro: automatico per nome, con override esplicito

```
overrideKey (flag sull'Actor) → voce del database scelta a mano
altrimenti: normalizza il nome dell'Actor e cerca una corrispondenza esatta (nome o alias)
```

Nessun match "fuzzy": un nome che non corrisponde non propone nulla di sbagliato, il DM lo
corregge una volta dal pannello e resta corretto per sempre (è un flag sull'Actor, non va
ripetuto). Preferito a un punteggio di somiglianza, che darebbe risultati imprevedibili silenziosi.

### Tipo e abilità: default per tipo di creatura, override per singolo mostro

Convenzione usata (estensione della tabella "Monster Knowledge Checks" di Xanathar's Guide, con
Folletti aggiunti sotto Natura perché non compaiono in quella tabella ma sono coerenti col resto
della voce):

| Abilità | Tipi |
|---|---|
| Arcano (`arc`) | Aberrazione, Costrutto, Drago, Elementale |
| Natura (`nat`) | Bestia, Pianta, Folletto |
| Religione (`rel`) | Non Morto, Celestiale, Immondo |
| Storia (`his`) | Gigante, Umanoide, Mostruosità |

Il tipo letto è sempre `system.details.type.value` del PNG piazzato (non quello del database): se
il DM ha un umanoide reskinnato come aberrazione, il modulo segue il tipo che il DM gli ha dato
sul foglio, non quello "di listino". Il tipo del database serve solo come ultima risorsa quando il
PNG non ha un tipo impostato. L'abilità calcolata resta sempre sovrascrivibile per singolo mostro
dal pannello (es. un lupo mannaro che si preferisce far riconoscere con Religione invece di
Natura).

### Nessuna correzione automatica se manca l'abilità

Un PNG ostile senza tipo risolvibile e senza override non può essere controllato: si salta quel
mostro per quell'incontro con un avviso solo al DM (`ui.notifications.warn`), sul modello della
"Rete di sicurezza sui marcatori" già usata da Creature Nascoste. Fallire in silenzio sarebbe
peggio: il DM crede che l'automazione stia girando e invece nessun PG viene mai avvisato.

### Trigger: `combatStart`, non `createCombat`

A differenza della proposta di sorpresa (che deve applicare uno status *prima* che dnd5e tiri
l'iniziativa, quindi non può aspettare `combatStart`), qui il momento giusto è proprio quando il
combattimento comincia davvero: i combattenti sono ormai tutti presenti e il tavolo si è appena
impegnato nello scontro. Non ha controindicazioni di tempistica come nel caso della sorpresa.

### Un solo controllo per coppia (PG, tipo di mostro) per incontro, non per token

Cinque Goblin nello stesso incontro producono **un solo** controllo/messaggio per PG (sul tipo
"goblin"), non cinque messaggi identici. I PNG ostili del combattimento vengono raggruppati per
identità di mostro risolta prima di girare il confronto.

### Riuscita → messaggio completo; già noto → messaggio compatto ma non nascosto

Alla prima riuscita: nome, descrizione (personalizzata se impostata, altrimenti quella del
database collegato, altrimenti una riga generica "hai riconosciuto il tipo di creatura ma nessuna
descrizione è stata impostata"), più la riga "riconosciuto grazie a [abilità] (CD [x])".

Se il PG ha già riconosciuto quel tipo di mostro: niente tiro, messaggio diretto ma dentro un
elemento HTML `<details>` **chiuso di default** — una riga sola in chat ("Già noto: Goblin"),
che il giocatore apre con un click solo se vuole rileggere la descrizione. Non si nasconde
l'informazione, la si comprime: chi vuole rileggerla può farlo in un click, chi la ricorda scorre
oltre senza restare bloccato da un paragrafo già letto.

Fallimento (non ancora noto, passiva sotto CD): nessun messaggio al giocatore, solo un whisper
al DM — stessa asimmetria di tutti gli altri strumenti del modulo (dire a un giocatore che ha
fallito gli rivela già che c'era qualcosa da notare).

### Destinatari e toast: riuso di `core/recipients.js`

`detectionRecipients` non sa nulla di trappole o mostri, prende solo `actor`, `spotted`,
`users`, `toastEnabled`: si presta 1:1 anche qui (`spotted` → "riconosciuto"), zero duplicazione.
Il toast riusa l'impostazione di mondo già esistente "Avviso a schermo oltre alla chat" — nessuna
nuova impostazione di mondo necessaria per questo.

### Pannello "Elenco Mostri" invece di un'iniezione sulla scheda PNG

Il DM ha chiesto esplicitamente un elenco (non solo un campo per singolo mostro), quindi un
pannello dedicato — via `game.settings.registerMenu`, coerente con la lista piatta di
Configure Settings già in uso — è la lettura più fedele della richiesta rispetto a iniettare
campi nella scheda di ogni singolo Actor NPC uno alla volta. Il pannello resta sempre disponibile
(registrato indipendentemente dall'interruttore dello strumento), per poter preparare le
descrizioni anche a strumento spento.

Ogni riga: nome del PNG, GS, tipo, abilità (select, che scrive sempre un override esplicito
sull'Actor — modello più semplice da ragionare del "scrivi solo se diverso dal default"), stato
descrizione (Personalizzata / da database "nome" / nessuna), pulsante "Modifica" che apre un
dialog con selezione del mostro di riferimento e testo personalizzato.

## Architettura

```
tools/monster-recognition/
  index.js                 toggle, registrazione del menu impostazioni, hook combatStart
  monsters-data.js          dati puri: chiave, nome, tipo, alias (nessun GS, nessuna descrizione:
                             le descrizioni vivono nei file lang/*.json, come il resto del modulo)
  monster-database.js       logica pura: normalizeName, findMonsterByName, skillForType,
                             computeIdentificationDC, evaluateRecognition — testabile senza Foundry
  profile.js                risolve il profilo di riconoscimento di un Actor NPC (tocca Foundry:
                             flag, system.details) e gestisce il flag di memoria sul PG
  chat.js                   costruisce e invia i messaggi (completo / compatto / whisper fallimento)
  combat-hook.js            hook combatStart: raggruppa i PNG ostili per identità, valuta ogni PG
  monster-list-app.js       ApplicationV2 "Elenco Mostri"
```

Stessa separazione già usata dal resto del modulo: la parte pura (corrispondenza nome, mappa
tipo→abilità, formula della CD, decisione riconosciuto/mancato/già noto) sta in un file senza
`Hooks`/`game`/`Actor`, testabile con Vitest; il resto tocca documenti Foundry e si verifica a
mano al tavolo.

## Modello dati

### Flag sul PNG (il mostro)

| Flag | Tipo | Note |
|---|---|---|
| `monsterKey` | string | Voce del database associata manualmente. Vuoto = usa la corrispondenza automatica per nome. |
| `descriptionOverride` | string | Testo che sostituisce la descrizione del database. Vuoto = usa quella del mostro abbinato. |
| `skillOverride` | string | Una delle 18 abilità dnd5e. Scritto sempre dal pannello quando il DM tocca la select di quel mostro. Vuoto = usa il default per tipo. |

### Flag sul PG (il giocatore)

| Flag | Tipo | Note |
|---|---|---|
| `recognizedMonsters` | string[] | Chiavi di mostro (database o nome normalizzato) già riconosciute da questo PG. Non si azzera mai automaticamente: è conoscenza del personaggio, non uno stato di scena. |

## Trigger

| Evento | Cosa fa |
|---|---|
| `combatStart` | Prende i combattenti PNG ostili del Combat, li raggruppa per identità di mostro risolta, e per ciascun gruppo valuta ogni PG nel combattimento |
| `renderSettingsConfig` (via `registerMenu`) | Apre il pannello "Elenco Mostri" |

Gira solo lato DM (`game.user.isGM`), come tutto il resto del modulo.

## Test

Vitest sulla parte pura di `tools/monster-recognition/monster-database.js`:

- `normalizeName` con maiuscole, spazi ed accenti
- `findMonsterByName` con corrispondenza esatta, per alias, e nessuna corrispondenza
- `skillForType` per ciascuno dei 14 tipi dnd5e, e `null` per un tipo sconosciuto
- `computeIdentificationDC` con GS intero, frazionario e zero
- `evaluateRecognition` per i tre esiti: già noto, riconosciuto, mancato

Verifica a mano al tavolo: pannello (abbinamento automatico, override, descrizione personalizzata),
un incontro con più mostri dello stesso tipo (un solo messaggio per PG), un PG che rivede lo stesso
tipo di mostro in un incontro successivo (messaggio compatto), un PNG ostile senza tipo risolvibile
(avviso al DM, nessun crash).
